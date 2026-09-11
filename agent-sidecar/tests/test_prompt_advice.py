"""System prompt: stable prefix; volatile date/skills/memory in turn tail."""

from __future__ import annotations

from app.agent.prompts import SYSTEM_PROMPT, build_system_prompt, turn_context_block


def test_static_system_excludes_today_placeholder() -> None:
    assert "{today_utc}" not in SYSTEM_PROMPT
    assert "Today (UTC):" not in SYSTEM_PROMPT
    assert "ollama" not in SYSTEM_PROMPT.lower()
    assert "sglang" not in SYSTEM_PROMPT.lower()
    text = build_system_prompt(security_mode="safe", model="qwen")
    assert "Today (UTC):" not in text
    assert "inference runtimes" in text or "package managers" in text


def test_turn_context_carries_today_and_memory(tmp_path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    from app.memory.user_store import put_user_memory

    put_user_memory(prefs=["默认中文"])
    block = turn_context_block(None)
    assert "Today (UTC):" in block
    assert "默认中文" in block


def test_prompt_long_job_timeout_and_no_blind_rerun() -> None:
    assert "TOOL_TIMEOUT" in SYSTEM_PROMPT
    assert "timeout_seconds" in SYSTEM_PROMPT
    assert "re-clone" in SYSTEM_PROMPT or "re-run" in SYSTEM_PROMPT
    assert "verbatim" in SYSTEM_PROMPT
    assert "indentation" in SYSTEM_PROMPT
    text = build_system_prompt(security_mode="safe", model="qwen")
    assert "TOOL_TIMEOUT" in text


def test_prompt_status_query_stays_readonly() -> None:
    assert "read-only" in SYSTEM_PROMPT
    assert "pkill" in SYSTEM_PROMPT
    assert "ask_user" in SYSTEM_PROMPT
    assert "partial" in SYSTEM_PROMPT or "destination directory" in SYSTEM_PROMPT
    text = build_system_prompt(security_mode="safe", model="qwen")
    assert "pkill" in text
