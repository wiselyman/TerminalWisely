"""Local / Ollama endpoints do not require an API key."""

from __future__ import annotations

import os

from app import paths


def test_ollama_provider_is_local(monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_PROVIDER", "ollama")
    monkeypatch.delenv("TW_AI_BASE_URL", raising=False)
    assert paths.is_local_model_endpoint()
    assert paths.ai_base_url().endswith("/v1")
    assert "11434" in paths.ai_base_url()


def test_loopback_base_url_is_local(monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_PROVIDER", "openai")
    monkeypatch.setenv("TW_AI_BASE_URL", "http://127.0.0.1:1234/v1")
    assert paths.is_local_model_endpoint()


def test_tailscale_cgnat_is_local(monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_PROVIDER", "custom")
    monkeypatch.setenv("TW_AI_BASE_URL", "http://100.82.29.47:8000/v1")
    assert paths.is_local_model_endpoint()


def test_cloud_openai_is_not_local(monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_PROVIDER", "openai")
    monkeypatch.setenv("TW_AI_BASE_URL", "https://api.openai.com/v1")
    assert not paths.is_local_model_endpoint()


def test_gateway_skips_empty_key_for_local(monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_PROVIDER", "custom")
    monkeypatch.setenv("TW_AI_BASE_URL", "http://localhost:8080/v1")
    monkeypatch.setenv("TW_AI_API_KEY", "")
    # Import after env so defaults are irrelevant; gateway reads paths at call time.
    from app.llm.gateway import ModelGateway

    g = ModelGateway(api_key="")
    assert paths.is_local_model_endpoint(g.base_url)
