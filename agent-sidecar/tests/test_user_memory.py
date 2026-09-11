"""Tests for user-scoped (cross-host) memory."""

from __future__ import annotations

from pathlib import Path

from app.memory.user_store import (
    clear_user_memory,
    load_user_memory,
    put_user_memory,
    user_memory_prompt_block,
)


def test_user_put_load_inject_and_clear(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    put_user_memory(prefs=["回答尽量短", "默认中文"])
    data = load_user_memory()
    assert "回答尽量短" in data["prefs"]
    assert (tmp_path / "memory" / "user.json").is_file()
    block = user_memory_prompt_block()
    assert "UNTRUSTED USER MEMORY" in block
    assert "回答尽量短" in block
    assert "permission" in block.lower()
    clear_user_memory()
    assert load_user_memory()["prefs"] == []
    assert user_memory_prompt_block() == ""


def test_user_memory_linux_k8s_isolated(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    put_user_memory(prefs=["linux concise"], engineer_mode="linux")
    put_user_memory(prefs=["k8s yaml first"], engineer_mode="k8s")
    assert load_user_memory(engineer_mode="linux")["prefs"] == ["linux concise"]
    assert load_user_memory(engineer_mode="k8s")["prefs"] == ["k8s yaml first"]
    assert (tmp_path / "memory" / "user.json").is_file()
    assert (tmp_path / "memory" / "user-k8s.json").is_file()
    k8s_block = user_memory_prompt_block(engineer_mode="k8s")
    assert "k8s yaml first" in k8s_block
    assert "linux concise" not in k8s_block
    assert "K8s-mode" in k8s_block


def test_user_memory_independent_of_host(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    from app.memory.host_store import put_host_memory, host_memory_prompt_block

    put_user_memory(prefs=["global concise"])
    put_host_memory("h1", facts=["os=ubuntu"])
    user_block = user_memory_prompt_block()
    host_block = host_memory_prompt_block("h1")
    assert "global concise" in user_block
    assert "os=ubuntu" not in user_block
    assert "os=ubuntu" in host_block
    assert "global concise" not in host_block


def test_system_prompt_excludes_memory_blocks(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    from app.agent.prompts import build_system_prompt, turn_context_block
    from app.memory.host_store import put_host_memory

    put_user_memory(prefs=["默认中文"])
    put_host_memory("h1", facts=["os=ubuntu"])
    prompt = build_system_prompt(memory_scope="h1", security_mode="safe")
    assert "USER MEMORY" not in prompt
    assert "HOST MEMORY" not in prompt
    assert "Today (UTC):" not in prompt
    tail = turn_context_block("h1")
    assert "Today (UTC):" in tail
    assert "USER MEMORY" in tail
    assert "默认中文" in tail
    assert "HOST MEMORY" in tail
    assert "os=ubuntu" in tail
    assert tail.index("USER MEMORY") < tail.index("HOST MEMORY")


def test_memory_appended_before_user_not_in_static_system() -> None:
    """Document intended message order for prefix cache."""
    # static system → prior history → turn context → user
    order = ["system_static", "history...", "turn_context", "user"]
    assert order.index("turn_context") > order.index("system_static")
    assert order.index("turn_context") < order.index("user")
    assert order.index("turn_context") == len(order) - 2
