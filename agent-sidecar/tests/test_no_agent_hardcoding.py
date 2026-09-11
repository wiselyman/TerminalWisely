"""CI gate: agent hardcoding ban script must pass."""

from __future__ import annotations

import shutil
import subprocess
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
SCRIPT = REPO / "scripts" / "check-no-agent-hardcoding.mjs"


def test_no_agent_hardcoding_script_passes() -> None:
    assert SCRIPT.is_file(), f"missing {SCRIPT}"
    node = shutil.which("node")
    assert node, "node not on PATH"
    proc = subprocess.run(
        [node, str(SCRIPT)],
        cwd=REPO,
        capture_output=True,
        text=True,
        check=False,
    )
    assert proc.returncode == 0, proc.stderr or proc.stdout
    assert "PASS" in (proc.stdout or "")
