"""Spill oversized tool results to disk; keep a frozen preview in context."""

from __future__ import annotations

import os
from pathlib import Path

from app import paths

_DEFAULT_THRESHOLD = 6000
_PREVIEW_CHARS = 1200


def tool_artifact_threshold() -> int:
    raw = os.environ.get("TW_AI_TOOL_ARTIFACT_CHARS", "").strip()
    if raw.isdigit():
        return max(1000, int(raw))
    return _DEFAULT_THRESHOLD


def artifacts_dir() -> Path:
    d = paths.data_dir() / "tool_artifacts"
    d.mkdir(parents=True, exist_ok=True)
    return d


def maybe_spill_tool_content(call_id: str, content: str) -> str:
    """If content is huge, write full text to disk and return a frozen preview.

    Already-spilled previews (containing the marker) are returned unchanged.
    """
    text = content or ""
    marker = "[TOOL_ARTIFACT]"
    if marker in text:
        return text
    if len(text) < tool_artifact_threshold():
        return text
    safe_id = "".join(c if c.isalnum() or c in "-_" else "_" for c in (call_id or "tool"))[
        :80
    ]
    path = artifacts_dir() / f"{safe_id}.txt"
    path.write_text(text, encoding="utf-8")
    preview = text[:_PREVIEW_CHARS]
    if len(text) > _PREVIEW_CHARS:
        preview += "\n…"
    return (
        f"{marker} full output saved to {path} ({len(text)} chars).\n"
        f"Preview (frozen):\n{preview}"
    )


def drop_noise_tool_bodies(messages: list[dict], *, summary_present: bool) -> list[dict]:
    """After compaction, drop already-summarized huge tool bodies (noise).

    Keeps short results and artifact previews. Does not rewrite non-tool messages.
    """
    if not summary_present:
        return messages
    out: list[dict] = []
    for msg in messages:
        if msg.get("role") != "tool":
            out.append(msg)
            continue
        content = str(msg.get("content") or "")
        if "[TOOL_ARTIFACT]" in content:
            out.append(msg)
            continue
        if len(content) > tool_artifact_threshold() // 2:
            # Already covered by archival summary — keep a stub only.
            stub = {
                **msg,
                "content": "[tool output omitted — covered by prior compaction summary]",
            }
            out.append(stub)
        else:
            out.append(msg)
    return out
