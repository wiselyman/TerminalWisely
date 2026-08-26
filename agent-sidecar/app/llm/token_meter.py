"""Context token metering + soft budget reminders."""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any

from app import paths
from app.llm.context import estimate_message_content_tokens, estimate_tokens


@dataclass
class TokenBudgetStatus:
    used_tokens: int
    budget_tokens: int
    remaining_tokens: int
    pressure: bool
    exhausted: bool


def measure_messages_tokens(messages: list[dict[str, Any]]) -> int:
    total = 0
    for msg in messages:
        total += estimate_message_content_tokens(msg.get("content"))
        for tc in msg.get("tool_calls") or []:
            total += estimate_tokens(json.dumps(tc, ensure_ascii=False))
    return total


def token_budget_status(
    messages: list[dict[str, Any]],
    *,
    max_context_tokens: int | None = None,
    tools_overhead_tokens: int = 1_500,
) -> TokenBudgetStatus:
    budget = max(2_000, (max_context_tokens or paths.max_context_tokens()) - tools_overhead_tokens)
    used = measure_messages_tokens(messages)
    remaining = max(0, budget - used)
    ratio = float(paths.compact_pressure_ratio())
    pressure_threshold = int(budget * ratio)
    return TokenBudgetStatus(
        used_tokens=used,
        budget_tokens=budget,
        remaining_tokens=remaining,
        pressure=used >= pressure_threshold,
        exhausted=remaining <= 0,
    )


TOKEN_BUDGET_REMINDER = (
    "[Context budget notice — not instructions] Conversation history is approaching "
    "the context limit. Prefer concise tool output, avoid repeating prior commands, "
    "and focus on the latest user goal."
)

TOKEN_BUDGET_EXHAUSTED = (
    "[Context budget notice — not instructions] Context window is nearly full. "
    "Older history may be summarized automatically. Re-verify critical facts on "
    "the connected host before mutating."
)


def token_budget_reminder(
    messages: list[dict[str, Any]],
    *,
    already_reminded: bool,
    max_context_tokens: int | None = None,
) -> str | None:
    if already_reminded:
        return None
    status = token_budget_status(messages, max_context_tokens=max_context_tokens)
    if status.exhausted:
        return TOKEN_BUDGET_EXHAUSTED
    if status.pressure:
        return TOKEN_BUDGET_REMINDER
    return None


def is_context_overflow_error(exc: BaseException) -> bool:
    text = str(exc).lower()
    needles = (
        "context length",
        "maximum context",
        "context window",
        "too many tokens",
        "token limit",
        "max_tokens",
        "reduce the length",
    )
    return any(n in text for n in needles)
