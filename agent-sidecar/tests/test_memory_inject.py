"""Verified case memory injection."""

from __future__ import annotations

import pytest

from app.memory.inject import memory_context_block, signature_from_messages
from app.memory.store import save_verified_case


@pytest.fixture(autouse=True)
def _iso_db(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))


def test_signature_skips_memory_blocks() -> None:
    sig = signature_from_messages(
        [
            {"role": "user", "content": "[VERIFIED CASE MEMORY — x]"},
            {"role": "user", "content": "nginx down"},
        ]
    )
    assert sig == "nginx down"


def test_memory_context_block_from_store() -> None:
    save_verified_case(
        {
            "problem_signature": "nginx 502",
            "root_cause": "upstream down",
            "fix": "restart upstream",
            "verification": "curl ok",
            "confidence": 0.9,
        }
    )
    block = memory_context_block("nginx 502")
    assert "VERIFIED CASE MEMORY" in block
    assert "upstream down" in block
