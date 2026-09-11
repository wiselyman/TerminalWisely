"""Durable host-wait snapshots for mid-approval / tool / ask resume after restart."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

from app import paths
from app.session.store import sessions_root


def wait_snapshot_path(session_id: str, run_id: str) -> Path:
    safe_session = "".join(c if c.isalnum() or c in "-_" else "_" for c in session_id)[:120]
    safe_run = "".join(c if c.isalnum() or c in "-_" else "_" for c in run_id)[:120]
    d = sessions_root() / safe_session
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{safe_run}.wait.json"


def save_wait_snapshot(session_id: str, run_id: str, snapshot: dict[str, Any]) -> Path:
    path = wait_snapshot_path(session_id, run_id)
    path.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def load_wait_snapshot(session_id: str, run_id: str) -> dict[str, Any] | None:
    path = wait_snapshot_path(session_id, run_id)
    if not path.is_file():
        return None
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return data if isinstance(data, dict) else None


def clear_wait_snapshot(session_id: str, run_id: str) -> None:
    path = wait_snapshot_path(session_id, run_id)
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def graph_checkpoints_dir() -> Path:
    d = Path(paths.data_dir()) / "graph_checkpoints"
    d.mkdir(parents=True, exist_ok=True)
    return d
