"""Policy-as-code rules evaluated against a Terraform plan.

Every rule has a stable ID, a severity, a category and a remediation, so a
finding in a CI log is actionable on its own. Rules only read the planned
state (`after`) of resources being created/updated, except change-safety
rules, which look at deletes and replacements.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from typing import Any

from .plan import Plan, ResourceChange

SEVERITIES = ("critical", "high", "medium", "low")
SEV_RANK = {s: i for i, s in enumerate(reversed(SEVERITIES))}  # low=0 … critical=3
OPEN_CIDRS = {"0.0.0.0/0", "::/0"}
ADMIN_PORTS = {22: "SSH", 3389: "RDP"}
STATEFUL = {
    "aws_db_instance",
    "aws_rds_cluster",
    "aws_s3_bucket",
    "aws_ebs_volume",
    "aws_dynamodb_table",
    "aws_efs_file_system",
    "aws_elasticache_cluster",
    "aws_elasticache_replication_group",
}


@dataclass(frozen=True)
class Rule:
    id: str
    title: str
    severity: str
    category: str  # security | cost | reliability | change-safety
    remediation: str
    reference: str


@dataclass(frozen=True)
class Finding:
    rule_id: str
    title: str
    severity: str
    category: str
    address: str
    detail: str
    remediation: str
    reference: str


RULES: dict[str, Rule] = {}
_CHECKS: list[Callable[[Plan], Iterable[tuple[str, str, str]]]] = []


def rule(id: str, title: str, severity: str, category: str, remediation: str, reference: str):
    assert severity in SEVERITIES
    RULES[id] = Rule(id, title, severity, category, remediation, reference)

    def deco(fn: Callable[[Plan], Iterable[tuple[str, str]]]):
        def wrapped(plan: Plan):
            for address, detail in fn(plan):
                yield id, address, detail

        _CHECKS.append(wrapped)
        return fn

    return deco


# ----------------------------------------------------------------- helpers


def _live(plan: Plan, *types: str) -> Iterable[ResourceChange]:
    """Resources that will exist after apply (create / update / replace / no-op)."""
    for rc in plan.changes:
        if rc.type in types and rc.after is not None and rc.action != "delete":
            yield rc


def _blocks(value: Any) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [v for v in value if isinstance(v, dict)]
    if isinstance(value, dict):
        return [value]
    return []


def _ingress_rules(plan: Plan) -> Iterable[tuple[str, int, int, str, list[str]]]:
    """(address, from_port, to_port, protocol, cidrs) for every ingress rule in the plan."""
    for rc in _live(plan, "aws_security_group"):
        for b in _blocks(rc.after.get("ingress")):
            cidrs = list(b.get("cidr_blocks") or []) + list(b.get("ipv6_cidr_blocks") or [])
            yield rc.address, int(b.get("from_port") or 0), int(b.get("to_port") or 0), str(b.get("protocol")), cidrs
    for rc in _live(plan, "aws_security_group_rule"):
        if rc.after.get("type") == "ingress":
            a = rc.after
            cidrs = list(a.get("cidr_blocks") or []) + list(a.get("ipv6_cidr_blocks") or [])
            yield rc.address, int(a.get("from_port") or 0), int(a.get("to_port") or 0), str(a.get("protocol")), cidrs
    for rc in _live(plan, "aws_vpc_security_group_ingress_rule"):
        a = rc.after
        cidrs = [c for c in (a.get("cidr_ipv4"), a.get("cidr_ipv6")) if c]
        proto = str(a.get("ip_protocol"))
        yield rc.address, int(a.get("from_port") or 0), int(a.get("to_port") or 0), proto, cidrs


def _all_traffic(proto: str, lo: int, hi: int) -> bool:
    return proto in ("-1", "all") or (lo <= 0 and hi >= 65535)


# ----------------------------------------------------------------- security


@rule(
    "PG-SEC-001",
    "Admin port (SSH/RDP) open to the internet",
    "critical",
    "security",
    "Restrict the source CIDR to your own IP or VPN, or use AWS Systems Manager Session Manager instead of SSH.",
    "CIS AWS Foundations 5.2 / 5.3",
)
def _admin_ports(plan: Plan):
    for addr, lo, hi, proto, cidrs in _ingress_rules(plan):
        open_ = OPEN_CIDRS.intersection(cidrs)
        if not open_ or _all_traffic(proto, lo, hi):
            continue
        for port, name in ADMIN_PORTS.items():
            if lo <= port <= hi:
                yield addr, f"{name} port {port} reachable from {', '.join(sorted(open_))}"


@rule(
    "PG-SEC-002",
    "All ports open to the internet",
    "high",
    "security",
    "Open only the ports the service needs (e.g. 443) and keep everything else closed.",
    "AWS Well-Architected SEC05",
)
def _all_open(plan: Plan):
    for addr, lo, hi, proto, cidrs in _ingress_rules(plan):
        if OPEN_CIDRS.intersection(cidrs) and _all_traffic(proto, lo, hi):
            yield addr, f"protocol {proto}, ports {lo}-{hi} reachable from the internet"


@rule(
    "PG-SEC-003",
    "IAM policy grants Action:* on Resource:*",
    "critical",
    "security",
    "Grant only the specific actions and resource ARNs the workload needs (least privilege).",
    "CIS AWS Foundations 1.16",
)
def _iam_star(plan: Plan):
    for rc in _live(plan, "aws_iam_policy", "aws_iam_role_policy", "aws_iam_user_policy", "aws_iam_group_policy"):
        doc = rc.after.get("policy")
        if not isinstance(doc, str):
            continue
        try:
            stmts = json.loads(doc).get("Statement", [])
        except (json.JSONDecodeError, AttributeError):
            continue
        for st in stmts if isinstance(stmts, list) else [stmts]:
            if st.get("Effect") != "Allow":
                continue
            actions = st.get("Action")
            resources = st.get("Resource")
            actions = actions if isinstance(actions, list) else [actions]
            resources = resources if isinstance(resources, list) else [resources]
            if "*" in actions and "*" in resources:
                yield rc.address, "statement allows every action on every resource"


@rule(
    "PG-SEC-004",
    "S3 bucket ACL makes objects public",
    "high",
    "security",
    "Remove the public ACL; serve public content through CloudFront with Origin Access Control instead.",
    "CIS AWS Foundations 2.1.4",
)
def _s3_acl(plan: Plan):
    for rc in _live(plan, "aws_s3_bucket", "aws_s3_bucket_acl"):
        acl = rc.after.get("acl")
        if acl in ("public-read", "public-read-write", "authenticated-read"):
            yield rc.address, f"acl = {acl!r}"


@rule(
    "PG-SEC-005",
    "S3 bucket without a full public access block",
    "high",
    "security",
    "Add aws_s3_bucket_public_access_block with all four settings set to true.",
    "CIS AWS Foundations 2.1.4",
)
def _s3_pab(plan: Plan):
    buckets = [rc for rc in _live(plan, "aws_s3_bucket") if rc.action in ("create", "replace")]
    blocks = list(_live(plan, "aws_s3_bucket_public_access_block"))
    keys = ("block_public_acls", "block_public_policy", "ignore_public_acls", "restrict_public_buckets")
    for b in blocks:
        off = [k for k in keys if b.after.get(k) is not True]
        if off:
            yield b.address, f"disabled: {', '.join(off)}"
    if len(blocks) < len(buckets):
        for rc in buckets[len(blocks) :] if blocks else buckets:
            yield rc.address, "no aws_s3_bucket_public_access_block for this bucket in the plan"


@rule(
    "PG-SEC-006",
    "Database is publicly accessible",
    "critical",
    "security",
    "Set publicly_accessible = false and reach the database from inside the VPC (bastion/SSM/VPN).",
    "AWS Foundational Security Best Practices RDS.2",
)
def _rds_public(plan: Plan):
    for rc in _live(plan, "aws_db_instance"):
        if rc.after.get("publicly_accessible") is True:
            yield rc.address, "publicly_accessible = true"


@rule(
    "PG-SEC-007",
    "Database storage not encrypted",
    "high",
    "security",
    "Set storage_encrypted = true (it cannot be enabled later without a snapshot restore).",
    "AWS Foundational Security Best Practices RDS.3",
)
def _rds_enc(plan: Plan):
    for rc in _live(plan, "aws_db_instance"):
        if rc.after.get("storage_encrypted") is not True:
            yield rc.address, "storage_encrypted is not true"


@rule(
    "PG-SEC-008",
    "EBS volume not encrypted",
    "medium",
    "security",
    "Set encrypted = true on volumes and root_block_device, or enable EBS encryption by default.",
    "AWS Foundational Security Best Practices EC2.3",
)
def _ebs_enc(plan: Plan):
    for rc in _live(plan, "aws_ebs_volume"):
        if rc.after.get("encrypted") is not True:
            yield rc.address, "encrypted is not true"
    for rc in _live(plan, "aws_instance"):
        for b in _blocks(rc.after.get("root_block_device")):
            if b.get("encrypted") is not True:
                yield rc.address, "root_block_device.encrypted is not true"


@rule(
    "PG-SEC-009",
    "Instance metadata allows IMDSv1",
    "medium",
    "security",
    'Add metadata_options { http_tokens = "required" } to enforce IMDSv2.',
    "AWS Foundational Security Best Practices EC2.8",
)
def _imds(plan: Plan):
    for rc in _live(plan, "aws_instance"):
        opts = _blocks(rc.after.get("metadata_options"))
        if not opts or opts[0].get("http_tokens") != "required":
            yield rc.address, 'http_tokens is not "required"'


@rule(
    "PG-SEC-010",
    "KMS key rotation disabled",
    "low",
    "security",
    "Set enable_key_rotation = true.",
    "CIS AWS Foundations 3.6",
)
def _kms(plan: Plan):
    for rc in _live(plan, "aws_kms_key"):
        if rc.after.get("enable_key_rotation") is not True:
            yield rc.address, "enable_key_rotation is not true"


# ----------------------------------------------------------------- cost


@rule(
    "PG-COST-001",
    "NAT gateway has a fixed hourly cost",
    "medium",
    "cost",
    "For labs, use public subnets or VPC endpoints for S3/DynamoDB; share one NAT across AZs only if acceptable.",
    "AWS VPC pricing",
)
def _nat(plan: Plan):
    for rc in _live(plan, "aws_nat_gateway"):
        if rc.action in ("create", "replace"):
            yield rc.address, "≈ $32.85/month before any data processing ($0.045/GB)"


@rule(
    "PG-COST-002",
    "gp2 storage where gp3 is cheaper",
    "low",
    "cost",
    "Use gp3: about 20% cheaper per GB with a 3,000 IOPS baseline.",
    "Amazon EBS pricing",
)
def _gp2(plan: Plan):
    for rc in _live(plan, "aws_ebs_volume"):
        if rc.after.get("type") == "gp2":
            yield rc.address, "type = gp2"
    for rc in _live(plan, "aws_instance"):
        for b in _blocks(rc.after.get("root_block_device")):
            if b.get("volume_type") == "gp2":
                yield rc.address, "root volume_type = gp2"


@rule(
    "PG-COST-003",
    "EKS control plane costs $73/month per cluster",
    "medium",
    "cost",
    "For small or learning workloads consider ECS, a single EC2 host, or a local Kind cluster.",
    "Amazon EKS pricing",
)
def _eks(plan: Plan):
    for rc in _live(plan, "aws_eks_cluster"):
        if rc.action in ("create", "replace"):
            yield rc.address, "≈ $73/month before any worker nodes"


@rule(
    "PG-COST-004",
    "Multi-AZ database doubles the instance cost",
    "medium",
    "cost",
    "Keep Multi-AZ for production; use single-AZ for dev, test and labs.",
    "Amazon RDS pricing",
)
def _multi_az(plan: Plan):
    for rc in _live(plan, "aws_db_instance"):
        if rc.after.get("multi_az") is True:
            yield rc.address, "multi_az = true"


@rule(
    "PG-COST-005",
    "Large instance size",
    "medium",
    "cost",
    "Start small (t3/t4g) and scale on measured CPU/memory; right-size before committing.",
    "AWS Well-Architected COST06",
)
def _big(plan: Plan):
    for rc in _live(plan, "aws_instance"):
        itype = str(rc.after.get("instance_type") or "")
        size = itype.split(".")[-1]
        if "xlarge" in size or (not itype.startswith(("t3", "t4g", "t2")) and size == "large"):
            yield rc.address, f"instance_type = {itype}"


@rule(
    "PG-COST-006",
    "Elastic IP not attached to anything",
    "low",
    "cost",
    "Attach the EIP to an instance/ENI or remove it — idle public IPv4 addresses are billed.",
    "AWS public IPv4 pricing",
)
def _eip(plan: Plan):
    for rc in _live(plan, "aws_eip"):
        a = rc.after
        unknown = rc.after_unknown or {}
        if (
            not a.get("instance")
            and not a.get("network_interface")
            and not unknown.get("instance")
            and not unknown.get("network_interface")
        ):
            yield rc.address, "no instance or network_interface set"


# ----------------------------------------------------------------- reliability & change safety


@rule(
    "PG-CHG-001",
    "Stateful resource will be destroyed",
    "critical",
    "change-safety",
    "Check whether the change forces replacement; use lifecycle { prevent_destroy = true } and take a backup first.",
    "Terraform lifecycle meta-argument",
)
def _destroy(plan: Plan):
    for rc in plan.changes:
        if rc.type in STATEFUL and rc.action in ("delete", "replace"):
            yield rc.address, f"action = {rc.action} — data in this resource can be lost"


@rule(
    "PG-REL-001",
    "Database deletion protection is off",
    "high",
    "reliability",
    "Set deletion_protection = true for any database holding real data.",
    "AWS Foundational Security Best Practices RDS.8",
)
def _del_prot(plan: Plan):
    for rc in _live(plan, "aws_db_instance"):
        if rc.after.get("deletion_protection") is not True:
            yield rc.address, "deletion_protection is not true"


@rule(
    "PG-REL-002",
    "Database automated backups disabled",
    "medium",
    "reliability",
    "Set backup_retention_period to at least 7 days.",
    "AWS Foundational Security Best Practices RDS.11",
)
def _backups(plan: Plan):
    for rc in _live(plan, "aws_db_instance"):
        if int(rc.after.get("backup_retention_period") or 0) == 0:
            yield rc.address, "backup_retention_period = 0"


@rule(
    "PG-REL-003",
    "No final snapshot on database deletion",
    "medium",
    "reliability",
    "Set skip_final_snapshot = false and a final_snapshot_identifier.",
    "Terraform aws_db_instance docs",
)
def _snapshot(plan: Plan):
    for rc in _live(plan, "aws_db_instance"):
        if rc.after.get("skip_final_snapshot") is True:
            yield rc.address, "skip_final_snapshot = true"


@rule(
    "PG-REL-004",
    "S3 bucket without versioning",
    "low",
    "reliability",
    'Add aws_s3_bucket_versioning with status = "Enabled" to recover from overwrites and deletes.',
    "AWS Foundational Security Best Practices S3.14",
)
def _versioning(plan: Plan):
    buckets = [rc for rc in _live(plan, "aws_s3_bucket") if rc.action in ("create", "replace")]
    enabled = [
        rc
        for rc in _live(plan, "aws_s3_bucket_versioning")
        if any(b.get("status") == "Enabled" for b in _blocks(rc.after.get("versioning_configuration")))
    ]
    if len(enabled) < len(buckets):
        for rc in buckets[len(enabled) :]:
            yield rc.address, "no enabled aws_s3_bucket_versioning for this bucket in the plan"


def evaluate(plan: Plan) -> list[Finding]:
    findings: list[Finding] = []
    for check in _CHECKS:
        for rule_id, address, detail in check(plan):
            r = RULES[rule_id]
            findings.append(Finding(r.id, r.title, r.severity, r.category, address, detail, r.remediation, r.reference))
    findings.sort(key=lambda f: (-SEV_RANK[f.severity], f.rule_id, f.address))
    return findings
