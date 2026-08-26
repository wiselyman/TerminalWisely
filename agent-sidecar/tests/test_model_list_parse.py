from app.llm.gateway import (
    looks_like_filesystem_model_path,
    parse_openai_models_catalog,
    parse_openai_models_payload,
    resolve_served_model_id,
)
from app.paths import resolve_openai_compat_base_url

VLLM_CATALOG = {
    "object": "list",
    "data": [
        {
            "id": "Qwen3.8-spark",
            "object": "model",
            "root": "/root/.cache/huggingface/hub/models--unsloth--Qwen3.8-27B-NVFP4/snapshots/9e3d73c76eddb75f795cc24ccfbc5affe41c66bd",
        }
    ],
}


def test_parse_openai_models_payload() -> None:
    assert parse_openai_models_payload(
        {"data": [{"id": "gpt-4o"}, {"id": "gpt-4o-mini"}, {"id": "gpt-4o"}]}
    ) == ["gpt-4o", "gpt-4o-mini"]


def test_parse_vllm_catalog_uses_id_not_root() -> None:
    catalog = parse_openai_models_catalog(VLLM_CATALOG)
    assert catalog == [
        {
            "id": "Qwen3.8-spark",
            "root": "/root/.cache/huggingface/hub/models--unsloth--Qwen3.8-27B-NVFP4/snapshots/9e3d73c76eddb75f795cc24ccfbc5affe41c66bd",
        }
    ]
    assert parse_openai_models_payload(VLLM_CATALOG) == ["Qwen3.8-spark"]


def test_resolve_served_model_id_from_root_path() -> None:
    catalog = parse_openai_models_catalog(VLLM_CATALOG)
    root = catalog[0]["root"]
    assert resolve_served_model_id(root, catalog) == "Qwen3.8-spark"
    assert resolve_served_model_id("Qwen3.8-spark", catalog) == "Qwen3.8-spark"


def test_looks_like_filesystem_model_path() -> None:
    assert looks_like_filesystem_model_path(
        "/root/.cache/huggingface/hub/models--unsloth--Qwen3.8-27B-NVFP4/snapshots/x"
    )
    assert not looks_like_filesystem_model_path("Qwen3.8-spark")


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
