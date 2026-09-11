"""Extract public image URLs from HTML for chat media (generic, no site lists)."""

from __future__ import annotations

import re
from html import unescape
from urllib.parse import urljoin, urlparse

_META_IMAGE_RE = re.compile(
    r"<meta[^>]+(?:property|name)\s*=\s*[\"'](?:og:image|twitter:image|og:image:url)[\"'][^>]*>"
    r"|<meta[^>]+content\s*=\s*[\"'][^\"']+[\"'][^>]*(?:property|name)\s*=\s*[\"'](?:og:image|twitter:image|og:image:url)[\"'][^>]*>",
    re.I | re.S,
)
_META_CONTENT_RE = re.compile(r"content\s*=\s*[\"']([^\"']+)[\"']", re.I)
_IMG_SRC_RE = re.compile(r"<img\b[^>]*\bsrc\s*=\s*[\"']([^\"']+)[\"']", re.I | re.S)
_LINK_IMAGE_RE = re.compile(
    r"<link[^>]+rel\s*=\s*[\"'](?:image_src)[\"'][^>]+href\s*=\s*[\"']([^\"']+)[\"']"
    r"|<link[^>]+href\s*=\s*[\"']([^\"']+)[\"'][^>]+rel\s*=\s*[\"'](?:image_src)[\"']",
    re.I | re.S,
)

_SKIP_SUBSTR = (
    "1x1",
    "pixel",
    "spacer",
    "blank.gif",
    "data:image/svg",
    "favicon",
)


def _abs_url(base: str, href: str) -> str | None:
    raw = unescape((href or "").strip())
    if not raw or raw.startswith("#") or raw.lower().startswith("javascript:"):
        return None
    if raw.startswith("data:"):
        return None
    try:
        joined = urljoin(base, raw)
        p = urlparse(joined)
        if p.scheme not in ("http", "https") or not p.netloc:
            return None
        return joined
    except Exception:  # noqa: BLE001
        return None


def _looks_like_decorative(url: str) -> bool:
    low = url.lower()
    if any(s in low for s in _SKIP_SUBSTR):
        return True
    path = urlparse(low).path
    if path.endswith(".svg") or path.endswith(".ico"):
        return True
    return False


def extract_image_urls_from_html(html: str, *, base_url: str, limit: int = 8) -> list[str]:
    """Return absolute http(s) image candidate URLs from HTML, de-duplicated."""
    text = html or ""
    base = (base_url or "").strip() or "https://example.invalid/"
    found: list[str] = []
    seen: set[str] = set()

    def add(href: str) -> None:
        abs_u = _abs_url(base, href)
        if not abs_u or abs_u in seen or _looks_like_decorative(abs_u):
            return
        seen.add(abs_u)
        found.append(abs_u)

    for tag in _META_IMAGE_RE.finditer(text):
        cm = _META_CONTENT_RE.search(tag.group(0))
        if cm:
            add(cm.group(1))
        if len(found) >= limit:
            return found

    for m in _LINK_IMAGE_RE.finditer(text):
        add(m.group(1) or m.group(2) or "")
        if len(found) >= limit:
            return found

    for m in _IMG_SRC_RE.finditer(text):
        add(m.group(1))
        if len(found) >= limit:
            return found

    return found
