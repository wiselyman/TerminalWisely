"""Skill matching: tags + title/body keywords."""

from __future__ import annotations

from pathlib import Path

from app.skills.match import match_skills
from app.skills.writer import save_user_skill


def test_match_skills_by_title_keyword(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    save_user_skill(
        skill_id="journalctl-triage",
        title="Journalctl crash triage",
        tags=["logging"],
        body="Steps to inspect systemd journal for unit failures.",
    )
    hits = match_skills("Please do journalctl triage on the failed unit")
    ids = [h["id"] for h in hits]
    assert "journalctl-triage" in ids


def test_match_skills_by_body_keyword_without_tag_hit(
    tmp_path: Path, monkeypatch
) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    save_user_skill(
        skill_id="disk-pressure",
        title="Disk pressure playbook",
        tags=["storage"],
        body="When inode exhaustion appears, check df -i and clean orphaned files.",
    )
    # Message has body keyword overlap, not the tag word "storage"
    hits = match_skills("inode exhaustion on this host — what next?")
    ids = [h["id"] for h in hits]
    assert "disk-pressure" in ids
