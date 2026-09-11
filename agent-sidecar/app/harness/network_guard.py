"""Network / SSH self-lockout helpers — command templates only; host executes.

Danger detection is capability-based (`net_mutate` / `sshd_mutate`) from the
YAML policy engine — not bare tool-name substrings.
"""

from __future__ import annotations

from typing import Any

from app.policy.resolve import command_has_caps


def is_network_dangerous(command: str) -> bool:
    """True when any leaf may change firewall/SSH/network in a lockout-prone way."""
    return command_has_caps(command, {"net_mutate", "sshd_mutate"})


def build_timed_rollback_plan(
    apply_command: str,
    *,
    snapshot_paths: list[str] | None = None,
    verify_command: str = "echo ok",
    rollback_delay_s: int = 60,
) -> dict[str, Any]:
    """Return shell templates for snapshot → schedule rollback → apply → verify → cancel."""
    paths = snapshot_paths or ["/etc/ssh/sshd_config", "/etc/config/network", "/etc/config/firewall"]
    stamp = "$(date +%s)"
    backup_dir = f"/tmp/tw-ai-net-backup-{stamp}"
    snapshot_cmds = [f"mkdir -p {backup_dir}"] + [
        f"cp -a {p} {backup_dir}/ 2>/dev/null || true" for p in paths
    ]
    rollback_body = " ; ".join(
        [f"cp -a {backup_dir}/$(basename {p}) {p} 2>/dev/null || true" for p in paths]
        + ["systemctl reload sshd 2>/dev/null || /etc/init.d/sshd reload 2>/dev/null || true"]
    )
    return {
        "snapshot": snapshot_cmds,
        "schedule_rollback": (
            f"echo '{rollback_body}' | at now + {max(1, rollback_delay_s // 60)} minutes 2>/dev/null "
            f"|| ( sleep {rollback_delay_s}; {rollback_body} ) & echo $!"
        ),
        "apply": apply_command,
        "verify": verify_command,
        "cancel_rollback": "pkill -f 'tw-ai-net-backup' 2>/dev/null || true",
        "backup_dir_template": backup_dir,
        "rollback_delay_s": rollback_delay_s,
    }
