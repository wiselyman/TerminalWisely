"""Memory injection into AgentLoop context."""

from __future__ import annotations

import pytest

from app.agent.loop import AgentLoop
from app.broker import CommandBroker
from app.memory.store import save_verified_case
from app.models.approval import TargetSessionIdentity
from app.state import AgentRun


@pytest.fixture(autouse=True)
def _iso_db(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    monkeypatch.setenv("TW_AI_DATA_DIR", str(tmp_path))


class _NoopModel:
    async def chat_completions(self, *args, **kwargs):  # noqa: ANN002, ANN003
        raise RuntimeError("should not call model in this test")


@pytest.mark.asyncio
async def test_prepare_model_context_injects_memory() -> None:
    save_verified_case(
        {
            "problem_signature": "disk full /var",
            "root_cause": "logs",
            "fix": "rotate logs",
        }
    )
    run = AgentRun(
        session_id="sess",
        run_id="run_mem",
        identity=TargetSessionIdentity(session_id="sess"),
        persist_session=False,
    )
    run.append_message({"role": "user", "content": "disk full on /var again"})
    loop = AgentLoop(run, model=_NoopModel(), broker=CommandBroker())
    await loop._prepare_model_context()
    texts = [m.get("content") for m in run.messages if m.get("role") == "user"]
    assert any("VERIFIED CASE MEMORY" in str(t) for t in texts)
    mem_events = [e for e in run.events if e.type == "memory_context"]
    assert mem_events
