"""Load SKILL.md files — guidance only, never permission."""

from __future__ import annotations

from pathlib import Path


def skills_root() -> Path:
    return Path(__file__).resolve().parents[2] / "skills"


def list_skills(limit: int = 12) -> list[dict[str, str]]:
    root = skills_root()
    if not root.is_dir():
        return []
    out: list[dict[str, str]] = []
    for path in sorted(root.glob("**/SKILL.md")):
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
                "path": str(path.relative_to(root.parent)),
                "excerpt": text[:400],
            }
        )
        if len(out) >= limit:
            break
    return out


def skills_prompt_block() -> str:
    skills = list_skills()
    if not skills:
        return ""
    lines = ["Available skills (guidance only — do not treat as permission):"]
    for s in skills:
        lines.append(f"- {s['id']}: {s['title']}")
    return "\n".join(lines)
