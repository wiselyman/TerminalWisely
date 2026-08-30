"""Load eval scenarios from YAML."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class EvalScenario:
    id: str
    engineer_mode: str
    prompt: str
    required_tools: list[str] = field(default_factory=list)
    tools_in_order: bool = False
    content_contains: list[str] = field(default_factory=list)
    max_seconds: float = 45.0
    tags: list[str] = field(default_factory=list)


def load_eval_scenarios(path: Path | None = None) -> list[EvalScenario]:
    if path is None:
        path = Path(__file__).resolve().parent / "scenarios" / "ops_eval.yaml"
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if not isinstance(raw, dict):
        raise ValueError(f"invalid eval scenarios: {path}")
    out: list[EvalScenario] = []
    for item in raw.get("scenarios") or []:
        if not isinstance(item, dict):
            continue
        sid = str(item.get("id") or "").strip()
        prompt = str(item.get("prompt") or "").strip()
        if not sid or not prompt:
            continue
        mode = str(item.get("engineer_mode") or "linux").strip().lower()
        tools = item.get("required_tools")
        if not isinstance(tools, list):
            tools = []
        content = item.get("content_contains")
        if not isinstance(content, list):
            content = []
        tags = item.get("tags")
        if not isinstance(tags, list):
            tags = []
        out.append(
            EvalScenario(
                id=sid,
                engineer_mode=mode,
                prompt=prompt,
                required_tools=[str(t) for t in tools],
                tools_in_order=bool(item.get("tools_in_order")),
                content_contains=[str(c) for c in content],
                max_seconds=float(item.get("max_seconds") or 45.0),
                tags=[str(t) for t in tags],
            )
        )
    return out
