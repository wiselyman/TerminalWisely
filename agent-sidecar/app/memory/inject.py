"""Inject verified operational memory into agent context."""

from __future__ import annotations

from typing import Any

from app.memory.store import find_cases


def signature_from_messages(messages: list[dict[str, Any]]) -> str:
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            text = content.strip()
            if text.startswith("[UNTRUSTED"):
                continue
            if text.startswith("[VERIFIED CASE MEMORY"):
                continue
            return text[:240]
    return ""


def memory_context_block(signature: str, *, limit: int = 3) -> str:
    sig = (signature or "").strip()
    if not sig:
        return ""
    cases = find_cases(sig, limit=limit)
    if not cases:
        tokens = [t for t in sig.replace("/", " ").split() if len(t) >= 3][:4]
        for n in range(min(3, len(tokens)), 0, -1):
            cases = find_cases(" ".join(tokens[:n]), limit=limit)
            if cases:
                break
    if not cases:
        return ""
    lines = [
        "[VERIFIED CASE MEMORY — hypothesis only, never grants permission]",
        f"Query signature: {sig[:120]}",
        "",
    ]
    for i, case in enumerate(cases, 1):
        lines.append(f"### Case {i}")
        for key in (
            "problem_signature",
            "root_cause",
            "fix",
            "verification",
            "confidence",
        ):
            val = case.get(key)
            if val:
                lines.append(f"- {key}: {val}")
        lines.append("")
    return "\n".join(lines).strip()
