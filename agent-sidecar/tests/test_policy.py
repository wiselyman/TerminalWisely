"""PolicyEngine: mode-aware R0–R4."""

from app.broker import CommandBroker, PolicyEngine
from app.models.terminal import PolicyAction, RiskLevel, SecurityMode


def test_readonly_ss_allowed():
    eng = PolicyEngine()
    d = eng.decide("ss -lntp | grep 8888", security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.ALLOW
    assert d.allowed is True
    assert d.risk == RiskLevel.R0


def test_readonly_lsof_allowed():
    broker = CommandBroker()
    d = broker.authorize("lsof -i :8888")
    assert d.action == PolicyAction.ALLOW
    assert d.risk == RiskLevel.R0


def test_mutation_rm_requires_approval_in_safe():
    eng = PolicyEngine()
    d = eng.decide("rm -rf /tmp/foo", security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.REQUIRE_APPROVAL
    assert d.needs_approval is True
    assert d.risk in (RiskLevel.R2, RiskLevel.R3, RiskLevel.R4)


def test_r4_always_denied():
    eng = PolicyEngine()
    d = eng.decide("rm -rf /", security_mode=SecurityMode.AUTONOMOUS)
    assert d.action == PolicyAction.DENY
    assert d.risk == RiskLevel.R4


def test_rm_specific_path_not_r4():
    eng = PolicyEngine()
    for cmd in (
        "sudo rm -f /usr/local/bin/ollama",
        "rm -rf /usr/local/lib/ollama",
        "rm -rf ~/.ollama",
        "sudo rm -rf /usr/local/bin/ollama /usr/local/lib/ollama",
    ):
        d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
        assert d.risk != RiskLevel.R4, (cmd, d.reason)
        assert d.action == PolicyAction.REQUIRE_APPROVAL, (cmd, d.action)


def test_rm_top_level_trees_still_r4():
    eng = PolicyEngine()
    for cmd in ("rm -rf /usr", "rm -rf /usr/", "rm -rf /var", "rm -rf /*", "rm -rf ~"):
        d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
        assert d.risk == RiskLevel.R4, (cmd, d.risk, d.reason)
        assert d.action == PolicyAction.DENY


def test_observe_blocks_mutations():
    eng = PolicyEngine()
    d = eng.decide("systemctl restart nginx", security_mode=SecurityMode.OBSERVE)
    assert d.action == PolicyAction.DENY


def test_systemctl_status_allowed():
    eng = PolicyEngine()
    d = eng.decide("systemctl status nginx", security_mode=SecurityMode.OBSERVE)
    assert d.action == PolicyAction.ALLOW
    assert d.risk == RiskLevel.R0


def test_redirect_write_requires_approval():
    eng = PolicyEngine()
    d = eng.decide("echo hi > /etc/hosts", security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.REQUIRE_APPROVAL


def test_autonomous_allows_r2():
    eng = PolicyEngine()
    d = eng.decide("systemctl restart nginx", security_mode=SecurityMode.AUTONOMOUS)
    assert d.action == PolicyAction.ALLOW
    assert d.risk == RiskLevel.R2


def test_hardware_inspect_readonly_no_approval():
    eng = PolicyEngine()
    cmd = (
        'echo "===== OS ====="; uname -a 2>/dev/null; '
        "cat /etc/os-release 2>/dev/null | head -5; "
        'echo; echo "===== CPU ====="; '
        'lscpu 2>/dev/null | grep -E "^(Architecture|CPU)"'
    )
    d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
    assert d.risk == RiskLevel.R0
    assert d.action == PolicyAction.ALLOW


def test_devnull_redirect_not_mutation():
    eng = PolicyEngine()
    d = eng.decide("uname -a 2>/dev/null", security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.ALLOW
    assert d.risk == RiskLevel.R0


def test_hostnamectl_readonly_allowed():
    eng = PolicyEngine()
    d = eng.decide("hostnamectl 2>/dev/null | head -5", security_mode=SecurityMode.SAFE)
    assert d.risk == RiskLevel.R0
    assert d.action == PolicyAction.ALLOW


def test_inspect_commands_no_approval():
    eng = PolicyEngine()
    samples = [
        'swapon --show 2>/dev/null || echo "no swap"',
        "nvidia-smi -L 2>/dev/null || echo none",
        "sensors 2>/dev/null | head -20",
        "mount | grep -Ei 'rclone|fuse'",
        "id; for f in sys_vendor product_name; do cat /sys/class/dmi/id/$f; done",
        "lsblk -o NAME,SIZE; cat /proc/mdstat; free -h",
    ]
    for cmd in samples:
        d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
        assert d.action == PolicyAction.ALLOW, (cmd, d.risk, d.reason)
        assert d.risk == RiskLevel.R0, (cmd, d.risk)


def test_swapon_enable_requires_approval():
    eng = PolicyEngine()
    d = eng.decide("swapon /dev/sda2", security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.REQUIRE_APPROVAL


def test_sw_vers_fallback_compound_allowed():
    eng = PolicyEngine()
    cmd = "uname -a; echo '---'; cat /etc/os-release 2>/dev/null || sw_vers 2>/dev/null"
    d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.ALLOW, (d.risk, d.reason)
    assert d.risk == RiskLevel.R0


def test_unknown_install_script_still_approval():
    eng = PolicyEngine()
    d = eng.decide("./install.sh /opt/app", security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.REQUIRE_APPROVAL


def test_hostnamectl_set_requires_approval():
    eng = PolicyEngine()
    d = eng.decide("hostnamectl set-hostname foo", security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.REQUIRE_APPROVAL


def test_sudo_n_dmidecode_allowed():
    eng = PolicyEngine()
    cmd = (
        'echo "=== DMIDECODE ==="; '
        'sudo -n dmidecode -t system 2>/dev/null | egrep "Manufacturer|Product" '
        '|| echo "(dmidecode needs root)"; '
        'lspci 2>/dev/null | egrep -i "ethernet|network"'
    )
    d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.ALLOW, (d.risk, d.reason)
    assert d.risk == RiskLevel.R0


def test_command_v_and_subshell_readonly_allowed():
    eng = PolicyEngine()
    samples = [
        "lscpu 2>/dev/null || (sysctl -n machdep.cpu.brand_string 2>/dev/null; sysctl -n hw.ncpu 2>/dev/null)",
        "free -h 2>/dev/null; echo ---; command -v openssl sysbench 7z 2>/dev/null; echo ---; nproc",
        "command -v openssl",
    ]
    for cmd in samples:
        d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
        assert d.action == PolicyAction.ALLOW, (cmd, d.risk, d.reason)
        assert d.risk == RiskLevel.R0, (cmd, d.risk)


def test_interactive_sudo_readonly_allowed():
    """Elevated inspect peels sudo; host sudo modal still handles auth at exec time."""
    eng = PolicyEngine()
    for cmd in (
        "sudo dmidecode -t system",
        "sudo du -sh /var/lib/* 2>/dev/null | sort -rh | head -15",
        "sudo du -sh /usr/local/* /home/wiselyman/* /var/* /opt/* 2>/dev/null | sort -rh | head -20",
    ):
        d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
        assert d.action == PolicyAction.ALLOW, (cmd, d.risk, d.reason)
        assert d.risk == RiskLevel.R0, (cmd, d.risk)


def test_docker_inspect_and_system_df_allowed():
    eng = PolicyEngine()
    for cmd in (
        "docker images -a",
        "docker ps -a",
        "docker system df",
        "docker system info",
        'docker images -a 2>/dev/null && echo "---" && docker ps -a 2>/dev/null && echo "---" && docker system df 2>/dev/null',
    ):
        d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
        assert d.action == PolicyAction.ALLOW, (cmd, d.risk, d.reason)
        assert d.risk == RiskLevel.R0, (cmd, d.risk)


def test_interactive_sudo_mutation_still_approval():
    eng = PolicyEngine()
    d = eng.decide("sudo systemctl restart nginx", security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.REQUIRE_APPROVAL
    assert d.risk == RiskLevel.R2


def test_sudo_n_rm_still_high_risk():
    eng = PolicyEngine()
    d = eng.decide("sudo -n rm -rf /tmp/x", security_mode=SecurityMode.SAFE)
    assert d.risk in {RiskLevel.R3, RiskLevel.R4}
    assert d.action != PolicyAction.ALLOW


def test_apt_autoremove_yes_requires_approval_not_deny():
    eng = PolicyEngine()
    for cmd in (
        "sudo apt autoremove --purge -y",
        "apt-get autoremove -y",
        "sudo apt-get autoremove --yes",
    ):
        d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
        assert d.action == PolicyAction.REQUIRE_APPROVAL, (cmd, d.action, d.reason)
        assert d.risk == RiskLevel.R3


def test_apt_simulate_is_readonly():
    eng = PolicyEngine()
    d = eng.decide("apt-get -s autoremove", security_mode=SecurityMode.SAFE)
    assert d.risk == RiskLevel.R0
    assert d.action == PolicyAction.ALLOW


def test_firewall_presence_probe_is_readonly():
    eng = PolicyEngine()
    cmd = (
        "which ufw iptables firewalld nft 2>/dev/null; "
        "dpkg -l | grep -E 'ufw|iptables|firewalld|nftables' 2>/dev/null; "
        "systemctl is-active ufw firewalld 2>/dev/null"
    )
    d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.ALLOW, (d.risk, d.reason)
    assert d.risk == RiskLevel.R0
    assert not (d.metadata or {}).get("network_guard")


def test_xargs_du_pipeline_is_readonly():
    eng = PolicyEngine()
    cmd = (
        "find / -type f -size +100M 2>/dev/null | xargs du -sh 2>/dev/null | "
        "sort -rh | head -20"
    )
    d = eng.decide(cmd, security_mode=SecurityMode.SAFE)
    assert d.risk == RiskLevel.R0
    assert d.action == PolicyAction.ALLOW


def test_xargs_rm_still_requires_approval():
    eng = PolicyEngine()
    d = eng.decide("find /tmp -name '*.bak' | xargs rm -f", security_mode=SecurityMode.SAFE)
    assert d.action == PolicyAction.REQUIRE_APPROVAL
    assert d.risk.value in {"R2", "R3", "R4"}
