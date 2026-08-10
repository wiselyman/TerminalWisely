"""Keep chat messages under the model context window."""

from __future__ import annotations

import json
from typing import Any

from app.llm.thinking import sanitize_assistant_content

# Leave headroom under common local limits (8k/16k) for tools + generation.
_DEFAULT_CONTEXT_TOKENS = 12_000
_MAX_TOOL_CONTENT_CHARS = 6_000
_MAX_ASSISTANT_CHARS = 4_000
_MAX_USER_CHARS = 4_000


def estimate_tokens(text: str) -> int:
    """Rough token estimate (CJK-heavy ≈ 1 token / 2 chars, else /4)."""
    raw = text or ""
    if not raw:
        return 0
    cjk = sum(1 for c in raw if "\u4e00" <= c <= "\u9fff")
    if cjk * 2 >= len(raw):
        return max(1, (len(raw) + 1) // 2)
    return max(1, (len(raw) + 3) // 4)


def _clip(text: str, limit: int) -> str:
    s = text or ""
    if len(s) <= limit:
        return s
    return s[: limit - 20] + "\n…[truncated]"


def truncate_tool_payload(payload: dict[str, Any], *, limit: int = _MAX_TOOL_CONTENT_CHARS) -> dict[str, Any]:
    out = dict(payload)
    for key in ("stdout", "stderr", "error", "content", "text"):
        val = out.get(key)
        if isinstance(val, str) and len(val) > limit // 2:
            out[key] = _clip(val, limit // 2)
    encoded = json.dumps(out, ensure_ascii=False)
    if len(encoded) > limit:
        # Last resort: keep ok/exit_code only + short stdout.
        slim = {
            "ok": out.get("ok"),
            "exit_code": out.get("exit_code"),
            "stdout": _clip(str(out.get("stdout") or ""), 1500),
            "stderr": _clip(str(out.get("stderr") or ""), 800),
            "error": _clip(str(out.get("error") or ""), 400),
            "_truncated": True,
        }
        return slim
    return out


def compact_messages_for_model(
    messages: list[dict[str, Any]],
    *,
    max_context_tokens: int = _DEFAULT_CONTEXT_TOKENS,
    tools_overhead_tokens: int = 1_500,
) -> list[dict[str, Any]]:
    """Return a copy of messages trimmed to fit roughly under the context budget."""
    budget = max(2_000, max_context_tokens - tools_overhead_tokens)
    out: list[dict[str, Any]] = []
    for msg in messages:
        m = dict(msg)
        role = m.get("role")
        content = m.get("content")
        if isinstance(content, str):
            if role == "assistant":
                cleaned = sanitize_assistant_content(content) or content
                m["content"] = _clip(cleaned, _MAX_ASSISTANT_CHARS)
            elif role == "tool":
                m["content"] = _clip(content, _MAX_TOOL_CONTENT_CHARS)
            elif role == "user":
                m["content"] = _clip(content, _MAX_USER_CHARS)
            elif role == "system":
                m["content"] = _clip(content, 8_000)
        out.append(m)

    def total_tokens(msgs: list[dict[str, Any]]) -> int:
        n = 0
        for m in msgs:
            n += estimate_tokens(str(m.get("content") or ""))
            for tc in m.get("tool_calls") or []:
                n += estimate_tokens(json.dumps(tc, ensure_ascii=False))
        return n

    # Drop oldest non-system messages until under budget (keep last user turn).
    while total_tokens(out) > budget and len(out) > 2:
        # Never drop the first system message.
        drop_at = 1 if out and out[0].get("role") == "system" else 0
        if drop_at >= len(out) - 1:
            break
        out.pop(drop_at)

    # If still oversized, aggressively shrink tool messages.
    if total_tokens(out) > budget:
        for m in out:
            if m.get("role") == "tool" and isinstance(m.get("content"), str):
                m["content"] = _clip(str(m["content"]), 1_200)

    return out


def sanitize_history_item(role: str, content: str) -> str | None:
    """Clean FE-seeded history; drop pure CoT assistant dumps."""
    text = (content or "").strip()
    if not text:
        return None
    if role == "assistant":
        cleaned = sanitize_assistant_content(text)
        if not cleaned:
            return None
        return _clip(cleaned, _MAX_ASSISTANT_CHARS)
    return _clip(text, _MAX_USER_CHARS)
