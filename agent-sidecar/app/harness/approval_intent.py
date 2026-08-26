"""Tool/approval intent language must match the latest user message."""

from __future__ import annotations

import re
from typing import Any

from app.harness.command_display import first_executable_statement, sanitize_terminal_command

_CJK_RE = re.compile(r"[\u4e00-\u9fff]")
_LATIN_RE = re.compile(r"[A-Za-z]")

_GENERIC_INTENT = {
    "will run the command below; please confirm to proceed.",
    "will run the command below",
    "please confirm to proceed.",
    "将执行下方命令；请确认后继续。",
    "将执行下方命令",
    "请确认后继续。",
    "请确认后继续",
}

_DOCKER_IMAGE = re.compile(
    r"docker\s+run\b(?:\s+--[\w-]+(?:=\S+|\s+\S+)?)*\s+"
    r"(?:--entrypoint\s+\S+\s+)?"
    r"([\w./-]+(?::[\w./-]+)?)",
    re.IGNORECASE,
)
_DOCKER_EXEC = re.compile(r"docker\s+exec\s+(\S+)", re.IGNORECASE)
_PIP_INSTALL = re.compile(
    r"\bpip(?:3)?\s+install(?:\s+-U|\s+--upgrade)?\s+(\S+)",
    re.IGNORECASE,
)
_PIP_LIST = re.compile(r"\bpip(?:3)?\s+list\b", re.IGNORECASE)
_SYSTEMCTL = re.compile(r"systemctl\s+(\w+)\s+(\S+)", re.IGNORECASE)

# curl flags that consume the next token
_CURL_VALUE_FLAGS = frozenset(
    {
        "-x",
        "-X",
        "-H",
        "-d",
        "-m",
        "--max-time",
        "--connect-timeout",
        "--proxy",
        "--header",
        "--data",
        "--data-raw",
        "--user",
        "-u",
    }
)


def _cjk_count(text: str) -> int:
    return len(_CJK_RE.findall(text or ""))


def _latin_count(text: str) -> int:
    return len(_LATIN_RE.findall(text or ""))


def latest_user_text(messages: list[dict[str, Any]]) -> str:
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, str) and content.strip():
            return content.strip()
    return ""


def conversation_locale(messages: list[dict[str, Any]]) -> str:
    """Infer zh vs en from the *latest* user turn only."""
    text = latest_user_text(messages)
    if not text:
        return "en"
    cjk = _cjk_count(text)
    latin = _latin_count(text)
    if cjk >= 2 and cjk >= latin // 4:
        return "zh"
    if latin >= 2:
        return "en"
    if cjk >= 1:
        return "zh"
    return "en"


def _looks_english_prose(text: str) -> bool:
    raw = (text or "").strip()
    if not raw:
        return False
    cjk = _cjk_count(raw)
    latin = _latin_count(raw)
    return cjk == 0 and latin >= 8


def _looks_chinese_prose(text: str) -> bool:
    raw = (text or "").strip()
    if not raw:
        return False
    cjk = _cjk_count(raw)
    latin = _latin_count(raw)
    return cjk >= 2 and cjk >= max(1, latin // 3)


def _is_generic_waffle(text: str) -> bool:
    raw = (text or "").strip().lower().rstrip(".")
    if not raw:
        return True
    if raw in _GENERIC_INTENT or raw + "." in _GENERIC_INTENT:
        return True
    if "command below" in raw and "confirm" in raw:
        return True
    if "下方命令" in (text or "") and "确认" in (text or ""):
        return True
    return False


def _norm_compare(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").lower().strip().rstrip("."))


def _package_name(spec: str) -> str:
    raw = (spec or "").strip().strip('"').strip("'")
    for sep in ("==", ">=", "<=", "~=", "!=", "[", "@"):
        if sep in raw:
            raw = raw.split(sep, 1)[0]
    return raw or spec


def _is_command_echo_intent(intent: str, command: str) -> bool:
    raw = (intent or "").strip()
    if not raw:
        return False
    if re.match(r"^(Run:|执行：)", raw, re.IGNORECASE):
        return True
    body = re.sub(r"^(Run:|执行：)\s*", "", raw, flags=re.IGNORECASE).strip()
    preview = first_executable_statement(command or "")
    if preview and _norm_compare(body) == _norm_compare(preview):
        return True
    cleaned = sanitize_terminal_command(command or "") or (command or "")
    if len(body) >= 24 and body in cleaned:
        return True
    return False


def _is_syntax_level_intent(intent: str) -> bool:
    """Reject intents that narrate flags/syntax instead of operational purpose."""
    raw = (intent or "").strip()
    if not raw:
        return True
    lower = raw.lower()
    if re.match(r"^request\s+-", lower):
        return True
    if re.search(r"\binspect the response\b", lower) and not re.search(
        r"\b(api|service|model|endpoint|health|server|容器|服务|模型)\b", lower
    ):
        return True
    if re.search(r"\b(filter command output|gather the needed information)\b", lower):
        return True
    if re.search(r"\b(从命令输出中筛选|运行 python 脚本获取)\b", raw):
        return True
    # Mentions a curl/shell flag as the "target"
    if re.search(r"\b(-s\b|-m\b|-x\b|--max-time|silent mode)\b", lower):
        if not re.search(r"\b(verify|check|confirm|test|validate|ensure|验证|检查|确认)\b", lower):
            return True
    return False


def _curl_targets(cmd: str) -> list[str]:
    targets: list[str] = []
    for block in re.finditer(r"\bcurl\b([^|;&\n]+)", cmd, re.IGNORECASE):
        tokens = block.group(1).split()
        i = 0
        while i < len(tokens):
            tok = tokens[i].strip("'\"")
            if tok.startswith("-"):
                flag = tok.split("=", 1)[0].lower()
                if "=" in tok:
                    i += 1
                elif flag in _CURL_VALUE_FLAGS:
                    i += 2
                else:
                    i += 1
                continue
            if "://" in tok or tok.startswith("/") or re.match(r"^[\w.-]+:\d+", tok):
                targets.append(tok.rstrip("'\",)"))
            i += 1
    return targets


def _goal_from_curl_target(target: str, locale: str) -> str:
    t = target.lower()
    if "/v1/models" in t or "/v1/chat" in t or "/v1/completions" in t:
        if locale == "zh":
            return "验证模型 API 是否已就绪并可响应"
        return "verify the model API is ready and responding"
    if "health" in t or "healthz" in t:
        if locale == "zh":
            return "确认服务健康检查通过"
        return "confirm the service health check passes"
    if locale == "zh":
        return f"确认 {target} 可访问且响应正常"
    return f"confirm {target} is reachable and responding"


def _join_goals(goals: list[str], locale: str) -> str:
    uniq: list[str] = []
    for g in goals:
        if g and g not in uniq:
            uniq.append(g)
    if not uniq:
        return ""
    if len(uniq) == 1:
        g = uniq[0]
        return g[0].upper() + g[1:] if locale == "en" and g else g
    if locale == "zh":
        if len(uniq) == 2:
            return f"{uniq[0]}，并{uniq[1]}"
        return "，".join(uniq[:-1]) + f"，并{uniq[-1]}"
    if len(uniq) == 2:
        return f"{uniq[0][0].upper() + uniq[0][1:]}, then {uniq[1]}."
    body = ", ".join(g[0].lower() + g[1:] if i else g[0].upper() + g[1:] for i, g in enumerate(uniq[:-1]))
    return f"{body}, then {uniq[-1]}."


def _docker_logs_container(cmd: str) -> str | None:
    m = re.search(r"\bdocker\s+logs\b(.*?)(?:\s*2>&1|\s*[;&|]|$)", cmd, re.IGNORECASE | re.DOTALL)
    if not m:
        return None
    tokens = m.group(1).split()
    name: str | None = None
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if tok.startswith("--"):
            if "=" in tok:
                i += 1
            elif tok.lower() in ("--tail", "--since", "--until", "--timestamps"):
                i += 2
            else:
                i += 1
            continue
        name = tok
        i += 1
    return name


def _collect_command_goals(cmd: str, locale: str) -> list[str]:
    """Operational goals inferred from the full script — not per-flag narration."""
    goals: list[str] = []
    cmd_lower = cmd.lower()

    if re.search(r"\bsleep\s+\d+", cmd, re.IGNORECASE):
        if locale == "zh":
            goals.append("等待服务完成加载")
        else:
            goals.append("wait for the service to finish loading")

    m = re.search(r"\bdocker\s+start\s+(\S+)", cmd, re.IGNORECASE)
    if m:
        name = m.group(1)
        if locale == "zh":
            goals.append(f"启动容器 {name}")
        else:
            goals.append(f"start container {name}")

    logs_container = _docker_logs_container(cmd)
    if logs_container:
        if locale == "zh":
            goals.append(f"查看容器 {logs_container} 的最近日志")
        else:
            goals.append(f"check recent logs from container {logs_container}")

    m = re.search(
        r"docker\s+exec\s+(\S+).*?"
        r"\bpip(?:3)?\s+install(?:\s+-U|\s+--upgrade)?\s+(\S+)",
        cmd,
        re.IGNORECASE | re.DOTALL,
    )
    if m:
        container, pkg = m.group(1), _package_name(m.group(2))
        if locale == "zh":
            goals.append(f"在容器 {container} 中安装或升级 Python 包 {pkg}")
        else:
            goals.append(f"install or upgrade Python package {pkg} in container {container}")
    elif _PIP_INSTALL.search(cmd):
        pkg = _package_name(_PIP_INSTALL.search(cmd).group(1))  # type: ignore[union-attr]
        if locale == "zh":
            goals.append(f"安装或升级 Python 包 {pkg}")
        else:
            goals.append(f"install or upgrade Python package {pkg}")

    if _DOCKER_IMAGE.search(cmd) and (
        _PIP_LIST.search(cmd)
        or re.search(r"--entrypoint\s+pip\b[^|;\n]*\blist\b", cmd, re.I)
    ):
        image = _DOCKER_IMAGE.search(cmd).group(1)  # type: ignore[union-attr]
        if locale == "zh":
            goals.append(f"查看 Docker 镜像 {image} 中已安装的 Python 包")
        else:
            goals.append(f"list installed Python packages in the Docker image {image}")

    m = _DOCKER_EXEC.search(cmd)
    if m and not any("container" in g or "容器" in g for g in goals):
        container = m.group(1)
        if locale == "zh":
            goals.append(f"在容器 {container} 中执行检查")
        else:
            goals.append(f"run a check inside container {container}")

    if re.search(r"zipfile|\.whl|METADATA", cmd, re.IGNORECASE):
        if locale == "zh":
            goals.append("检查 Python wheel 包的元数据与依赖")
        else:
            goals.append("inspect Python wheel package metadata and dependencies")
    elif re.search(r"python3?\s+-c\b", cmd, re.IGNORECASE):
        if locale == "zh":
            goals.append("用 Python 脚本读取所需信息")
        else:
            goals.append("read the needed information with a Python script")

    if "nvidia-smi" in cmd_lower:
        if locale == "zh":
            goals.append("查看 GPU 显存与运行状态")
        else:
            goals.append("check GPU memory and runtime status")

    if "fail2ban" in cmd_lower:
        if locale == "zh":
            goals.append("查看 fail2ban 封禁与相关规则")
        else:
            goals.append("inspect fail2ban bans and related rules")

    m = _SYSTEMCTL.search(cmd)
    if m:
        unit = m.group(2)
        if locale == "zh":
            goals.append(f"查看 systemd 服务 {unit} 的状态")
        else:
            goals.append(f"check systemd service {unit} status")

    if "iptables" in cmd_lower:
        if locale == "zh":
            goals.append("查看 iptables 防火墙规则")
        else:
            goals.append("list iptables firewall rules")

    for target in _curl_targets(cmd):
        goals.append(_goal_from_curl_target(target, locale))

    if "grep" in cmd_lower and not goals:
        if locale == "zh":
            goals.append("从输出中提取关键结论")
        else:
            goals.append("extract the key conclusion from the output")

    return goals


def purpose_from_command(command: str, locale: str) -> str:
    """One plain sentence: what this command is trying to accomplish."""
    cmd = sanitize_terminal_command(command or "") or (command or "")
    goals = _collect_command_goals(cmd, locale)
    if goals:
        return _join_goals(goals, locale)

    if cmd.lower().startswith("cd "):
        if locale == "zh":
            return "切换工作目录并执行后续检查"
        return "Change working directory and run the follow-up check"

    if locale == "zh":
        return "执行终端命令以完成本次检查或变更"
    return "Run a terminal command to complete this check or change"


def intent_from_command(command: str, locale: str) -> str:
    """Backward-compatible alias — always purpose-oriented."""
    return purpose_from_command(command, locale)


def sanitize_approval_intent(
    intent: str | None,
    messages: list[dict[str, Any]],
    command: str = "",
) -> str:
    """Drop waffle / syntax narration; keep or derive a purpose sentence."""
    text = (intent or "").strip()
    if _is_generic_waffle(text):
        text = ""
    if text and (command or "").strip() and _is_command_echo_intent(text, command):
        text = ""
    if text and _is_syntax_level_intent(text):
        text = ""
    locale = conversation_locale(messages)

    if text:
        mismatched = (locale == "zh" and _looks_english_prose(text)) or (
            locale == "en" and _looks_chinese_prose(text)
        )
        if mismatched:
            if (command or "").strip():
                return purpose_from_command(command, locale)
            return text
        return text

    return purpose_from_command(command, locale)
