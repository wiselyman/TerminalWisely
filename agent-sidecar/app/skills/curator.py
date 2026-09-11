"""Skill usage tracking + archive curator (guidance only)."""

from __future__ import annotations

import json
import shutil
import time
from pathlib import Path
from typing import Any

from app import paths


def bundled_skills_root() -> Path:
    return Path(__file__).resolve().parents[2] / "skills"


def user_skills_root(*, engineer_mode: str | None = None) -> Path:
    """Linux and K8s user skills are strictly separate directories."""
    mode = (engineer_mode or "linux").strip().lower()
    leaf = "user-k8s" if mode == "k8s" else "user"
    d = paths.data_dir() / "skills" / leaf
    d.mkdir(parents=True, exist_ok=True)
    return d


def archive_skills_root(*, engineer_mode: str | None = None) -> Path:
    mode = (engineer_mode or "linux").strip().lower()
    leaf = "archive-k8s" if mode == "k8s" else "archive"
    d = paths.data_dir() / "skills" / leaf
    d.mkdir(parents=True, exist_ok=True)
    return d


def usage_path() -> Path:
    return paths.data_dir() / "skills" / "usage.json"


def load_usage() -> dict[str, Any]:
    path = usage_path()
    if not path.is_file():
        return {"skills": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"skills": {}}
    if not isinstance(data, dict):
        return {"skills": {}}
    skills = data.get("skills")
    if not isinstance(skills, dict):
        data["skills"] = {}
    return data


def save_usage(data: dict[str, Any]) -> None:
    path = usage_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def record_skill_use(skill_id: str) -> None:
    sid = (skill_id or "").strip()
    if not sid:
        return
    data = load_usage()
    entry = data["skills"].setdefault(
        sid, {"hits": 0, "last_used": 0, "created": time.time()}
    )
    entry["hits"] = int(entry.get("hits") or 0) + 1
    entry["last_used"] = time.time()
    save_usage(data)


def is_archived(skill_id: str, *, engineer_mode: str | None = None) -> bool:
    return (archive_skills_root(engineer_mode=engineer_mode) / skill_id / "SKILL.md").is_file()


def is_bundled(skill_id: str) -> bool:
    return (bundled_skills_root() / skill_id / "SKILL.md").is_file()


def archive_user_skill(
    skill_id: str, *, engineer_mode: str | None = None
) -> bool:
    """Move user skill to archive. Never archives bundled skills."""
    sid = (skill_id or "").strip()
    if not sid or is_bundled(sid):
        return False
    src = user_skills_root(engineer_mode=engineer_mode) / sid
    if not (src / "SKILL.md").is_file():
        return False
    dest = archive_skills_root(engineer_mode=engineer_mode) / sid
    if dest.exists():
        shutil.rmtree(dest)
    shutil.move(str(src), str(dest))
    return True


def curator_archive_stale(
    *,
    unused_days: float = 30.0,
    now: float | None = None,
    engineer_mode: str | None = None,
) -> list[str]:
    """Archive user skills unused for unused_days. Bundled skills untouched."""
    ts = now if now is not None else time.time()
    cutoff = ts - unused_days * 86400
    data = load_usage()
    archived: list[str] = []
    for path in sorted(user_skills_root(engineer_mode=engineer_mode).glob("*/SKILL.md")):
        sid = path.parent.name
        entry = data.get("skills", {}).get(sid) or {}
        last = float(entry.get("last_used") or entry.get("created") or 0)
        if last <= 0:
            last = path.stat().st_mtime
        if last < cutoff:
            if archive_user_skill(sid, engineer_mode=engineer_mode):
                archived.append(sid)
    return archived
