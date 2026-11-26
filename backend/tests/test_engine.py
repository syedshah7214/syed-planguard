import json
from pathlib import Path

import pytest

from planguard.analyzer import FAIL, PASS, WARN, Options, analyze
from planguard.cli import main
from planguard.plan import PlanError, parse_plan
from planguard.pricing import HOURS_PER_MONTH, estimate
from planguard.rules import RULES, evaluate

SAMPLES = Path(__file__).resolve().parent.parent / "planguard" / "samples"


def rc(type_, name, actions, after=None, before=None, unknown=None):
    return {
        "address": f"{type_}.{name}",
        "mode": "managed",
        "type": type_,
        "name": name,
        "change": {"actions": actions, "before": before, "after": after, "after_unknown": unknown or {}},
    }


def plan(*changes):
    return {"format_version": "1.2", "terraform_version": "1.9.8", "resource_changes": list(changes)}


def rule_ids(p):
    return {f.rule_id for f in evaluate(parse_plan(p))}


# ---------------- parsing


def test_parse_rejects_garbage():
    with pytest.raises(PlanError):
        parse_plan("not json")
    with pytest.raises(PlanError, match="format_version"):
        parse_plan({"resource_changes": []})
    with pytest.raises(PlanError):
        parse_plan("[]")


def test_parse_skips_data_sources_and_detects_replace():
    p = parse_plan(
        plan(
            rc("aws_instance", "a", ["delete", "create"], {"instance_type": "t3.micro"}, {"instance_type": "t3.micro"}),
            {
                "address": "data.aws_ami.x",
                "mode": "data",
                "type": "aws_ami",
                "name": "x",
                "change": {"actions": ["read"]},
            },
        )
    )
    assert len(p.changes) == 1 and p.changes[0].action == "replace"


# ---------------- pricing


def test_ec2_price_includes_root_volume():
    c = estimate(
        "aws_instance", {"instance_type": "t3.micro", "root_block_device": [{"volume_size": 8, "volume_type": "gp3"}]}
    )
    assert c.monthly_usd == round(0.0104 * HOURS_PER_MONTH + 8 * 0.08, 2) == 8.23


def test_rds_multi_az_doubles_instance_and_storage():
    single = estimate("aws_db_instance", {"instance_class": "db.t3.micro", "allocated_storage": 20})
    multi = estimate("aws_db_instance", {"instance_class": "db.t3.micro", "allocated_storage": 20, "multi_az": True})
    assert multi.monthly_usd == pytest.approx(2 * single.monthly_usd, abs=0.01)


def test_flat_usage_free_and_unknown():
    assert estimate("aws_nat_gateway", {}).monthly_usd == 32.85
    assert estimate("aws_eks_cluster", {}).monthly_usd == 73.0
    assert estimate("aws_s3_bucket", {}).kind == "usage_based"
    assert estimate("aws_vpc", {}).kind == "free"
    unknown = estimate("aws_instance", {"instance_type": "x9.mega"})
    assert unknown.kind == "unknown" and unknown.monthly_usd is None


# ---------------- rules


def test_ssh_open_is_critical_but_restricted_cidr_is_fine():
    open_ = plan(
        rc(
            "aws_security_group",
            "sg",
            ["create"],
            {"ingress": [{"from_port": 22, "to_port": 22, "protocol": "tcp", "cidr_blocks": ["0.0.0.0/0"]}]},
        )
    )
    closed = plan(
        rc(
            "aws_security_group",
            "sg",
            ["create"],
            {"ingress": [{"from_port": 22, "to_port": 22, "protocol": "tcp", "cidr_blocks": ["203.0.113.10/32"]}]},
        )
    )
    assert "PG-SEC-001" in rule_ids(open_)
    assert "PG-SEC-001" not in rule_ids(closed)


def test_all_ports_open_via_standalone_rule():
    p = plan(
        rc("aws_vpc_security_group_ingress_rule", "r", ["create"], {"ip_protocol": "-1", "cidr_ipv4": "0.0.0.0/0"})
    )
    assert rule_ids(p) == {"PG-SEC-002"}


def test_iam_wildcard():
    doc = json.dumps({"Statement": [{"Effect": "Allow", "Action": ["*"], "Resource": "*"}]})
    deny = json.dumps({"Statement": [{"Effect": "Deny", "Action": "*", "Resource": "*"}]})
    assert "PG-SEC-003" in rule_ids(plan(rc("aws_iam_policy", "p", ["create"], {"policy": doc})))
    assert "PG-SEC-003" not in rule_ids(plan(rc("aws_iam_policy", "p", ["create"], {"policy": deny})))


def test_destroying_stateful_resources_is_critical():
    p = plan(
        rc("aws_s3_bucket", "b", ["delete"], before={"bucket": "x"}),
        rc("aws_instance", "i", ["delete"], before={"instance_type": "t3.micro"}),
    )
    f = evaluate(parse_plan(p))
    assert [x.address for x in f if x.rule_id == "PG-CHG-001"] == ["aws_s3_bucket.b"]
    assert f[0].severity == "critical"


def test_every_rule_has_metadata():
    assert len(RULES) >= 18
    for r in RULES.values():
        assert r.remediation and r.reference and r.category


# ---------------- decisions on the bundled samples


@pytest.mark.parametrize(
    "name,decision",
    [
        ("risky-startup-stack", FAIL),
        ("student-lab-secure", PASS),
        ("prod-db-replacement", FAIL),
        ("kubernetes-cost-spike", FAIL),
    ],
)
def test_samples(name, decision):
    r = analyze((SAMPLES / f"{name}.json").read_text())
    assert r.decision == decision


def test_budget_is_the_only_blocker_for_kubernetes_sample():
    r = analyze((SAMPLES / "kubernetes-cost-spike.json").read_text())
    assert r.findings_by_severity["high"] == r.findings_by_severity["critical"] == 0
    assert r.cost["monthly_after"] == pytest.approx(73 + 3 * 0.096 * 730 + 2 * 32.85 + 2 * 3.65 + 16.43, abs=0.05)
    relaxed = analyze((SAMPLES / "kubernetes-cost-spike.json").read_text(), Options(budget_usd=500))
    assert relaxed.decision == WARN  # medium cost findings remain


def test_fail_on_threshold_and_no_budget():
    p = plan(
        rc(
            "aws_instance",
            "i",
            ["create"],
            {
                "instance_type": "t3.micro",
                "root_block_device": [{"encrypted": True, "volume_type": "gp3"}],
                "metadata_options": [{"http_tokens": "optional"}],
            },
        )
    )
    assert analyze(p, Options(budget_usd=None)).decision == WARN
    assert analyze(p, Options(budget_usd=None, fail_on="medium")).decision == FAIL


def test_unpriced_resource_warns():
    r = analyze(
        plan(
            rc(
                "aws_instance",
                "i",
                ["create"],
                {
                    "instance_type": "x9.mega",
                    "metadata_options": [{"http_tokens": "required"}],
                    "root_block_device": [{"encrypted": True}],
                },
            )
        )
    )
    assert r.decision == WARN and r.cost["unpriced"] == ["aws_instance.i"]


def test_options_validation():
    with pytest.raises(ValueError):
        Options(fail_on="extreme")
    with pytest.raises(ValueError):
        Options(budget_usd=-1)


# ---------------- CLI


def test_cli_exit_codes_and_formats(tmp_path, capsys, monkeypatch):
    summary = tmp_path / "summary.md"
    monkeypatch.setenv("GITHUB_STEP_SUMMARY", str(summary))
    assert main([str(SAMPLES / "student-lab-secure.json"), "--summary"]) == 0
    assert main([str(SAMPLES / "risky-startup-stack.json"), "--format", "markdown"]) == 1
    out = capsys.readouterr().out
    assert "PlanGuard: **FAIL**" in out and "PG-SEC-001" in out
    assert "PASS" in summary.read_text()
    assert main([str(SAMPLES / "risky-startup-stack.json"), "--format", "json"]) == 1
    bad = tmp_path / "bad.json"
    bad.write_text("{}")
    assert main([str(bad)]) == 2
