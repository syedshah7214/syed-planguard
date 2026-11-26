"""Parse the JSON produced by `terraform show -json tfplan`.

Only the stable, documented parts of the format are used:
`format_version`, `terraform_version` and `resource_changes[*]`
(address, type, name, mode, change.actions, change.before, change.after).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any

MAX_PLAN_BYTES = 5 * 1024 * 1024


class PlanError(ValueError):
    """The input is not a usable Terraform JSON plan."""


@dataclass(frozen=True)
class ResourceChange:
    address: str
    type: str
    name: str
    actions: tuple[str, ...]
    before: dict[str, Any] | None
    after: dict[str, Any] | None
    after_unknown: dict[str, Any] = field(default_factory=dict)

    @property
    def action(self) -> str:
        """create | update | delete | replace | read | no-op"""
        a = set(self.actions)
        if {"create", "delete"} <= a:
            return "replace"
        for name in ("create", "update", "delete", "read"):
            if name in a:
                return name
        return "no-op"

    @property
    def provider_service(self) -> str:
        parts = self.type.split("_")
        return parts[1] if len(parts) > 1 else self.type


@dataclass(frozen=True)
class Plan:
    format_version: str
    terraform_version: str | None
    changes: list[ResourceChange]


def parse_plan(data: str | bytes | dict[str, Any]) -> Plan:
    if isinstance(data, (str, bytes)):
        if len(data) > MAX_PLAN_BYTES:
            raise PlanError("plan is larger than 5 MB")
        try:
            data = json.loads(data)
        except json.JSONDecodeError as exc:
            raise PlanError(f"not valid JSON: {exc.msg} (line {exc.lineno})") from exc
    if not isinstance(data, dict):
        raise PlanError("plan must be a JSON object")
    if "format_version" not in data:
        raise PlanError("missing 'format_version' — generate it with: terraform show -json tfplan > plan.json")
    raw_changes = data.get("resource_changes", [])
    if not isinstance(raw_changes, list):
        raise PlanError("'resource_changes' must be a list")

    changes: list[ResourceChange] = []
    for rc in raw_changes:
        if not isinstance(rc, dict) or rc.get("mode", "managed") != "managed":
            continue  # data sources are reads, not infrastructure
        change = rc.get("change") or {}
        actions = tuple(change.get("actions") or ["no-op"])
        changes.append(
            ResourceChange(
                address=str(rc.get("address", "?")),
                type=str(rc.get("type", "?")),
                name=str(rc.get("name", "?")),
                actions=actions,
                before=change.get("before") if isinstance(change.get("before"), dict) else None,
                after=change.get("after") if isinstance(change.get("after"), dict) else None,
                after_unknown=change.get("after_unknown") if isinstance(change.get("after_unknown"), dict) else {},
            )
        )
    return Plan(str(data["format_version"]), data.get("terraform_version"), changes)
