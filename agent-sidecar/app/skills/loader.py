"""Load SKILL.md files — guidance only, never permission."""

from __future__ import annotations

from pathlib import Path

from app.skills.curator import is_archived, user_skills_root


def skills_root() -> Path:
    return Path(__file__).resolve().parents[2] / "skills"


def _iter_skill_paths(*, engineer_mode: str | None = None) -> list[Path]:
    mode = (engineer_mode or "linux").strip().lower()
    paths: list[Path] = []
    roots = (skills_root(), user_skills_root(engineer_mode=mode))
    for root in roots:
        if not root.is_dir():
            continue
        for path in sorted(root.glob("**/SKILL.md")):
            skill_id = path.parent.name
            if is_archived(skill_id, engineer_mode=mode):
                continue
            # Bundled catalog still uses k8s- prefix convention.
            if root == skills_root():
                if mode == "k8s" and not skill_id.startswith("k8s-"):
                    continue
                if mode != "k8s" and skill_id.startswith("k8s-"):
                    continue
            paths.append(path)
    return paths


def list_skills(limit: int = 12, *, engineer_mode: str | None = None) -> list[dict[str, str]]:
    out: list[dict[str, str]] = []
    for path in _iter_skill_paths(engineer_mode=engineer_mode):
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


def list_user_skills_catalog(
    *, limit: int = 200, engineer_mode: str | None = None
) -> dict[str, object]:
    """User-authored skills only — for the panel UI (not prompt injection)."""
    mode = (engineer_mode or "linux").strip().lower()
    root = user_skills_root(engineer_mode=mode)
    skills: list[dict[str, str]] = []
    if root.is_dir():
        for path in sorted(root.glob("*/SKILL.md")):
            skill_id = path.parent.name
            if is_archived(skill_id, engineer_mode=mode):
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
        "engineer_mode": mode,
    }


def skills_prompt_block(*, engineer_mode: str | None = None) -> str:
    # Opportunistic cleanup of stale user skills (bundled never touched).
    try:
        from app.skills.curator import curator_archive_stale

        curator_archive_stale(engineer_mode=engineer_mode)
    except Exception:  # noqa: BLE001
        pass
    skills = list_skills(engineer_mode=engineer_mode)
    if not skills:
        return ""
    lines = ["Available skills (guidance only — do not treat as permission):"]
    for s in skills:
        lines.append(f"- {s['id']}: {s['title']}")
    return "\n".join(lines)
