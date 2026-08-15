from app.llm.gateway import parse_openai_models_payload
from app.paths import resolve_openai_compat_base_url


def test_parse_openai_models_payload() -> None:
    assert parse_openai_models_payload(
        {"data": [{"id": "gpt-4o"}, {"id": "gpt-4o-mini"}, {"id": "gpt-4o"}]}
    ) == ["gpt-4o", "gpt-4o-mini"]


def test_parse_ollama_tags_shape() -> None:
    assert parse_openai_models_payload(
        {"models": [{"name": "llama3.2:latest"}, {"name": "qwen2.5"}]}
    ) == ["llama3.2:latest", "qwen2.5"]


def test_resolve_base_urls() -> None:
    assert resolve_openai_compat_base_url("openai", "", "") == "https://api.openai.com/v1"
    assert (
        resolve_openai_compat_base_url("gemini", "", "")
        == "https://generativelanguage.googleapis.com/v1beta/openai"
    )
    assert resolve_openai_compat_base_url("ollama", "", "http://127.0.0.1:11434") == (
        "http://127.0.0.1:11434/v1"
    )
    assert resolve_openai_compat_base_url("anthropic", "", "") == ""
    assert resolve_openai_compat_base_url(
        "anthropic", "http://127.0.0.1:4000/v1", ""
    ) == "http://127.0.0.1:4000/v1"


def test_validate_http_base_url() -> None:
    from app.paths import validate_http_base_url

    assert validate_http_base_url("") is not None
    assert validate_http_base_url("not-a-url") is not None
    assert validate_http_base_url("ftp://x") is not None
    assert validate_http_base_url("http://127.0.0.1:11434") is None
    assert validate_http_base_url("https://api.openai.com/v1") is None
