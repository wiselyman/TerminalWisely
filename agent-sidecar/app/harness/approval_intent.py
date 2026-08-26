"""Tool/approval intent language must match the latest user message."""

from __future__ import annotations

import re
from typing import Any

from app.harness.command_display import first_executable_statement, sanitize_terminal_command

_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RE = re.compile(r"[A-Za-z]")

_GENERIC_INTENT = {
    "will run the command below; please confirm to proceed.",
    "will run the command below",
    "please confirm to proceed.",
    "将执行下方命令；请确认后继续。",
    "将执行下方命令",
    "请确认后继续。",
    "请确认后继续",
}


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


def _is_generic_waffle(text: str) -> bool:
    raw = (text or "").strip().lower().rstrip(".")
    if not raw:
        return True
    if raw in _GENERIC_INTENT or raw + "." in _GENERIC_INTENT:
        return True
    # Near-duplicates the model sometimes invents
    if "command below" in raw and "confirm" in raw:
        return True
    if "下方命令" in (text or "") and "确认" in (text or ""):
        return True
    return False


def intent_from_command(command: str, locale: str) -> str:
    """Build a concrete UI intent from the shell when the model left intent empty."""
    preview = first_executable_statement(command or "")
    if not preview:
        preview = re.sub(r"\s+", " ", sanitize_terminal_command(command or "")).strip()
    if len(preview) > 96:
        preview = preview[:93].rstrip() + "…"
    if not preview:
        return "确认执行此命令" if locale == "zh" else "Confirm this command"
    if locale == "zh":
        return f"执行：{preview}"
    return f"Run: {preview}"


def sanitize_approval_intent(
    intent: str | None,
    messages: list[dict[str, Any]],
    command: str = "",
) -> str:
    """Drop waffle / wrong-language placeholders; never invent empty confirm fluff."""
    text = (intent or "").strip()
    if _is_generic_waffle(text):
        text = ""
    locale = conversation_locale(messages)

    if text:
        mismatched = (locale == "zh" and _looks_english_prose(text)) or (
            locale == "en" and _looks_chinese_prose(text)
        )
        if mismatched:
            # Prefer a concrete command-derived title over language waffle.
            if (command or "").strip():
                return intent_from_command(command, locale)
            # Keep substantive text rather than replacing with empty talk.
            return text
        return text

    return intent_from_command(command, locale)
