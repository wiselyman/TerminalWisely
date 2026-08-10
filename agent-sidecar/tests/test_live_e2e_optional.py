"""Live SSH gate — skips unless TW_AI_LIVE_E2E=1 and credentials present.

Usage:
  TW_AI_LIVE_E2E=1 TW_AI_TOKEN=... TW_AI_BASE_URL=... TW_AI_API_KEY=... \\
  TW_AI_MODEL=... python -m pytest tests/test_live_e2e_optional.py -q
"""

from __future__ import annotations

import os

import pytest


pytestmark = pytest.mark.skipif(
    os.environ.get("TW_AI_LIVE_E2E") != "1",
    reason="Set TW_AI_LIVE_E2E=1 with model + sidecar to run live gate",
)


def test_live_health_and_chat_start():
    import httpx

    base = os.environ.get("TW_AI_SIDECAR_URL", "http://127.0.0.1:8765").rstrip("/")
    token = os.environ.get("TW_AI_TOKEN", "dev-token")
    headers = {"Authorization": f"Bearer {token}"}
    with httpx.Client(timeout=30.0) as client:
        h = client.get(f"{base}/health")
        assert h.status_code == 200
        # Chat start without forcing tools — proves sidecar+model path.
        if not os.environ.get("TW_AI_API_KEY"):
            pytest.skip("TW_AI_API_KEY required for live chat")
        r = client.post(
            f"{base}/v1/chat/start",
            headers=headers,
            json={
                "session_id": "live-sess",
                "message": "Reply with exactly: pong",
                "security_mode": "observe",
            },
        )
        assert r.status_code == 200, r.text
        run_id = r.json()["run_id"]
        # Pull until completed/failed within budget
        import time

        for _ in range(100):
            pull = client.get(
                f"{base}/v1/sessions/live-sess/pull?cursor=0&run_id={run_id}",
                headers=headers,
            ).json()
            if pull["status"] in ("completed", "failed", "cancelled"):
                assert pull["status"] == "completed"
                return
            time.sleep(0.2)
        pytest.fail("live chat did not complete")
