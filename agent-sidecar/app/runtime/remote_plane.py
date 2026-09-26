"""Dual-plane rules for external agent CLIs (Cursor / Codex / Claude).

Local workspace plane: the TW-managed agent workspace on the Mac running TW.
Remote host plane: the connected SSH / K8s session — only via TW MCP.
"""

from __future__ import annotations

import re
from pathlib import Path

# Soft constraint prepended to every external-agent turn.
REMOTE_PLANE_ADDENDUM = (
    "[TerminalWisely remote plane]\n"
    "The user's connected SSH/K8s host is the only machine they mean by "
    '"this computer / this machine / this host / 这台电脑 / 这台机器". '
    "That host is reached ONLY through TerminalWisely MCP tools on server "
    "`terminalwisely` (terminal_exec, web_search, web_fetch, ask_user, k8s_*).\n"
    "The Mac (or PC) running TerminalWisely is the *client*, not the target. "
    "Do NOT use local Computer Use / CUA / desktop / screenshot / local shell "
    "to answer facts about the connected host, and do not open a new SSH login.\n"
    "Read-only terminal_exec (e.g. uptime) is executed by TerminalWisely "
    "automatically — do not ask the user to approve it in chat."
)

_GUIDANCE_MD = """# TerminalWisely dual plane (mandatory)

## Remote host plane (default for ops questions)
- User phrases like "this computer / this machine / 这台电脑" mean the **connected SSH/K8s host in TerminalWisely**, never the local machine running this agent.
- Probe and change that host **only** via MCP server `terminalwisely` tools (`terminal_exec`, `k8s_*`, `web_*`, `ask_user`).
- Never open a second SSH session to that host.

## Local workspace plane
- This directory is a TW-managed workspace for local edits and agent scratch only.
- Local Computer Use / CUA / desktop automation / screenshots of the client Mac are **forbidden** as evidence about the remote host.
"""

# Capability-class signals (not task-specific keywords).
_CUA_NAME_RE = re.compile(
    r"(^|[._\-])(cua|computer[_-]?use|desktop[_-]?use|screenshot)([._\-]|$)",
    re.IGNORECASE,
)
_CUA_DETAIL_RE = re.compile(
    r"\bcua\s*\.|computer[_-]?use|getDisplayState|getState\s*\(|desktop\.|screenshot",
    re.IGNORECASE,
)


def is_local_desktop_impersonation(*, name: str = "", detail: str = "") -> bool:
    """True when a local desktop/CUA tool is being used as if it were the remote host."""
    n = (name or "").strip()
    d = (detail or "").strip()
    if n and _CUA_NAME_RE.search(n):
        return True
    if d and _CUA_DETAIL_RE.search(d):
        return True
    return False


def write_remote_plane_guidance(workspace: Path) -> Path:
    """Write AGENTS.md (+ Cursor rule) so project-scoped agents load dual-plane rules."""
    workspace.mkdir(parents=True, exist_ok=True)
    agents = workspace / "AGENTS.md"
    agents.write_text(_GUIDANCE_MD, encoding="utf-8")
    cursor_rules = workspace / ".cursor" / "rules"
    cursor_rules.mkdir(parents=True, exist_ok=True)
    (cursor_rules / "terminalwisely-remote-plane.mdc").write_text(
        "---\ndescription: TerminalWisely remote vs local plane\nalwaysApply: true\n---\n\n"
        + _GUIDANCE_MD,
        encoding="utf-8",
    )
    return agents
