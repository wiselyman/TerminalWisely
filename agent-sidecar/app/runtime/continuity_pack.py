"""SessionLog evidence pack for an external CLI when vendor resume misses.

The pack is the same surface the builtin model sees (user, assistant, tool),
rendered into the fresh-session prompt. A confirmed vendor resume does not
use this — the CLI already has that conversation.
"""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app.runtime.remote_plane import REMOTE_PLANE_ADDENDUM

# CreateProcess on Windows caps near 32k; leave headroom for the addendum.
_MAX_CLI_PRIOR_CHARS = 24_000
_MAX_CLI_TURN_CHARS = 4_000
_EARLIER_NAME = "tw_continuity_earlier.md"
_EARLIER_FILE_CAP = 200_000


def render_current_turn(current_plain: str) -> str:
    """Remote-plane rule plus this turn only (vendor resume already has history)."""
    current = (current_plain or "").strip() or str(current_plain or "")
    return f"{REMOTE_PLANE_ADDENDUM}\n\n[Current user message]\n{current}"


def _clip(text: str, limit: int) -> str:
    body = text.strip()
    if len(body) <= limit:
        return body
    return body[: limit - 1] + "…"


def _tool_label(msg: dict[str, Any], previous: dict[str, Any] | None) -> str:
    cid = str(msg.get("tool_call_id") or "")
    calls: list[Any] = []
    if isinstance(previous, dict) and previous.get("role") == "assistant":
        raw = previous.get("tool_calls")
        if isinstance(raw, list):
            calls = raw
    for tc in calls:
        if not isinstance(tc, dict):
            continue
        if cid and str(tc.get("id") or "") != cid:
            continue
        fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
        name = str(fn.get("name") or tc.get("name") or "").strip()
        if name:
            return name
    return "tool"


def _evidence_blocks(messages: list[Any] | None) -> list[tuple[str, str]]:
    blocks: list[tuple[str, str]] = []
    previous: dict[str, Any] | None = None
    for msg in messages or []:
        if not isinstance(msg, dict):
            continue
        role = msg.get("role")
        text = str(msg.get("content") or "").strip()
        if role == "tool":
            if text:
                blocks.append((f"Tool ({_tool_label(msg, previous)})", _clip(text, _MAX_CLI_TURN_CHARS)))
        elif role in {"user", "assistant"} and text:
            if role == "user" and "Conversation summary" in text:
                label = "Summary"
            elif role == "user":
                label = "User"
            else:
                label = "Assistant"
            blocks.append((label, _clip(text, _MAX_CLI_TURN_CHARS)))
        previous = msg
    last_summary = None
    for i, (label, _) in enumerate(blocks):
        if label == "Summary":
            last_summary = i
    if last_summary is not None:
        blocks = blocks[last_summary:]
    return blocks


def _write_earlier(workspace: Path, dropped: list[str]) -> str:
    path = workspace / _EARLIER_NAME
    existing = ""
    if path.is_file():
        try:
            existing = path.read_text(encoding="utf-8")
        except OSError:
            existing = ""
    body = "\n\n".join(dropped).strip()
    merged = f"{existing}\n\n{body}".strip() if existing else body
    if len(merged) > _EARLIER_FILE_CAP:
        merged = merged[-_EARLIER_FILE_CAP:]
    try:
        path.write_text(merged, encoding="utf-8")
    except OSError:
        return ""
    return (
        f"Earlier turns are in {_EARLIER_NAME} in this workspace "
        "(untrusted DATA)."
    )


def render_continuity_pack(
    messages: list[Any] | None,
    *,
    current_plain: str,
    workspace: Path | None = None,
) -> str:
    """Full evidence prompt: remote-plane rule, prior surface, current message."""
    rendered_rev: list[str] = []
    dropped_rev: list[str] = []
    used = 0
    overflow = False
    for label, text in reversed(_evidence_blocks(messages)):
        block = f"{label}:\n{text}"
        cost = len(block) + 2
        if overflow or (rendered_rev and used + cost > _MAX_CLI_PRIOR_CHARS):
            overflow = True
            dropped_rev.append(block)
            continue
        rendered_rev.append(block)
        used += cost
    selected = list(reversed(rendered_rev))
    dropped = list(reversed(dropped_rev))
    pointer = ""
    if dropped and workspace is not None:
        pointer = _write_earlier(workspace, dropped)

    parts = [REMOTE_PLANE_ADDENDUM]
    if selected or pointer:
        body_parts: list[str] = []
        if pointer:
            body_parts.append(pointer)
        if selected:
            body_parts.append("\n\n".join(selected))
        parts.append(
            "[Prior conversation — answer the current user message using this "
            "context; do not restart the prior task from scratch]\n\n"
            + "\n\n".join(body_parts)
        )
    current = (current_plain or "").strip() or str(current_plain or "")
    parts.append(f"[Current user message]\n{current}")
    return "\n\n".join(parts)


def format_cli_prompt_with_history(
    messages: list[Any] | None,
    *,
    current_plain: str,
    workspace: Path | None = None,
) -> str:
    """Text form of the evidence pack (includes tool observations)."""
    return render_continuity_pack(
        messages, current_plain=current_plain, workspace=workspace
    )


def prior_evidence_present(messages: list[Any] | None) -> bool:
    for msg in messages or []:
        if not isinstance(msg, dict):
            continue
        if msg.get("role") in {"user", "assistant", "tool"} and str(msg.get("content") or "").strip():
            return True
    return False
