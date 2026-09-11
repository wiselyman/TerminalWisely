"""Memory catalog for panel UI — paths + counts only (no auto dreaming)."""

from __future__ import annotations

from typing import Any

from app import paths
from app.memory.host_store import host_memory_dir, load_host_memory
from app.memory.user_store import load_user_memory, user_memory_path


def memory_meta_catalog(
    *, host_limit: int = 50, engineer_mode: str | None = None
) -> dict[str, Any]:
    """Absolute paths + entry counts for Skills-like Memory browser."""
    mode = (engineer_mode or "linux").strip().lower()
    data = paths.data_dir()
    memory_dir = data / "memory"
    memory_dir.mkdir(parents=True, exist_ok=True)
    user_path = user_memory_path(engineer_mode=mode)
    targets_dir = host_memory_dir(engineer_mode=mode)
    user = load_user_memory(engineer_mode=mode)
    targets: list[dict[str, Any]] = []
    if targets_dir.is_dir():
        for path in sorted(targets_dir.glob("*.json")):
            scope = path.stem
            try:
                body = load_host_memory(scope, engineer_mode=mode)
            except Exception:  # noqa: BLE001
                body = {"prefs": [], "facts": [], "notes": []}
            targets.append(
                {
                    "scope": scope,
                    "path": str(path),
                    "prefs": len(body.get("prefs") or []),
                    "facts": len(body.get("facts") or []),
                    "notes": len(body.get("notes") or []),
                }
            )
            if len(targets) >= host_limit:
                break
    return {
        "engineer_mode": mode,
        "data_dir": str(data),
        "memory_dir": str(memory_dir),
        "user_path": str(user_path),
        "hosts_dir": str(targets_dir),
        "targets_dir": str(targets_dir),
        "user": {
            "path": str(user_path),
            "prefs": len(user.get("prefs") or []),
            "notes": len(user.get("notes") or []),
        },
        "hosts": targets,
        "host_count": len(targets),
    }
