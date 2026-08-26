"""JSONL persistence for SessionLog."""

from __future__ import annotations

import json
from pathlib import Path

from app import paths
from app.session.log import SessionLog


def sessions_root() -> Path:
    root = Path(paths.data_dir()) / "sessions"
    root.mkdir(parents=True, exist_ok=True)
    return root


def session_run_path(session_id: str, run_id: str) -> Path:
    safe_session = "".join(c if c.isalnum() or c in "-_" else "_" for c in session_id)[:120]
    safe_run = "".join(c if c.isalnum() or c in "-_" else "_" for c in run_id)[:120]
    d = sessions_root() / safe_session
    d.mkdir(parents=True, exist_ok=True)
    return d / f"{safe_run}.jsonl"


def save_session_log(session_id: str, run_id: str, log: SessionLog) -> Path:
    path = session_run_path(session_id, run_id)
    path.write_text(log.to_jsonl_text(), encoding="utf-8")
    return path


def append_session_event(session_id: str, run_id: str, row: dict) -> Path:
    """Append one JSONL row (incremental flush)."""
    path = session_run_path(session_id, run_id)
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")
    return path


def load_session_log(session_id: str, run_id: str) -> SessionLog | None:
    path = session_run_path(session_id, run_id)
    if not path.is_file():
        return None
    text = path.read_text(encoding="utf-8")
    if not text.strip():
        return SessionLog()
    return SessionLog.from_jsonl_text(text)


def list_run_ids_for_session(session_id: str) -> list[dict]:
    """List persisted runs for a session (newest mtime first)."""
    safe_session = "".join(c if c.isalnum() or c in "-_" else "_" for c in session_id)[:120]
    d = sessions_root() / safe_session
    if not d.is_dir():
        return []
    rows: list[dict] = []
    for path in d.glob("*.jsonl"):
        run_id = path.stem
        try:
            st = path.stat()
            rows.append(
                {
                    "run_id": run_id,
                    "session_id": session_id,
                    "path": str(path),
                    "bytes": st.st_size,
                    "mtime": st.st_mtime,
                }
            )
        except OSError:
            continue
    rows.sort(key=lambda r: float(r.get("mtime") or 0), reverse=True)
    return rows


def clone_log(source: SessionLog) -> SessionLog:
    """Deep copy for resume. Preserves in-memory image bytes (no disk redaction)."""
    rows = [ev.to_jsonl() for ev in source.events]
    return SessionLog.load_jsonl_rows(rows)
