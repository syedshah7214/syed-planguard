"""Command line entry point — what CI pipelines run.

    terraform plan -out tfplan && terraform show -json tfplan > plan.json
    python -m planguard plan.json --budget 50 --fail-on high --format markdown

Exit codes: 0 = PASS or WARN, 1 = FAIL, 2 = invalid input.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

from .analyzer import FAIL, Options, analyze
from .plan import PlanError
from .render import markdown, text


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="planguard", description="Cost and risk gate for Terraform plans")
    p.add_argument("plan", help="path to `terraform show -json` output, or - for stdin")
    p.add_argument("--budget", type=float, default=50.0, help="monthly budget in USD (default 50, 0 = no budget)")
    p.add_argument("--fail-on", default="high", choices=["critical", "high", "medium", "low"])
    p.add_argument("--format", default="text", choices=["text", "json", "markdown"])
    p.add_argument("--title", default="PlanGuard")
    p.add_argument("--summary", action="store_true", help="also append Markdown to $GITHUB_STEP_SUMMARY")
    args = p.parse_args(argv)

    try:
        raw = sys.stdin.read() if args.plan == "-" else Path(args.plan).read_text(encoding="utf-8")
        report = analyze(raw, Options(budget_usd=args.budget or None, fail_on=args.fail_on)).to_dict()
    except (OSError, PlanError, ValueError) as exc:
        print(f"planguard: {exc}", file=sys.stderr)
        return 2

    if args.format == "json":
        print(json.dumps(report, indent=2))
    elif args.format == "markdown":
        print(markdown(report, args.title))
    else:
        print(text(report))

    summary_path = os.getenv("GITHUB_STEP_SUMMARY")
    if args.summary and summary_path:
        with open(summary_path, "a", encoding="utf-8") as fh:
            fh.write(markdown(report, args.title) + "\n\n")
    if os.getenv("GITHUB_ACTIONS") == "true":
        level = "error" if report["decision"] == FAIL else "warning" if report["decision"] == "WARN" else "notice"
        print(f"::{level}::{args.title}: {report['decision']} — {'; '.join(report['reasons'])}")
    return 1 if report["decision"] == FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
