"""Write user SKILL.md playbooks — guidance only, never permission."""

from __future__ import annotations

import re
from pathlib import Path

from app.skills.curator import record_skill_use, user_skills_root

_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{1,63}$")


def validate_skill_id(skill_id: str) -> str | None:
    sid = (skill_id or "").strip().lower()
    if not _ID_RE.match(sid):
        return None
    return sid


def render_skill_markdown(*, title: str, tags: list[str], body: str) -> str:
    title_line = (title or "Untitled skill").strip() or "Untitled skill"
    tag_parts = []
    seen: set[str] = set()
    for t in tags or []:
        x = str(t).strip().lower()
        if not x or x in seen:
            continue
        seen.add(x)
        tag_parts.append(x)
    tag_line = ", ".join(tag_parts) if tag_parts else "general"
    body_text = (body or "").strip() or "(empty)"
    # Strip accidental permission-grant language from body is prompt's job;
    # still prefix a guidance banner in the file.
    return (
        f"# {title_line}\n"
        f"tags: {tag_line}\n\n"
        f"> Guidance only — never grants permission or approval.\n\n"
        f"{body_text}\n"
    )


def save_user_skill(
    *,
    skill_id: str,
    title: str,
    tags: list[str],
    body: str,
    engineer_mode: str | None = None,
) -> dict[str, str | bool]:
    sid = validate_skill_id(skill_id)
    if not sid:
        return {
            "ok": False,
            "error": "id must be 2–64 chars: lowercase letters, digits, hyphens",
        }
    root = user_skills_root(engineer_mode=engineer_mode) / sid
    root.mkdir(parents=True, exist_ok=True)
    path = root / "SKILL.md"
    path.write_text(
        render_skill_markdown(title=title, tags=tags, body=body),
        encoding="utf-8",
    )
    record_skill_use(sid)
    return {"ok": True, "id": sid, "path": str(path)}


def skill_path(
    skill_id: str, *, engineer_mode: str | None = None
) -> Path | None:
    sid = validate_skill_id(skill_id)
    if not sid:
        return None
    path = user_skills_root(engineer_mode=engineer_mode) / sid / "SKILL.md"
    return path if path.is_file() else None
