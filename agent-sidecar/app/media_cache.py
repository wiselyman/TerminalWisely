"""Persist chat media under TW_AI_DATA_DIR (shared with Rust cache layout)."""

from __future__ import annotations

import base64
import hashlib
import re
from pathlib import Path
from typing import Any

from app.paths import data_dir

_MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_IMAGE_BYTES = _MAX_IMAGE_BYTES

_PNG = b"\x89PNG\r\n\x1a\n"
_JPEG = b"\xff\xd8\xff"
_GIF87 = b"GIF87a"
_GIF89 = b"GIF89a"


def media_dir() -> Path:
    path = data_dir() / "media"
    path.mkdir(parents=True, exist_ok=True)
    return path


def detect_image_kind(data: bytes, content_type: str = "") -> str | None:
    if len(data) >= 3 and data.startswith(_JPEG):
        return "jpg"
    if len(data) >= 8 and data.startswith(_PNG):
        return "png"
    if len(data) >= 6 and (data.startswith(_GIF87) or data.startswith(_GIF89)):
        return "gif"
    if len(data) >= 12 and data.startswith(b"RIFF") and data[8:12] == b"WEBP":
        return "webp"
    ct = (content_type or "").lower()
    if "image/jpeg" in ct or "image/jpg" in ct:
        return "jpg"
    if "image/png" in ct:
        return "png"
    if "image/gif" in ct:
        return "gif"
    if "image/webp" in ct:
        return "webp"
    return None


def mime_for_ext(ext: str) -> str:
    return {
        "jpg": "image/jpeg",
        "png": "image/png",
        "gif": "image/gif",
        "webp": "image/webp",
    }.get(ext, "application/octet-stream")


def store_image_bytes(data: bytes, content_type: str = "") -> dict[str, Any]:
    if len(data) > _MAX_IMAGE_BYTES:
        raise ValueError("image exceeds size limit")
    kind = detect_image_kind(data, content_type)
    if not kind:
        raise ValueError("response is not a supported image")
    media_id = hashlib.sha256(data).hexdigest()
    path = media_dir() / f"{media_id}.{kind}"
    if not path.exists():
        tmp = path.with_suffix(path.suffix + ".part")
        tmp.write_bytes(data)
        tmp.replace(path)
    mime = mime_for_ext(kind)
    return {
        "media_id": media_id,
        "cached_path": str(path),
        "content_type": mime,
        "bytes": len(data),
        "kind": "image",
    }


def load_media_data_url(media_id: str) -> dict[str, Any]:
    """Load a cached image as a data URL for the chat WebView."""
    mid = (media_id or "").strip()
    if not mid or len(mid) > 128 or any(
        c not in "0123456789abcdefABCDEF" for c in mid
    ):
        raise ValueError("invalid media_id")
    for ext in ("jpg", "png", "gif", "webp"):
        path = media_dir() / f"{mid}.{ext}"
        if path.is_file():
            data = path.read_bytes()
            mime = mime_for_ext(ext)
            return {
                "ok": True,
                "media_id": mid,
                "path": str(path),
                "content_type": mime,
                "bytes": len(data),
                "data_url": (
                    f"data:{mime};base64,"
                    f"{base64.b64encode(data).decode('ascii')}"
                ),
            }
    raise FileNotFoundError("media not found")


def content_type_looks_image(content_type: str) -> bool:
    ct = (content_type or "").split(";")[0].strip().lower()
    return ct in {
        "image/jpeg",
        "image/jpg",
        "image/png",
        "image/gif",
        "image/webp",
    } or bool(re.match(r"image/(jpeg|jpg|png|gif|webp)$", ct))
