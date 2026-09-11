"""Tests for skill curator archive behavior."""

from __future__ import annotations

import time
from pathlib import Path

from app.skills.curator import (
    archive_user_skill,
    curator_archive_stale,
    is_archived,
    record_skill_use,
    user_skills_root,
)
from app.skills.loader import list_skills


def test_bundled_never_archived_via_archive_user_skill(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    # Bundled skills live under package skills/; archive_user_skill refuses.
    assert archive_user_skill("investigate-service") is False


def test_stale_user_skill_archived_and_hidden(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    root = user_skills_root()
    skill_dir = root / "my-playbook"
    skill_dir.mkdir(parents=True)
    (skill_dir / "SKILL.md").write_text(
        "# My playbook\ntags: disk, full\n\nGuidance only.\n",
        encoding="utf-8",
    )
    # Mark as last used 40 days ago.
    from app.skills import curator as curator_mod

    data = curator_mod.load_usage()
    data["skills"]["my-playbook"] = {
        "hits": 1,
        "last_used": time.time() - 40 * 86400,
        "created": time.time() - 50 * 86400,
    }
    curator_mod.save_usage(data)

    archived = curator_archive_stale(unused_days=30)
    assert "my-playbook" in archived
    assert is_archived("my-playbook")
    ids = {s["id"] for s in list_skills(limit=50)}
    assert "my-playbook" not in ids


def test_record_skill_use_updates_hits(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    record_skill_use("demo")
    record_skill_use("demo")
    from app.skills.curator import load_usage

    assert load_usage()["skills"]["demo"]["hits"] == 2
