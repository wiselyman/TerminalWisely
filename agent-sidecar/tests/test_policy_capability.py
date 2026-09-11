"""Capability policy loader / resolve smoke tests."""

from app.policy.loader import build_bundle, bundled_policy_dir, reload_policy
from app.policy.parse import iter_leaves
from app.policy.resolve import classify_command, command_has_caps, resolve_leaf
from app.models.terminal import RiskLevel


def test_bundled_du_is_read():
    reload_policy()
    bundle = build_bundle(policy_dir=bundled_policy_dir(), overrides_path=None)
    assert "du" in bundle.read_binaries
    assert bundle.ranks["read"] == "R0"


def test_firewall_probe_not_net_mutate():
    cmd = (
        "which ufw iptables firewalld nft 2>/dev/null; "
        "dpkg -l | grep -E 'ufw|iptables|firewalld|nftables' 2>/dev/null"
    )
    assert not command_has_caps(cmd, {"net_mutate", "sshd_mutate"})
    risk, caps = classify_command(cmd)
    assert risk == RiskLevel.R0
    assert "net_mutate" not in caps


def test_iptables_policy_change_is_net_mutate():
    leaves = iter_leaves("iptables -P INPUT DROP")
    assert resolve_leaf(leaves[0]) == {"net_mutate"}
    assert command_has_caps("iptables -P INPUT DROP", {"net_mutate"})


def test_unknown_install_script_unknown_cap():
    leaves = iter_leaves("./install.sh /opt/app")
    assert "unknown" in resolve_leaf(leaves[0])
