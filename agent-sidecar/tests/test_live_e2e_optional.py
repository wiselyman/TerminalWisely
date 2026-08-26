"""Live release gate — skips unless TW_AI_LIVE_E2E=1.

Usage (release checklist):
  ./scripts/live_e2e_gate.sh

Or manually:
  TW_AI_LIVE_E2E=1 TW_AI_TOKEN=... TW_AI_API_KEY=... \\
  TW_AI_SIDECAR_URL=http://127.0.0.1:8765 \\
  python -m pytest tests/test_live_e2e_optional.py -q
"""

from __future__ import annotations

import os
import time

import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("TW_AI_LIVE_E2E") != "1",
    reason="Set TW_AI_LIVE_E2E=1 with model + sidecar to run live gate",
)


def _client():
    import httpx

    base = os.environ.get("TW_AI_SIDECAR_URL", "http://127.0.0.1:8765").rstrip("/")
    token = os.environ.get("TW_AI_TOKEN", "dev-token")
    return httpx.Client(base_url=base, headers={"Authorization": f"Bearer {token}"}, timeout=60.0)


def _wait_terminal(client, session_id: str, run_id: str, *, timeout_s: float = 60.0) -> dict:
    deadline = time.time() + timeout_s
    last: dict = {}
    cursor = 0
    while time.time() < deadline:
        pull = client.get(
            f"/v1/sessions/{session_id}/pull",
            params={"cursor": cursor, "run_id": run_id},
        )
        assert pull.status_code == 200, pull.text
        last = pull.json()
        events = last.get("events") or []
        if events:
            cursor = events[-1]["seq"] + 1
        if last["status"] in ("completed", "failed", "cancelled", "idle"):
            return last
        time.sleep(0.25)
    pytest.fail(f"live run did not finish: last={last}")


def test_live_health():
    with _client() as client:
        h = client.get("/health")
        assert h.status_code == 200


def test_live_chat_observe_pong():
    if not os.environ.get("TW_AI_API_KEY"):
        pytest.skip("TW_AI_API_KEY required for live chat")
    session_id = f"live-sess-{int(time.time())}"
    with _client() as client:
        r = client.post(
            "/v1/chat/start",
            json={
                "session_id": session_id,
                "message": "Reply with exactly: pong",
                "security_mode": "observe",
                "interaction_mode": "ask",
            },
        )
        assert r.status_code == 200, r.text
        run_id = r.json()["run_id"]
        done = _wait_terminal(client, session_id, run_id)
        assert done["status"] == "completed"


def test_live_continue_after_transcript():
    if not os.environ.get("TW_AI_API_KEY"):
        pytest.skip("TW_AI_API_KEY required for live chat")
    session_id = f"live-cont-{int(time.time())}"
    with _client() as client:
        start = client.post(
            "/v1/chat/start",
            json={
                "session_id": session_id,
                "message": "Reply with exactly: alpha",
                "security_mode": "observe",
                "interaction_mode": "ask",
            },
        )
        assert start.status_code == 200, start.text
        run_id = start.json()["run_id"]
        done = _wait_terminal(client, session_id, run_id)
        assert done["status"] == "completed"

        tr = client.get(f"/v1/runs/{run_id}/transcript", params={"session_id": session_id})
        assert tr.status_code == 200, tr.text
        assert tr.json().get("on_disk") is True or tr.json().get("event_count", 0) >= 1

        cont = client.post(
            "/v1/chat/continue",
            json={
                "session_id": session_id,
                "run_id": run_id,
                "message": "Reply with exactly: beta",
                "security_mode": "observe",
                "interaction_mode": "ask",
            },
        )
        assert cont.status_code == 200, cont.text
        done2 = _wait_terminal(client, session_id, run_id)
        assert done2["status"] == "completed"
