import os

from app.paths import apply_runtime_config, ai_base_url, ai_model, ai_provider


def test_apply_runtime_config_switches_model(monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_PROVIDER", "ollama")
    monkeypatch.setenv("TW_AI_MODEL", "old")
    monkeypatch.setenv("TW_AI_OLLAMA_BASE", "http://127.0.0.1:11434")
    monkeypatch.delenv("TW_AI_BASE_URL", raising=False)

    out = apply_runtime_config(
        provider="ollama",
        model="bonsai",
        base_url="",
        ollama_base_url="http://127.0.0.1:11434",
        api_key="",
        security_mode="safe",
    )
    assert out["model"] == "bonsai"
    assert ai_model() == "bonsai"
    assert ai_provider() == "ollama"
    assert ai_base_url().endswith("/v1")
    assert os.environ.get("TW_AI_API_KEY") == ""


def test_apply_runtime_config_openai_base(monkeypatch) -> None:
    out = apply_runtime_config(
        provider="openai",
        model="gpt-test",
        base_url="https://api.example.com/v1",
        ollama_base_url="",
        api_key="sk-x",
        security_mode="observe",
    )
    assert out["model"] == "gpt-test"
    assert out["base_url"] == "https://api.example.com/v1"
    assert os.environ["TW_AI_API_KEY"] == "sk-x"
    assert out["security_mode"] == "observe"


def test_apply_runtime_config_cursor_api_key(monkeypatch) -> None:
    monkeypatch.delenv("CURSOR_API_KEY", raising=False)
    out = apply_runtime_config(
        provider="ollama",
        model="x",
        base_url="",
        ollama_base_url="http://127.0.0.1:11434",
        api_key="",
        security_mode="safe",
        cursor_api_key="cursor-secret",
    )
    assert os.environ.get("CURSOR_API_KEY") == "cursor-secret"
    assert out["has_cursor_api_key"] == "1"
