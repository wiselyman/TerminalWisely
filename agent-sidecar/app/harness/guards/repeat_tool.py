"""Advisory guard: nudge when the same tool+args repeats consecutively.

Ported from DeepSeek `dsh-repeat-tool-reminder` — never vetoes, only injects context.
"""

from __future__ import annotations

import json
from typing import Any

from app.harness.pipeline import PostToolDecision, ToolExec


def _canonical_args(arguments: dict[str, Any]) -> str:
    try:
        return json.dumps(arguments, sort_keys=True, ensure_ascii=False, default=str)
    except TypeError:
        return repr(arguments)


class RepeatToolReminder:
    """Post-hook: escalate reminders at consecutive identical tool calls."""

    def __init__(
        self,
        *,
        thresholds: list[int] | None = None,
        exclude: frozenset[str] | None = None,
        preview_chars: int = 500,
    ) -> None:
        th = sorted(thresholds or [3, 5, 8])
        if not th or th[0] < 2 or len(th) != len(set(th)):
            raise ValueError("thresholds must be unique integers >= 2")
        self.thresholds = th
        self.exclude = exclude or frozenset({"update_plan"})
        self.preview_chars = max(1, preview_chars)
        self._last_key: str | None = None
        self._count = 0

    def reset(self) -> None:
        self._last_key = None
        self._count = 0

    async def post(self, tool: ToolExec, result: Any) -> PostToolDecision:
        if tool.name in self.exclude:
            return PostToolDecision()
        key = f"{tool.name}|{_canonical_args(tool.arguments)}"
        if key == self._last_key:
            self._count += 1
        else:
            self._last_key = key
            self._count = 1

        if self._count not in self.thresholds:
            return PostToolDecision()

        if self._count == self.thresholds[0]:
            text = (
                "You are repeating the exact same tool call with identical arguments. "
                "Carefully analyze the previous result before calling again: if the task "
                "is not complete, try a different approach or different arguments instead "
                "of repeating the call."
            )
        else:
            preview = _canonical_args(tool.arguments)
            if len(preview) > self.preview_chars:
                omitted = len(preview) - self.preview_chars
                preview = preview[: self.preview_chars] + f"…(+{omitted} chars)"
            text = (
                f"You have called `{tool.name}` with the same arguments "
                f"{self._count} times in a row.\n"
                f"Arguments: {preview}\n"
                "Stop repeating. Re-read the last tool result, change approach, "
                "or conclude if the task cannot proceed."
            )
        return PostToolDecision(additional_contexts=[text])
