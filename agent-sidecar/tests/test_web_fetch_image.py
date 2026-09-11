"""Tests for chat media cache helpers and web_fetch image branch."""

from __future__ import annotations

import httpx
import pytest

from app.media_cache import detect_image_kind, store_image_bytes


def test_detect_png_magic() -> None:
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    assert detect_image_kind(png, "") == "png"
    assert detect_image_kind(b"not-image", "text/html") is None


def test_store_image_bytes(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
    stored = store_image_bytes(png, "image/png")
    assert stored["kind"] == "image"
    assert stored["media_id"]
    assert (tmp_path / "media" / f"{stored['media_id']}.png").is_file()
    loaded = __import__("app.media_cache", fromlist=["load_media_data_url"]).load_media_data_url(
        stored["media_id"]
    )
    assert loaded["data_url"].startswith("data:image/png;base64,")


@pytest.mark.asyncio
async def test_web_fetch_image_branch(tmp_path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    from app.research.provider import ResearchProvider

    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32

    def handler(request: httpx.Request) -> httpx.Response:
        assert str(request.url) == "https://example.com/a.png"
        return httpx.Response(200, content=png, headers={"content-type": "image/png"})

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport)
    provider = ResearchProvider(client=client)
    try:
        out = await provider.web_fetch("https://example.com/a.png")
    finally:
        await provider.aclose()
    assert out["ok"] is True
    assert out["kind"] == "image"
    assert out["media_id"]
    assert "media:" in out["markdown"]
    assert out["text"] == ""


@pytest.mark.asyncio
async def test_web_fetch_html_embeds_page_images(
    tmp_path, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    from app.research.provider import ResearchProvider

    png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32
    html = """
    <html><head>
      <meta property="og:image" content="https://cdn.example.com/hero.png" />
    </head><body><p>Franka robot page</p>
    <img src="/extra.png" /></body></html>
    """

    def handler(request: httpx.Request) -> httpx.Response:
        url = str(request.url)
        if url == "https://example.com/robots/panda":
            return httpx.Response(
                200, content=html.encode("utf-8"), headers={"content-type": "text/html"}
            )
        if url.endswith(".png"):
            return httpx.Response(200, content=png, headers={"content-type": "image/png"})
        return httpx.Response(404, text="missing")

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport)
    provider = ResearchProvider(client=client)
    try:
        out = await provider.web_fetch("https://example.com/robots/panda")
    finally:
        await provider.aclose()
    assert out["ok"] is True
    assert out["kind"] == "html"
    assert "Franka" in out["text"]
    assert out.get("image_candidates")
    assert out.get("images") and len(out["images"]) >= 1
    assert out.get("media_id")
    assert "media:" in (out.get("markdown") or "")


@pytest.mark.asyncio
async def test_images_generations_unsupported() -> None:
    from app.llm.gateway import ModelGateway

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path.endswith("/images/generations"):
            return httpx.Response(404, text="not found")
        return httpx.Response(200, json={"data": []})

    transport = httpx.MockTransport(handler)
    client = httpx.AsyncClient(transport=transport)
    gw = ModelGateway(
        base_url="https://api.example.com/v1",
        api_key="test-key",
        model="demo",
        client=client,
    )
    try:
        out = await gw.images_generations("a red cube")
    finally:
        await gw.aclose()
    assert out["ok"] is False
    assert out.get("unsupported") is True
