"""Load SKILL.md files — guidance only, never permission."""

from __future__ import annotations

from pathlib import Path

from app.skills.curator import is_archived, user_skills_root


def skills_root() -> Path:
    return Path(__file__).resolve().parents[2] / "skills"


def _iter_skill_paths() -> list[Path]:
    paths: list[Path] = []
    roots = (skills_root(), user_skills_root())
    for root in roots:
        if not root.is_dir():
            continue
        for path in sorted(root.glob("**/SKILL.md")):
            skill_id = path.parent.name
            if is_archived(skill_id):
                continue
            paths.append(path)
    return paths


def list_skills(limit: int = 12) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for path in _iter_skill_paths():
        text = path.read_text(encoding="utf-8", errors="replace")
        title = path.parent.name
        for line in text.splitlines():
            if line.startswith("# "):
                title = line[2:].strip()
                break
        out.append(
            {
                "id": path.parent.name,
                "title": title,
                "path": str(path),
                "excerpt": text[:400],
            }
        )
        if len(out) >= limit:
            break
    return out


def list_user_skills_catalog(*, limit: int = 200) -> dict[str, object]:
    """User-authored skills only — for the panel UI (not prompt injection)."""
    root = user_skills_root()
    skills: list[dict[str, str]] = []
    if root.is_dir():
        for path in sorted(root.glob("*/SKILL.md")):
            skill_id = path.parent.name
            if is_archived(skill_id):
                continue
            text = path.read_text(encoding="utf-8", errors="replace")
            title = skill_id
            for line in text.splitlines():
                if line.startswith("# "):
                    title = line[2:].strip() or skill_id
                    break
            skills.append({"id": skill_id, "title": title, "path": str(path)})
            if len(skills) >= limit:
                break
    return {
        "count": len(skills),
        "root": str(root),
        "skills": skills,
    }


def skills_prompt_block() -> str:
    # Opportunistic cleanup of stale user skills (bundled never touched).
    try:
        from app.skills.curator import curator_archive_stale

        curator_archive_stale()
    except Exception:  # noqa: BLE001
        pass
    skills = list_skills()
    if not skills:
        return ""
    lines = ["Available skills (guidance only — do not treat as permission):"]
    for s in skills:
        lines.append(f"- {s['id']}: {s['title']}")
    return "\n".join(lines)
