"""Advisory + hard-stop when the same tool+args repeats consecutively.

Ported from DeepSeek `dsh-repeat-tool-reminder`. Soft reminders still inject
context; after HARD_DENY_AT identical calls the pre-hook denies execution so
weak local models cannot spin forever (common after session resume).

Identical commands that already *failed* deny sooner (FAIL_DENY_AT): approval
is not success — resubmitting the same broken script is a dead loop.
"""

from __future__ import annotations

import json
from typing import Any

from app.harness.pipeline import PostToolDecision, PreToolDecision, ToolExec

# Ignore UI-only / non-semantic fields when comparing repeats.
_IGNORE_ARG_KEYS = frozenset({"intent", "timeout_seconds"})


def _canonical_args(arguments: dict[str, Any]) -> str:
    try:
        return json.dumps(arguments, sort_keys=True, ensure_ascii=False, default=str)
    except TypeError:
        return repr(arguments)


def normalize_shell_command(command: str) -> str:
    """Strip trivial whitespace so near-identical scripts still share a key."""
    lines = command.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    return "\n".join(line.rstrip() for line in lines).strip()


def repeat_tool_key(name: str, arguments: dict[str, Any] | None) -> str:
    """Stable key for consecutive-repeat detection (command-centric for shell)."""
    args = {
        k: v
        for k, v in (arguments or {}).items()
        if k not in _IGNORE_ARG_KEYS
    }
    if name in {"terminal_exec", "ai_exec"}:
        cmd = normalize_shell_command(str(args.get("command") or ""))
        return f"{name}|cmd:{cmd}"
    return f"{name}|{_canonical_args(args)}"


def tool_result_failed(result: Any) -> bool:
    """True when a tool payload is a hard failure (not cancel/deny-only noise)."""
    if not isinstance(result, dict):
        return False
    if result.get("cancelled") or result.get("denied"):
        return False
    if result.get("ok") is False:
        return True
    code = result.get("exit_code")
    if isinstance(code, int) and code != 0:
        return True
    return False


class RepeatToolReminder:
    """Pre: hard-deny after N identical calls (sooner if prior same-key failed)."""

    HARD_DENY_AT = 4
    # Same command already failed once → block the identical retry.
    FAIL_DENY_AT = 2

    def __init__(
        self,
        *,
        thresholds: list[int] | None = None,
        exclude: frozenset[str] | None = None,
        preview_chars: int = 500,
        hard_deny_at: int | None = None,
        fail_deny_at: int | None = None,
    ) -> None:
        th = sorted(thresholds or [2, 3])
        if not th or th[0] < 2 or len(th) != len(set(th)):
            raise ValueError("thresholds must be unique integers >= 2")
        self.thresholds = th
        self.exclude = exclude or frozenset({"update_plan"})
        self.preview_chars = max(1, preview_chars)
        self.hard_deny_at = (
            self.HARD_DENY_AT if hard_deny_at is None else max(2, int(hard_deny_at))
        )
        self.fail_deny_at = (
            self.FAIL_DENY_AT if fail_deny_at is None else max(2, int(fail_deny_at))
        )
        self._last_key: str | None = None
        self._count = 0
        self._fail_streak = 0

    def reset(self) -> None:
        self._last_key = None
        self._count = 0
        self._fail_streak = 0

    def _bump(self, tool: ToolExec) -> int:
        key = repeat_tool_key(tool.name, tool.arguments)
        if key == self._last_key:
            self._count += 1
        else:
            self._last_key = key
            self._count = 1
            self._fail_streak = 0
        return self._count

    def _preview(self, tool: ToolExec) -> str:
        preview = repeat_tool_key(tool.name, tool.arguments)
        if len(preview) > self.preview_chars:
            omitted = len(preview) - self.preview_chars
            preview = preview[: self.preview_chars] + f"…(+{omitted} chars)"
        return preview

    def _deny(self, tool: ToolExec, count: int, *, prior_failed: bool) -> PreToolDecision:
        preview = self._preview(tool)
        if prior_failed:
            note = (
                f"Blocked: `{tool.name}` already failed with the same arguments "
                f"({preview}). Approval ≠ success — do not resubmit the identical "
                "command. Fix the error from the prior result or change approach, "
                "then conclude."
            )
        else:
            note = (
                f"Blocked: `{tool.name}` repeated {count} times with the same "
                f"arguments ({preview}). Do not retry; conclude from prior results."
            )
        return PreToolDecision(
            action="deny",
            result={
                "ok": False,
                "error": "repeated_identical_tool",
                "stop_repeating": True,
                "repeat_count": count,
                "prior_failed": prior_failed,
                "_pipeline_deny": True,
                "_untrusted": True,
                "_note": note,
            },
        )

    async def pre(self, tool: ToolExec) -> PreToolDecision:
        if tool.name in self.exclude:
            return PreToolDecision()
        count = self._bump(tool)
        if self._fail_streak >= 1 and count >= self.fail_deny_at:
            return self._deny(tool, count, prior_failed=True)
        if count >= self.hard_deny_at:
            return self._deny(tool, count, prior_failed=False)
        return PreToolDecision()

    def note_result(
        self,
        name: str,
        arguments: dict[str, Any] | None,
        result: Any,
    ) -> str | None:
        """Record host/tool outcome (pipeline post often sees None for deferred exec).

        Returns an advisory string when the same failing command is about to loop.
        """
        if name in self.exclude:
            return None
        key = repeat_tool_key(name, arguments)
        if key != self._last_key:
            return None
        if tool_result_failed(result):
            self._fail_streak += 1
            if self._fail_streak >= 1 and self._count >= 1:
                preview = key
                if len(preview) > self.preview_chars:
                    omitted = len(preview) - self.preview_chars
                    preview = preview[: self.preview_chars] + f"…(+{omitted} chars)"
                return (
                    f"`{name}` failed with these exact arguments ({preview}). "
                    "Do not call it again unchanged — read stderr/stdout, fix the "
                    "script or choose a different approach. Approval only authorizes "
                    "execution; it does not make a broken command succeed."
                )
            return None
        self._fail_streak = 0
        return None

    async def post(self, tool: ToolExec, result: Any) -> PostToolDecision:
        if tool.name in self.exclude:
            return PostToolDecision()
        # Host tools usually return None here; note_result handles real payloads.
        if result is not None:
            note = self.note_result(tool.name, tool.arguments, result)
            if note:
                return PostToolDecision(additional_contexts=[note])
        if self._count >= self.hard_deny_at:
            return PostToolDecision()
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
            preview = self._preview(tool)
            text = (
                f"You have called `{tool.name}` with the same arguments "
                f"{self._count} times in a row.\n"
                f"Arguments: {preview}\n"
                "Stop repeating. Re-read the last tool result, change approach, "
                "or conclude if the task cannot proceed."
            )
        return PostToolDecision(additional_contexts=[text])
