"""Approval intent language must match the user's conversation language."""

from __future__ import annotations

import re
from typing import Any

_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RE = re.compile(r"[A-Za-z]")


def _cjk_count(text: str) -> int:
    return len(_CJK_RE.findall(text or ""))


def conversation_locale(messages: list[dict[str, Any]]) -> str:
    """Infer zh vs en from recent user turns."""
    chunks: list[str] = []
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            chunks.append(content.strip())
        if len(chunks) >= 4:
            break
    if not chunks:
        return "en"
    combined = "\n".join(chunks)
    cjk = _cjk_count(combined)
    if cjk >= 2:
        return "zh"
    if cjk == 0 and _LATIN_RE.search(combined):
        return "en"
    return "en"


def _looks_english_prose(text: str) -> bool:
    raw = (text or "").strip()
    if not raw:
        return False
    cjk = _cjk_count(raw)
    latin = len(_LATIN_RE.findall(raw))
    return cjk == 0 and latin >= 8


def sanitize_approval_intent(intent: str | None, messages: list[dict[str, Any]]) -> str:
    """Drop or replace intent text that ignores the user's language."""
    text = (intent or "").strip()
    locale = conversation_locale(messages)
    if locale == "zh":
        if not text:
            return "将执行下方命令；请确认后继续。"
        if _looks_english_prose(text):
            return "将执行下方命令；请确认后继续。"
        return text
    if locale == "en":
        if not text:
            return "Will run the command below; please confirm to proceed."
        if _cjk_count(text) >= 4 and _cjk_count(text) > len(_LATIN_RE.findall(text)):
            return "Will run the command below; please confirm to proceed."
        return text
    return text or "Will run the command below; please confirm to proceed."
