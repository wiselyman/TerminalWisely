"""Shared local workspace cwd for external agent runtimes."""

from __future__ import annotations

from pathlib import Path
from typing import Any

from app import paths


def agent_workspace_dir(run: Any) -> Path:
    root = Path(paths.data_dir()) / "agent_workspaces"
    root.mkdir(parents=True, exist_ok=True)
    thread = str(run.metadata.get("thread_id") or run.run_id)
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in thread)[:120]
    d = root / (safe or run.run_id)
    d.mkdir(parents=True, exist_ok=True)
    return d
