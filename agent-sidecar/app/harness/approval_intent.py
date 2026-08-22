"""Tool/approval intent language must match the latest user message."""

from __future__ import annotations

import re
from typing import Any

_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RE = re.compile(r"[A-Za-z]")


def _cjk_count(text: str) -> int:
    return len(_CJK_RE.findall(text or ""))


def _latin_count(text: str) -> int:
    return len(_LATIN_RE.findall(text or ""))


def latest_user_text(messages: list[dict[str, Any]]) -> str:
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
    return ""


def conversation_locale(messages: list[dict[str, Any]]) -> str:
    """Infer zh vs en from the *latest* user turn only.

    Earlier turns must not pin the language — mixed chats (Chinese history +
    an English follow-up) must switch to English for that turn.
    """
    text = latest_user_text(messages)
    if not text:
        return "en"
    cjk = _cjk_count(text)
    latin = _latin_count(text)
    if cjk >= 2 and cjk >= latin // 4:
        return "zh"
    if latin >= 2:
        return "en"
    if cjk >= 1:
        return "zh"
    return "en"


def _looks_english_prose(text: str) -> bool:
    raw = (text or "").strip()
    if not raw:
        return False
    cjk = _cjk_count(raw)
    latin = _latin_count(raw)
    return cjk == 0 and latin >= 8


def _looks_chinese_prose(text: str) -> bool:
    raw = (text or "").strip()
    if not raw:
        return False
    cjk = _cjk_count(raw)
    latin = _latin_count(raw)
    return cjk >= 2 and cjk >= max(1, latin // 3)


def sanitize_approval_intent(intent: str | None, messages: list[dict[str, Any]]) -> str:
    """Drop or replace intent text that ignores the latest user language."""
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
        if _looks_chinese_prose(text):
            return "Will run the command below; please confirm to proceed."
        return text
    return text or "Will run the command below; please confirm to proceed."
