"""Package-manager impact preview (dry-run before approval)."""

from __future__ import annotations

import re

_SUDO_PREFIX = re.compile(
    r"^\s*sudo(?:\s+(?:-n|--non-interactive|-S|-E|-H))*\s+",
    re.I,
)
_YES_FLAG = re.compile(r"(^|\s)(-y|--yes)(\s|$)", re.I)
_SIM_FLAG = re.compile(r"(^|\s)(-s|--simulate|--dry-run)(\s|$)", re.I)
_AUTOREMOVE = re.compile(r"\bapt(-get)?\s+autoremove\b", re.I)
_APT_MUTATE = re.compile(r"\bapt(-get)?\s+(remove|purge|autoremove)\b", re.I)
_DESKTOP_HINT = re.compile(
    r"\b(ubuntu-desktop(-minimal)?|gnome-shell|gdm3?|lightdm|sddm|"
    r"xserver-xorg|nvidia-system-station)\b",
    re.I,
)


def is_apt_simulate(command: str) -> bool:
    cmd = (command or "").strip()
    if not re.search(r"\bapt(-get)?\b", cmd, re.I):
        return False
    return bool(_SIM_FLAG.search(cmd))


def needs_package_impact_preview(command: str) -> bool:
    """True for cascade-prone apt mutations that should dry-run before approval."""
    cmd = (command or "").strip()
    if is_apt_simulate(cmd):
        return False
    if _AUTOREMOVE.search(cmd):
        return True
    if _APT_MUTATE.search(cmd) and "*" in cmd:
        return True
    return False


def build_apt_simulate_command(command: str) -> str:
    """Turn an apt mutation into a non-destructive `apt-get -s …` preview."""
    cmd = _SUDO_PREFIX.sub("", (command or "").strip())
    cmd = _YES_FLAG.sub(" ", cmd)
    cmd = re.sub(r"\s+", " ", cmd).strip()
    if not cmd:
        return "apt-get -s autoremove"
    if _SIM_FLAG.search(cmd):
        cmd = re.sub(r"^apt\b", "apt-get", cmd, count=1, flags=re.I)
        return cmd
    cmd = re.sub(r"^apt\b", "apt-get", cmd, count=1, flags=re.I)
    if re.match(r"^apt-get\b", cmd, re.I):
        return re.sub(r"^apt-get\b", "apt-get -s", cmd, count=1, flags=re.I)
    return f"apt-get -s {cmd}"


def summarize_apt_simulate(text: str, *, limit: int = 60) -> str:
    """Compress apt-get -s output into an approval-friendly package list."""
    raw = text or ""
    removed: list[str] = []
    for line in raw.splitlines():
        s = line.strip()
        # apt-get -s lines like: "Remv foo [1.2.3]"
        if s.lower().startswith("remv "):
            pkg = s.split()[1] if len(s.split()) > 1 else s
            removed.append(pkg)
            continue
        # Section dumps: "  package1 package2"
        if s.lower().startswith("the following packages will be removed"):
            continue
    # Fallback: collect tokens after REMOVED header block
    if not removed:
        in_removed = False
        for line in raw.splitlines():
            low = line.lower()
            if "packages will be removed" in low or "will be removed:" in low:
                in_removed = True
                continue
            if in_removed:
                if not line.strip():
                    if removed:
                        break
                    continue
                if line.startswith(" "):
                    removed.extend(line.split())
                else:
                    break

    # de-dupe preserve order
    seen: set[str] = set()
    pkgs: list[str] = []
    for p in removed:
        p = p.strip().rstrip(",")
        if not p or p in seen:
            continue
        seen.add(p)
        pkgs.append(p)

    if not pkgs:
        snippet = re.sub(r"\s+", " ", raw).strip()
        if not snippet:
            return "干跑无输出（无法预览将变更的软件包）。"
        return f"干跑未能解析软件包列表。原始输出摘录：{snippet[:500]}"

    desktop = [p for p in pkgs if _DESKTOP_HINT.search(p)]
    head = pkgs[:limit]
    more = len(pkgs) - len(head)
    lines = [
        f"预计删除 {len(pkgs)} 个软件包：",
        ", ".join(head) + (f" …(+{more})" if more > 0 else ""),
    ]
    if desktop:
        lines.append(
            "⚠️ 包含桌面/显示相关包：" + ", ".join(desktop[:20])
            + (" …" if len(desktop) > 20 else "")
        )
    return "\n".join(lines)
