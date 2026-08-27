"""Match user prompts to scripted tool-call / reply steps."""

from __future__ import annotations

import json
import re
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import yaml


@dataclass
class Scenario:
    id: str
    match: re.Pattern[str]
    steps: list[dict[str, Any]]


@dataclass
class ScenarioDirector:
    scenarios: list[Scenario]
    default_scenario: Scenario | None = None
    _sessions: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_file(cls, path: Path) -> ScenarioDirector:
        raw = yaml.safe_load(path.read_text(encoding="utf-8"))
        if not isinstance(raw, dict):
            raise ValueError(f"invalid scenarios file: {path}")
        scenarios: list[Scenario] = []
        for item in raw.get("scenarios") or []:
            if not isinstance(item, dict):
                continue
            sid = str(item.get("id") or "").strip()
            pattern = str(item.get("match") or "").strip()
            steps = item.get("steps")
            if not sid or not pattern or not isinstance(steps, list):
                continue
            scenarios.append(
                Scenario(
                    id=sid,
                    match=re.compile(pattern, re.IGNORECASE | re.DOTALL),
                    steps=[s for s in steps if isinstance(s, dict)],
                )
            )
        default = None
        default_id = str(raw.get("default") or "").strip()
        if default_id:
            default = next((s for s in scenarios if s.id == default_id), None)
        if default is None and scenarios:
            default = scenarios[0]
        return cls(scenarios=scenarios, default_scenario=default)

    def reset(self) -> None:
        self._sessions.clear()

    def _last_user_text(self, messages: list[dict[str, Any]]) -> str:
        for msg in reversed(messages):
            if msg.get("role") != "user":
                continue
            content = msg.get("content")
            if isinstance(content, str):
                return content.strip()
            if isinstance(content, list):
                parts = [
                    (p.get("text") if isinstance(p, dict) else str(p)) or ""
                    for p in content
                ]
                joined = "\n".join(parts).strip()
                if joined:
                    return joined
        return ""

    def _session_key(self, messages: list[dict[str, Any]]) -> str:
        for msg in messages:
            if msg.get("role") == "user":
                content = msg.get("content")
                if isinstance(content, str) and content.strip():
                    return content.strip()[:240]
        return "__default__"

    def _pick_scenario(self, messages: list[dict[str, Any]]) -> Scenario:
        user_text = self._last_user_text(messages)
        session_key = self._session_key(messages)
        bound = self._sessions.get(session_key)
        if bound:
            found = next((s for s in self.scenarios if s.id == bound), None)
            if found:
                return found
        for scenario in self.scenarios:
            if scenario.match.search(user_text):
                self._sessions[session_key] = scenario.id
                return scenario
        if self.default_scenario is not None:
            self._sessions[session_key] = self.default_scenario.id
            return self.default_scenario
        raise ValueError("no scenario matched and no default configured")

    @staticmethod
    def _tool_result_count(messages: list[dict[str, Any]]) -> int:
        return sum(1 for m in messages if m.get("role") == "tool")

    def build_completion(
        self,
        messages: list[dict[str, Any]],
        *,
        model: str,
    ) -> dict[str, Any]:
        scenario = self._pick_scenario(messages)
        step_idx = self._tool_result_count(messages)
        if step_idx >= len(scenario.steps):
            step_idx = len(scenario.steps) - 1
        step = scenario.steps[step_idx]
        return self._step_to_completion(step, model=model, scenario_id=scenario.id)

    def _step_to_completion(
        self,
        step: dict[str, Any],
        *,
        model: str,
        scenario_id: str,
    ) -> dict[str, Any]:
        tool_calls_raw = step.get("tool_calls")
        content = step.get("content")
        if isinstance(content, str):
            text = content
        else:
            text = ""

        message: dict[str, Any] = {"role": "assistant", "content": text}
        finish_reason = "stop"

        if isinstance(tool_calls_raw, list) and tool_calls_raw:
            tool_calls: list[dict[str, Any]] = []
            for i, tc in enumerate(tool_calls_raw):
                if not isinstance(tc, dict):
                    continue
                name = str(tc.get("name") or "").strip()
                if not name:
                    continue
                args = tc.get("arguments")
                if isinstance(args, str):
                    args_str = args
                else:
                    args_str = json.dumps(args or {}, ensure_ascii=False)
                tool_calls.append(
                    {
                        "id": f"call_{scenario_id}_{uuid.uuid4().hex[:10]}_{i}",
                        "type": "function",
                        "function": {"name": name, "arguments": args_str},
                    }
                )
            if tool_calls:
                message["tool_calls"] = tool_calls
                if not text:
                    message["content"] = step.get("preamble") or ""
                finish_reason = "tool_calls"

        return {
            "id": f"chatcmpl-mock-{uuid.uuid4().hex[:12]}",
            "object": "chat.completion",
            "model": model,
            "choices": [
                {
                    "index": 0,
                    "message": message,
                    "finish_reason": finish_reason,
                }
            ],
            "usage": {
                "prompt_tokens": 1,
                "completion_tokens": 1,
                "total_tokens": 2,
            },
        }


def load_scenarios(path: Path | None = None) -> ScenarioDirector:
    if path is None:
        path = Path(__file__).resolve().parent / "scenarios" / "k8s_engineer.yaml"
    return ScenarioDirector.from_file(path)
