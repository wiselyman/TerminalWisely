"""Tests for user skill writer."""

from __future__ import annotations

from pathlib import Path

from app.skills.writer import render_skill_markdown, save_user_skill, validate_skill_id


def test_validate_skill_id() -> None:
    assert validate_skill_id("nginx-reload") == "nginx-reload"
    assert validate_skill_id("Bad Id") is None
    assert validate_skill_id("x") is None


def test_save_user_skill(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    out = save_user_skill(
        skill_id="disk-check",
        title="Disk check",
        tags=["disk", "df"],
        body="1. Run df -h\n2. Report mount with lowest free space",
    )
    assert out["ok"] is True
    path = Path(str(out["path"]))
    assert path.is_file()
    text = path.read_text(encoding="utf-8")
    assert text.startswith("# Disk check\n")
    assert "tags: disk, df" in text
    assert "Guidance only" in text
    assert "df -h" in text


def test_render_includes_tags() -> None:
    md = render_skill_markdown(title="T", tags=["A", "a", "b"], body="step")
    assert "tags: a, b" in md
