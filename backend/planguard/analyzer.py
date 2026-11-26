"""Combine cost estimation and policy findings into one gate decision.

Decision policy (documented, deterministic):
  FAIL  any finding at or above `fail_on` severity (default: high),
        OR the projected monthly cost is above the budget.
  WARN  any medium finding, OR projected cost >= 80% of the budget,
        OR some resources could not be priced.
  PASS  otherwise.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import asdict, dataclass, field
from typing import Any

from . import __version__
from .plan import Plan, parse_plan
from .pricing import PRICES_AS_OF, REGION, estimate
from .rules import SEV_RANK, SEVERITIES, evaluate

PASS, WARN, FAIL = "PASS", "WARN", "FAIL"


@dataclass
class Options:
    budget_usd: float | None = 50.0
    fail_on: str = "high"

    def __post_init__(self) -> None:
        if self.fail_on not in SEVERITIES:
            raise ValueError(f"fail_on must be one of {SEVERITIES}")
        if self.budget_usd is not None and self.budget_usd < 0:
            raise ValueError("budget_usd must be >= 0")


@dataclass
class Report:
    tool_version: str
    terraform_version: str | None
    region: str
    prices_as_of: str
    decision: str
    reasons: list[str]
    summary: dict[str, int]
    cost: dict[str, Any]
    resources: list[dict[str, Any]]
    findings: list[dict[str, Any]]
    findings_by_severity: dict[str, int]
    options: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def analyze_plan(plan: Plan, options: Options | None = None) -> Report:
    opts = options or Options()
    resources: list[dict[str, Any]] = []
    before_total = after_total = 0.0
    unknown: list[str] = []
    by_service: dict[str, float] = defaultdict(float)

    for rc in plan.changes:
        b = estimate(rc.type, rc.before)
        a = estimate(rc.type, rc.after if rc.action != "delete" else None)
        if a.kind == "unknown" or b.kind == "unknown":
            unknown.append(rc.address)
        before_total += b.monthly_usd or 0.0
        after_total += a.monthly_usd or 0.0
        if a.monthly_usd:
            by_service[rc.provider_service] += a.monthly_usd
        resources.append(
            {
                "address": rc.address,
                "type": rc.type,
                "action": rc.action,
                "monthly_before": b.monthly_usd,
                "monthly_after": a.monthly_usd,
                "monthly_delta": None
                if (a.monthly_usd is None or b.monthly_usd is None)
                else round(a.monthly_usd - b.monthly_usd, 2),
                "basis": a.basis if rc.action != "delete" else b.basis,
                "cost_kind": a.kind if rc.action != "delete" else b.kind,
            }
        )

    summary = Counter(r["action"] for r in resources)
    findings = evaluate(plan)
    sev_counts = {s: 0 for s in SEVERITIES} | dict(Counter(f.severity for f in findings))

    # --- decision
    reasons: list[str] = []
    decision = PASS
    threshold = SEV_RANK[opts.fail_on]
    blocking = [f for f in findings if SEV_RANK[f.severity] >= threshold]
    if blocking:
        decision = FAIL
        reasons.append(f"{len(blocking)} finding(s) at or above '{opts.fail_on}' severity")
    if opts.budget_usd is not None and after_total > opts.budget_usd:
        decision = FAIL
        reasons.append(f"projected ${after_total:,.2f}/month exceeds the ${opts.budget_usd:,.2f} budget")
    if decision != FAIL:
        if any(f.severity == "medium" for f in findings) and threshold > SEV_RANK["medium"]:
            decision = WARN
            reasons.append(f"{sev_counts['medium']} medium finding(s)")
        if opts.budget_usd and after_total >= 0.8 * opts.budget_usd:
            decision = WARN
            reasons.append(f"projected cost uses {after_total / opts.budget_usd:.0%} of the budget")
        if unknown:
            decision = WARN
            reasons.append(f"{len(unknown)} resource(s) could not be priced")
    if not reasons:
        reasons.append("no blocking findings and projected cost within budget")

    return Report(
        tool_version=__version__,
        terraform_version=plan.terraform_version,
        region=REGION,
        prices_as_of=PRICES_AS_OF,
        decision=decision,
        reasons=reasons,
        summary={k: summary.get(k, 0) for k in ("create", "update", "replace", "delete", "no-op", "read")},
        cost={
            "monthly_before": round(before_total, 2),
            "monthly_after": round(after_total, 2),
            "monthly_delta": round(after_total - before_total, 2),
            "budget": opts.budget_usd,
            "budget_used": round(after_total / opts.budget_usd, 4) if opts.budget_usd else None,
            "by_service": {k: round(v, 2) for k, v in sorted(by_service.items(), key=lambda kv: -kv[1])},
            "unpriced": unknown,
            "excludes": "data transfer, requests, NAT data processing, LCUs, CPU credits, backups",
        },
        resources=sorted(resources, key=lambda r: -(r["monthly_after"] or 0)),
        findings=[asdict(f) for f in findings],
        findings_by_severity=sev_counts,
        options={"budget_usd": opts.budget_usd, "fail_on": opts.fail_on},
    )


def analyze(data: str | bytes | dict[str, Any], options: Options | None = None) -> Report:
    return analyze_plan(parse_plan(data), options)
