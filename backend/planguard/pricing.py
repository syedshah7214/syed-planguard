"""Monthly cost estimation from a static, documented price table.

Prices are AWS on-demand LIST prices for us-east-1 (Linux, no discounts),
checked November 2026 against the AWS pricing pages. They are an ESTIMATE:
data transfer, requests, NAT data processing, load-balancer LCUs, CPU credits
and anything usage-based are NOT included. Always confirm with the AWS
Pricing Calculator before committing to a design.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

HOURS_PER_MONTH = 730
PRICES_AS_OF = "2026-11"
REGION = "us-east-1"

EC2_HOURLY = {
    "t3.nano": 0.0052,
    "t3.micro": 0.0104,
    "t3.small": 0.0208,
    "t3.medium": 0.0416,
    "t3.large": 0.0832,
    "t3.xlarge": 0.1664,
    "t3.2xlarge": 0.3328,
    "t4g.nano": 0.0042,
    "t4g.micro": 0.0084,
    "t4g.small": 0.0168,
    "t4g.medium": 0.0336,
    "m5.large": 0.096,
    "m5.xlarge": 0.192,
    "m5.2xlarge": 0.384,
    "c5.large": 0.085,
    "c5.xlarge": 0.17,
    "r5.large": 0.126,
}
RDS_HOURLY = {  # single-AZ, MySQL/PostgreSQL
    "db.t3.micro": 0.018,
    "db.t3.small": 0.036,
    "db.t3.medium": 0.072,
    "db.t3.large": 0.145,
    "db.t4g.micro": 0.016,
    "db.t4g.small": 0.032,
    "db.m5.large": 0.178,
    "db.m5.xlarge": 0.356,
}
ELASTICACHE_HOURLY = {"cache.t3.micro": 0.017, "cache.t3.small": 0.034, "cache.t4g.micro": 0.016}
EBS_GB_MONTH = {"gp3": 0.08, "gp2": 0.10, "io1": 0.125, "st1": 0.045, "sc1": 0.015, "standard": 0.05}
RDS_STORAGE_GB_MONTH = {"gp2": 0.115, "gp3": 0.115, "io1": 0.125, "standard": 0.10}

FLAT_MONTHLY = {
    "aws_nat_gateway": (
        0.045 * HOURS_PER_MONTH,
        "NAT gateway hours ($0.045/h); data processing ($0.045/GB) not included",
    ),
    "aws_eks_cluster": (0.10 * HOURS_PER_MONTH, "EKS control plane, standard support ($0.10/h)"),
    "aws_lb": (0.0225 * HOURS_PER_MONTH, "Load balancer hours ($0.0225/h); LCU usage not included"),
    "aws_alb": (0.0225 * HOURS_PER_MONTH, "Load balancer hours ($0.0225/h); LCU usage not included"),
    "aws_eip": (0.005 * HOURS_PER_MONTH, "Public IPv4 address ($0.005/h)"),
    "aws_kms_key": (1.00, "Customer-managed KMS key ($1/month); requests not included"),
    "aws_secretsmanager_secret": (0.40, "Secrets Manager secret ($0.40/month); API calls not included"),
    "aws_route53_zone": (0.50, "Hosted zone ($0.50/month); queries not included"),
}
USAGE_BASED = {
    "aws_s3_bucket",
    "aws_lambda_function",
    "aws_cloudwatch_log_group",
    "aws_dynamodb_table",
    "aws_sqs_queue",
    "aws_sns_topic",
    "aws_api_gateway_rest_api",
    "aws_apigatewayv2_api",
    "aws_cloudfront_distribution",
}
FREE = {
    "aws_vpc",
    "aws_subnet",
    "aws_route_table",
    "aws_route_table_association",
    "aws_route",
    "aws_internet_gateway",
    "aws_security_group",
    "aws_security_group_rule",
    "aws_vpc_security_group_ingress_rule",
    "aws_vpc_security_group_egress_rule",
    "aws_iam_role",
    "aws_iam_policy",
    "aws_iam_role_policy",
    "aws_iam_role_policy_attachment",
    "aws_iam_instance_profile",
    "aws_s3_bucket_public_access_block",
    "aws_s3_bucket_versioning",
    "aws_s3_bucket_server_side_encryption_configuration",
    "aws_s3_bucket_acl",
    "aws_s3_bucket_policy",
    "aws_db_subnet_group",
    "aws_key_pair",
    "aws_lb_target_group",
    "aws_lb_listener",
    "aws_budgets_budget",
    "aws_kms_alias",
}


@dataclass(frozen=True)
class CostLine:
    monthly_usd: float | None  # None = cannot be estimated statically
    basis: str
    kind: str  # fixed | usage_based | free | unknown


def _num(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except (TypeError, ValueError):
        return default


def estimate(resource_type: str, attrs: dict[str, Any] | None) -> CostLine:
    """Monthly cost of ONE resource in a given state (before or after)."""
    if attrs is None:
        return CostLine(0.0, "does not exist in this state", "free")
    a = attrs

    if resource_type == "aws_instance":
        itype = a.get("instance_type")
        rate = EC2_HOURLY.get(str(itype))
        if rate is None:
            return CostLine(None, f"instance type {itype!r} not in the price table", "unknown")
        cost = rate * HOURS_PER_MONTH
        root = a.get("root_block_device") or [{}]
        root = root[0] if isinstance(root, list) and root else {}
        size = _num(root.get("volume_size"), 8)
        vtype = str(root.get("volume_type") or "gp3")
        cost += size * EBS_GB_MONTH.get(vtype, 0.08)
        return CostLine(round(cost, 2), f"{itype} ${rate}/h + {size:g} GB {vtype} root volume", "fixed")

    if resource_type == "aws_db_instance":
        cls = str(a.get("instance_class"))
        rate = RDS_HOURLY.get(cls)
        if rate is None:
            return CostLine(None, f"DB class {cls!r} not in the price table", "unknown")
        mult = 2 if a.get("multi_az") else 1
        gb = _num(a.get("allocated_storage"), 20)
        stype = str(a.get("storage_type") or "gp2")
        cost = rate * HOURS_PER_MONTH * mult + gb * RDS_STORAGE_GB_MONTH.get(stype, 0.115) * mult
        az = "Multi-AZ ×2" if mult == 2 else "single-AZ"
        return CostLine(round(cost, 2), f"{cls} ${rate}/h {az} + {gb:g} GB {stype}", "fixed")

    if resource_type == "aws_ebs_volume":
        vtype = str(a.get("type") or "gp3")
        gb = _num(a.get("size"), 0)
        rate = EBS_GB_MONTH.get(vtype)
        if rate is None:
            return CostLine(None, f"volume type {vtype!r} not in the price table", "unknown")
        return CostLine(round(gb * rate, 2), f"{gb:g} GB {vtype} at ${rate}/GB-month", "fixed")

    if resource_type in ("aws_elasticache_cluster",):
        ntype = str(a.get("node_type"))
        rate = ELASTICACHE_HOURLY.get(ntype)
        nodes = int(_num(a.get("num_cache_nodes"), 1))
        if rate is None:
            return CostLine(None, f"node type {ntype!r} not in the price table", "unknown")
        return CostLine(round(rate * HOURS_PER_MONTH * nodes, 2), f"{nodes} × {ntype} ${rate}/h", "fixed")

    if resource_type == "aws_eks_node_group":
        types = a.get("instance_types") or ["t3.medium"]
        scaling = (a.get("scaling_config") or [{}])[0] if isinstance(a.get("scaling_config"), list) else {}
        desired = int(_num(scaling.get("desired_size"), 1))
        rate = EC2_HOURLY.get(str(types[0]))
        if rate is None:
            return CostLine(None, f"instance type {types[0]!r} not in the price table", "unknown")
        return CostLine(round(rate * HOURS_PER_MONTH * desired, 2), f"{desired} × {types[0]} ${rate}/h", "fixed")

    if resource_type in FLAT_MONTHLY:
        cost, basis = FLAT_MONTHLY[resource_type]
        if resource_type in ("aws_lb", "aws_alb") and a.get("load_balancer_type") == "network":
            basis = "Network load balancer hours ($0.0225/h); NLCU usage not included"
        return CostLine(round(cost, 2), basis, "fixed")

    if resource_type in USAGE_BASED:
        return CostLine(0.0, "usage-based (storage/requests) — not estimated", "usage_based")
    if resource_type in FREE or not resource_type.startswith("aws_"):
        return CostLine(0.0, "no direct charge", "free")
    return CostLine(None, "resource type not in the price table", "unknown")


def price_table() -> dict[str, Any]:
    return {
        "region": REGION,
        "as_of": PRICES_AS_OF,
        "hours_per_month": HOURS_PER_MONTH,
        "ec2_hourly": EC2_HOURLY,
        "rds_hourly_single_az": RDS_HOURLY,
        "elasticache_hourly": ELASTICACHE_HOURLY,
        "ebs_gb_month": EBS_GB_MONTH,
        "rds_storage_gb_month": RDS_STORAGE_GB_MONTH,
        "flat_monthly": {k: {"usd": round(v[0], 2), "basis": v[1]} for k, v in FLAT_MONTHLY.items()},
        "usage_based": sorted(USAGE_BASED),
        "excluded": [
            "data transfer",
            "requests/API calls",
            "NAT data processing",
            "load balancer LCUs",
            "T-family CPU credits",
            "backups/snapshots",
            "taxes and support plans",
        ],
    }
