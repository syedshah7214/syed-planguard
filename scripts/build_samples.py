#!/usr/bin/env python3
"""Generate the bundled SAMPLE plans in backend/planguard/samples/.

These are hand-written in the documented `terraform show -json` format
(format_version 1.2) so the dashboard and tests work offline. They are
labelled as samples everywhere in the UI. Real plans from
examples/terraform/* are produced by `terraform plan` in CI.
"""

import json
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "backend" / "planguard" / "samples"
TF = "1.9.8"


def rc(type_, name, actions, after=None, before=None, unknown=None):
    return {"address": f"{type_}.{name}", "mode": "managed", "type": type_, "name": name,
            "provider_name": "registry.terraform.io/hashicorp/aws",
            "change": {"actions": actions, "before": before, "after": after, "after_unknown": unknown or {}}}


def plan(changes, description):
    return {"format_version": "1.2", "terraform_version": TF, "planguard_sample": description,
            "resource_changes": changes}


ADMIN = json.dumps({"Version": "2012-10-17", "Statement": [{"Effect": "Allow", "Action": "*", "Resource": "*"}]})
LEAST = json.dumps({"Version": "2012-10-17", "Statement": [
    {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject"], "Resource": "arn:aws:s3:::syed-lab-assets/*"}]})

samples = {
    "risky-startup-stack": plan([
        rc("aws_vpc", "main", ["create"], {"cidr_block": "10.0.0.0/16"}),
        rc("aws_subnet", "public", ["create"], {"cidr_block": "10.0.1.0/24", "map_public_ip_on_launch": True}),
        rc("aws_internet_gateway", "igw", ["create"], {}),
        rc("aws_security_group", "web", ["create"], {"name": "web", "ingress": [
            {"from_port": 22, "to_port": 22, "protocol": "tcp", "cidr_blocks": ["0.0.0.0/0"]},
            {"from_port": 80, "to_port": 80, "protocol": "tcp", "cidr_blocks": ["0.0.0.0/0"]}]}),
        rc("aws_instance", "app", ["create"], {"ami": "ami-0abcdef1234567890", "instance_type": "m5.xlarge",
           "root_block_device": [{"volume_size": 100, "volume_type": "gp2", "encrypted": False}],
           "metadata_options": [{"http_tokens": "optional"}]}),
        rc("aws_db_instance", "main", ["create"], {"engine": "postgres", "instance_class": "db.t3.medium",
           "allocated_storage": 100, "storage_type": "gp2", "multi_az": True, "publicly_accessible": True,
           "storage_encrypted": False, "deletion_protection": False, "backup_retention_period": 0,
           "skip_final_snapshot": True}),
        rc("aws_s3_bucket", "uploads", ["create"], {"bucket": "startup-user-uploads", "acl": "public-read"}),
        rc("aws_eip", "nat", ["create"], {"domain": "vpc"}, unknown={"allocation_id": True}),
        rc("aws_nat_gateway", "main", ["create"], {"connectivity_type": "public"}, unknown={"allocation_id": True}),
        rc("aws_iam_policy", "app", ["create"], {"name": "app-admin", "policy": ADMIN}),
    ], "A typical first AWS stack with common security and cost mistakes"),

    "student-lab-secure": plan([
        rc("aws_vpc", "lab", ["create"], {"cidr_block": "10.10.0.0/16"}),
        rc("aws_subnet", "public", ["create"], {"cidr_block": "10.10.1.0/24"}),
        rc("aws_internet_gateway", "igw", ["create"], {}),
        rc("aws_security_group", "web", ["create"], {"name": "web", "ingress": [
            {"from_port": 443, "to_port": 443, "protocol": "tcp", "cidr_blocks": ["0.0.0.0/0"]},
            {"from_port": 22, "to_port": 22, "protocol": "tcp", "cidr_blocks": ["203.0.113.10/32"]}]}),
        rc("aws_instance", "app", ["create"], {"ami": "ami-0abcdef1234567890", "instance_type": "t3.micro",
           "root_block_device": [{"volume_size": 8, "volume_type": "gp3", "encrypted": True}],
           "metadata_options": [{"http_tokens": "required"}]}, unknown={"public_ip": True}),
        rc("aws_s3_bucket", "assets", ["create"], {"bucket": "syed-lab-assets"}),
        rc("aws_s3_bucket_public_access_block", "assets", ["create"], {"block_public_acls": True,
           "block_public_policy": True, "ignore_public_acls": True, "restrict_public_buckets": True}),
        rc("aws_s3_bucket_versioning", "assets", ["create"], {"versioning_configuration": [{"status": "Enabled"}]}),
        rc("aws_iam_policy", "app", ["create"], {"name": "app-s3-least-privilege", "policy": LEAST}),
        rc("aws_budgets_budget", "monthly", ["create"], {"budget_type": "COST", "limit_amount": "10", "limit_unit": "USD"}),
    ], "Small, hardened lab environment sized for a student budget"),

    "prod-db-replacement": plan([
        rc("aws_instance", "app", ["update"],
           before={"instance_type": "t3.small", "root_block_device": [{"volume_size": 20, "volume_type": "gp3", "encrypted": True}], "metadata_options": [{"http_tokens": "required"}]},
           after={"instance_type": "t3.medium", "root_block_device": [{"volume_size": 20, "volume_type": "gp3", "encrypted": True}], "metadata_options": [{"http_tokens": "required"}]}),
        rc("aws_db_instance", "orders", ["delete", "create"],
           before={"engine": "postgres", "instance_class": "db.t3.small", "allocated_storage": 50, "storage_type": "gp3",
                   "storage_encrypted": True, "deletion_protection": True, "backup_retention_period": 7, "skip_final_snapshot": False},
           after={"engine": "postgres", "instance_class": "db.t3.small", "allocated_storage": 50, "storage_type": "gp3",
                  "storage_encrypted": True, "deletion_protection": True, "backup_retention_period": 7, "skip_final_snapshot": False,
                  "identifier": "orders-v2"}),
        rc("aws_s3_bucket", "invoices", ["delete"], before={"bucket": "acme-invoices-archive"}),
    ], "A routine-looking change that would replace a production database and delete a bucket"),

    "kubernetes-cost-spike": plan([
        rc("aws_eks_cluster", "platform", ["create"], {"name": "platform", "version": "1.33"}),
        rc("aws_eks_node_group", "default", ["create"], {"instance_types": ["m5.large"],
           "scaling_config": [{"desired_size": 3, "min_size": 3, "max_size": 6}]}),
        rc("aws_nat_gateway", "az_a", ["create"], {"connectivity_type": "public"}),
        rc("aws_nat_gateway", "az_b", ["create"], {"connectivity_type": "public"}),
        rc("aws_eip", "nat_a", ["create"], {"domain": "vpc"}, unknown={"network_interface": True}),
        rc("aws_eip", "nat_b", ["create"], {"domain": "vpc"}, unknown={"network_interface": True}),
        rc("aws_lb", "ingress", ["create"], {"load_balancer_type": "application", "internal": False}),
    ], "A secure but expensive Kubernetes platform for a small team"),
}

OUT.mkdir(parents=True, exist_ok=True)
for name, body in samples.items():
    (OUT / f"{name}.json").write_text(json.dumps(body, indent=2) + "\n", encoding="utf-8")
    print("wrote", name)
