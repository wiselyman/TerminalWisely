"""Tool artifact spill + noise drop."""

from __future__ import annotations

from pathlib import Path

from app.session.tool_artifacts import (
    drop_noise_tool_bodies,
    maybe_spill_tool_content,
    tool_artifact_threshold,
)


def test_maybe_spill_writes_artifact(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_TOOL_ARTIFACT_CHARS", "2000")
    assert tool_artifact_threshold() == 2000
    big = "x" * 5000
    out = maybe_spill_tool_content("call_abc", big)
    assert "[TOOL_ARTIFACT]" in out
    assert "Preview (frozen)" in out
    art = tmp_path / "tool_artifacts" / "call_abc.txt"
    assert art.is_file()
    assert art.read_text(encoding="utf-8") == big
    # Frozen: second call does not rewrite
    again = maybe_spill_tool_content("call_abc", out)
    assert again == out


def test_short_content_not_spilled(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("TW_AI_TOOL_ARTIFACT_CHARS", "6000")
    text = "short ok"
    assert maybe_spill_tool_content("c1", text) == text
    assert not (tmp_path / "tool_artifacts").exists() or not list(
        (tmp_path / "tool_artifacts").glob("*")
    )


def test_noise_drop_stubs_large_tool_when_summary_present() -> None:
    msgs = [
        {
            "role": "user",
            "content": "[Conversation summary — prior messages compacted]",
        },
        {"role": "tool", "tool_call_id": "t1", "content": "y" * 4000},
        {
            "role": "tool",
            "tool_call_id": "t2",
            "content": "[TOOL_ARTIFACT] preview",
        },
        {"role": "tool", "tool_call_id": "t3", "content": "tiny"},
    ]
    out = drop_noise_tool_bodies(msgs, summary_present=True)
    assert "omitted" in str(out[1]["content"])
    assert "[TOOL_ARTIFACT]" in str(out[2]["content"])
    assert out[3]["content"] == "tiny"
    # Without summary, leave as-is
    same = drop_noise_tool_bodies(msgs, summary_present=False)
    assert same[1]["content"] == msgs[1]["content"]
