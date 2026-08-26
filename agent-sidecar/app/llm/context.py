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
# Keep more of the *latest* user turn (attachments + instruction).
_MAX_LATEST_USER_CHARS = 24_000


def estimate_tokens(text: str) -> int:
    """Rough token estimate (CJK-heavy ≈ 1 token / 2 chars, else /4)."""
    raw = text or ""
    if not raw:
        return 0
    cjk = sum(1 for c in raw if "\u4e00" <= c <= "\u9fff")
    if cjk * 2 >= len(raw):
        return max(1, (len(raw) + 1) // 2)
    return max(1, (len(raw) + 3) // 4)


def estimate_message_content_tokens(content: Any) -> int:
    """Estimate tokens for str or multimodal list content (images ≈ fixed cost)."""
    if content is None:
        return 0
    if isinstance(content, str):
        return estimate_tokens(content)
    if isinstance(content, list):
        n = 0
        for part in content:
            if not isinstance(part, dict):
                n += estimate_tokens(str(part))
                continue
            if part.get("type") == "text":
                n += estimate_tokens(str(part.get("text") or ""))
            elif part.get("type") == "image_url":
                n += 1_200
            else:
                n += estimate_tokens(str(part))
        return n
    return estimate_tokens(str(content))


def _clip(text: str, limit: int) -> str:
    s = text or ""
    if len(s) <= limit:
        return s
    return s[: limit - 20] + "\n…[truncated]"


def _clip_keep_ends(text: str, limit: int) -> str:
    """Keep head and tail so a trailing (or leading) user instruction survives."""
    s = text or ""
    if len(s) <= limit:
        return s
    marker = "\n…[truncated]…\n"
    keep = max(80, (limit - len(marker)) // 2)
    return s[:keep] + marker + s[-keep:]


def _image_url_usable(url: str) -> bool:
    """False for disk-redacted placeholders and other non-decodable image URLs."""
    u = (url or "").strip()
    if not u.startswith("data:") or ";base64," not in u:
        return False
    b64 = u.split(";base64,", 1)[1].strip()
    if not b64 or b64 == "[omitted]" or "[omitted]" in b64:
        return False
    # Minimal sanity: base64 alphabet (allow padding / whitespace)
    sample = b64[:64].replace("\n", "").replace("\r", "")
    return all(
        c.isalnum() or c in "+/="
        for c in sample
    )


def sanitize_user_content_for_model(content: Any) -> Any:
    """Drop invalid/redacted image parts so providers do not 400 on resume."""
    if not isinstance(content, list):
        return content
    kept: list[Any] = []
    dropped = 0
    for part in content:
        if isinstance(part, dict) and part.get("type") == "image_url":
            url = ""
            img = part.get("image_url")
            if isinstance(img, dict):
                url = str(img.get("url") or "")
            elif isinstance(img, str):
                url = img
            if not _image_url_usable(url):
                dropped += 1
                continue
            kept.append(part)
            continue
        kept.append(part)
    if dropped:
        note = (
            f"[prior image attachment unavailable in session history"
            f"{f' ×{dropped}' if dropped > 1 else ''}]"
        )
        if (
            kept
            and isinstance(kept[0], dict)
            and kept[0].get("type") == "text"
        ):
            kept[0] = {
                "type": "text",
                "text": f"{kept[0].get('text') or ''}\n{note}".strip(),
            }
        else:
            kept.insert(0, {"type": "text", "text": note})
    if not kept:
        return note if dropped else ""
    if (
        len(kept) == 1
        and isinstance(kept[0], dict)
        and kept[0].get("type") == "text"
        and dropped
    ):
        return str(kept[0].get("text") or "")
    return kept


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
    last_user_idx = -1
    for i, msg in enumerate(messages):
        if msg.get("role") == "user":
            last_user_idx = i

    out: list[dict[str, Any]] = []
    for i, msg in enumerate(messages):
        m = dict(msg)
        role = m.get("role")
        content = m.get("content")
        user_limit = (
            _MAX_LATEST_USER_CHARS if role == "user" and i == last_user_idx else _MAX_USER_CHARS
        )
        if isinstance(content, str):
            if role == "assistant":
                cleaned = sanitize_assistant_content(content) or content
                m["content"] = _clip(cleaned, _MAX_ASSISTANT_CHARS)
            elif role == "tool":
                m["content"] = _clip(content, _MAX_TOOL_CONTENT_CHARS)
            elif role == "user":
                m["content"] = _clip_keep_ends(content, user_limit)
            elif role == "system":
                m["content"] = _clip(content, 8_000)
        elif isinstance(content, list) and role == "user":
            content = sanitize_user_content_for_model(content)
            if isinstance(content, str):
                m["content"] = _clip_keep_ends(content, user_limit)
            elif isinstance(content, list):
                clipped: list[Any] = []
                for part in content:
                    if isinstance(part, dict) and part.get("type") == "text":
                        clipped.append(
                            {
                                "type": "text",
                                "text": _clip_keep_ends(
                                    str(part.get("text") or ""), user_limit
                                ),
                            }
                        )
                    else:
                        clipped.append(part)
                m["content"] = clipped
            else:
                m["content"] = content
        out.append(m)

    def total_tokens(msgs: list[dict[str, Any]]) -> int:
        n = 0
        for m in msgs:
            n += estimate_message_content_tokens(m.get("content"))
            for tc in m.get("tool_calls") or []:
                n += estimate_tokens(json.dumps(tc, ensure_ascii=False))
        return n

    # Drop oldest non-system messages until under budget; never drop last user turn.
    while total_tokens(out) > budget and len(out) > 2:
        protected_user = max(
            (i for i, m in enumerate(out) if m.get("role") == "user"),
            default=-1,
        )
        drop_at = 1 if out and out[0].get("role") == "system" else 0
        if drop_at == protected_user:
            drop_at += 1
        if drop_at >= len(out) or drop_at == protected_user:
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
