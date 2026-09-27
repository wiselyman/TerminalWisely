"""Provider API keys must not be the Base URL."""

import pytest

from app.llm.gateway import ModelGateway, ModelGatewayError


def test_url_shaped_api_key_is_rejected_before_http() -> None:
    gateway = ModelGateway(
        base_url="https://api.example.com",
        api_key="https://api.example.com",
    )
    with pytest.raises(ModelGatewayError, match="web address"):
        gateway._auth_headers_and_key()


def test_bearer_prefix_is_stripped() -> None:
    gateway = ModelGateway(
        base_url="https://api.example.com",
        api_key="Bearer sk-test",
    )
    headers, key = gateway._auth_headers_and_key()
    assert key == "sk-test"
    assert headers["Authorization"] == "Bearer sk-test"
