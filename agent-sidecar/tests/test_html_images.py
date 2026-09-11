"""Unit tests for HTML image URL extraction (generic, no site lists)."""

from app.research.html_images import extract_image_urls_from_html


def test_prefers_og_image_then_img_src():
    html = """
    <html><head>
      <meta property="og:image" content="/cdn/hero.png" />
      <meta name="twitter:image" content="https://cdn.example/tw.jpg" />
    </head><body>
      <img src="/assets/robot.png" alt="arm" />
      <img src="data:image/gif;base64,AAAA" />
      <img src="/favicon.ico" />
    </body></html>
    """
    urls = extract_image_urls_from_html(html, base_url="https://example.com/page")
    assert urls[0] == "https://example.com/cdn/hero.png"
    assert "https://cdn.example/tw.jpg" in urls
    assert "https://example.com/assets/robot.png" in urls
    assert not any("favicon" in u for u in urls)
    assert not any(u.startswith("data:") for u in urls)


def test_skips_decorative_and_respects_limit():
    html = "".join(
        f'<img src="/img/{i}.png" />' for i in range(20)
    ) + '<img src="/spacer.gif" />'
    urls = extract_image_urls_from_html(
        html, base_url="https://ex.test/", limit=3
    )
    assert len(urls) == 3
    assert urls[0] == "https://ex.test/img/0.png"


def test_link_rel_image_src():
    html = '<link rel="image_src" href="https://cdn.example/cover.webp" />'
    urls = extract_image_urls_from_html(html, base_url="https://example.com/")
    assert urls == ["https://cdn.example/cover.webp"]
