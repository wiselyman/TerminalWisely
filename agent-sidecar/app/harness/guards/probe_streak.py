"""Conclude after a long streak of investigative probes (generic, not task-specific).

Weak models often alternate narrate + terminal_exec/web_* without answering.
Exact-arg RepeatToolReminder does not catch similar-but-different reads.
This streak counter forces tool_choice=none + CONCLUDE once evidence piles up.
"""

from __future__ import annotations

from typing import Any

# Tools that gather facts rather than mutate. Not a software allowlist — a risk class.
PROBE_TOOL_NAMES = frozenset(
    {
        "terminal_exec",
        "web_search",
        "web_fetch",
        "k8s_list",
        "k8s_get",
        "k8s_describe",
        "k8s_logs",
        "k8s_events",
    }
)

# After this many consecutive probe tool calls since the last real user turn /
# final answer, harness forces a no-tool conclude sample.
PROBE_STREAK_FORCE_THRESHOLD = 4

FORCE_TOOL_CHOICE_NONE_KEY = "_force_tool_choice_none"
PROBE_CONCLUDE_SENT_KEY = "_probe_conclude_sent"


def _tool_name(tc: dict[str, Any]) -> str:
    fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
    return str((fn or {}).get("name") or tc.get("name") or "").strip()


def _is_harness_user(content: Any) -> bool:
    text = str(content or "").lstrip()
    return text.startswith("[HARNESS]") or text.startswith("[AGENT_STATUS]")


def probe_tool_streak(messages: list[dict[str, Any]]) -> int:
    """Count consecutive probe tool calls from the end of the transcript.

    Streak breaks on: real user message, assistant final answer (content, no
    tools), or a non-probe tool call.
    """
    streak = 0
    for msg in reversed(messages):
        role = msg.get("role")
        if role == "tool":
            continue
        if role == "user":
            if _is_harness_user(msg.get("content")):
                continue
            break
        if role != "assistant":
            continue
        tool_calls = msg.get("tool_calls") or []
        if not tool_calls:
            if str(msg.get("content") or "").strip():
                break
            continue
        names = [_tool_name(tc) for tc in tool_calls if isinstance(tc, dict)]
        if not names or any(n not in PROBE_TOOL_NAMES for n in names):
            break
        streak += len(names)
    return streak


def should_force_probe_conclude(streak: int, *, threshold: int | None = None) -> bool:
    limit = PROBE_STREAK_FORCE_THRESHOLD if threshold is None else threshold
    return streak >= limit
