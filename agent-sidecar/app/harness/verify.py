"""Post-mutation verification helpers."""

from __future__ import annotations

from typing import Any


VERIFY_NUDGE = (
    "[HARNESS] Previous mutating command reported exit_code=0 but SUCCESS requires "
    "evidence. Run a verify terminal_exec (status/logs/port/test) before concluding. "
    "Exit code alone is insufficient."
)

VERIFY_NUDGE_K8S = (
    "[HARNESS] Previous mutating k8s_* call reported exit_code=0 but SUCCESS requires "
    "evidence. Verify with k8s_get / k8s_describe / k8s_logs / k8s_list before concluding. "
    "Exit code alone is insufficient."
)

ACT_NUDGE = (
    "[HARNESS] Your previous turn had no tool calls and no user-facing answer "
    "(planning/thinking only). Call the required tools now (e.g. terminal_exec / "
    "web_fetch) to make progress. Do not narrate a plan without acting."
)

ACT_NUDGE_K8S = (
    "[HARNESS] Your previous turn had no tool calls and no user-facing answer "
    "(planning/thinking only). Call the required tools now (e.g. k8s_list / k8s_get / "
    "k8s_describe / k8s_logs) to make progress. Do not narrate a plan without acting."
)

CONCLUDE_NUDGE = (
    "[HARNESS] Tool results are already in this conversation. Do NOT re-plan or "
    "repeat English/Chinese thinking. Write the final answer to the user now in "
    "their language, using only the tool evidence. No more tools unless a fact "
    "is still missing."
)

TRUNCATED_PLAN_NUDGE = (
    "[HARNESS] You wrote a numbered plan (and may have stopped mid-step) but did "
    "not call any tools. Do NOT continue writing Step N. Immediately call "
    "terminal_exec for the next real command. Output ONLY tool calls this turn."
)

TRUNCATED_PLAN_NUDGE_K8S = (
    "[HARNESS] You wrote a numbered plan (and may have stopped mid-step) but did "
    "not call any tools. Do NOT continue writing Step N. Immediately call "
    "k8s_list / k8s_get / k8s_describe for the next real probe. Output ONLY tool "
    "calls this turn."
)

TRUNCATED_ANSWER_NUDGE = (
    "[HARNESS] Your previous reply was cut off mid-sentence (output length limit "
    "or incomplete ending). Continue EXACTLY from the last incomplete word/line — "
    "do NOT restart with the same markdown heading, do NOT rewrite earlier "
    "sections, do NOT open a new '# …' title. Finish the remaining points for "
    "the user in their language. Output plain continuation text only (no tools)."
)

TRUNCATED_ANSWER_INCOMPLETE_SUFFIX_ZH = (
    "\n\n…（回答未写完。回复「继续」可让我接着写。）"
)
TRUNCATED_ANSWER_INCOMPLETE_SUFFIX_EN = (
    "\n\n…(Reply cut off. Send “continue” to finish the rest.)"
)


def truncated_answer_nudge(partial: str | None) -> str:
    """Nudge with the last incomplete line so the model can resume mid-token."""
    raw = (partial or "").rstrip()
    last = raw.splitlines()[-1].strip() if raw else ""
    if len(last) > 160:
        last = last[-160:]
    base = TRUNCATED_ANSWER_NUDGE
    if not last:
        return base
    return (
        f"{base}\n\nLast incomplete line (resume right after this):\n```\n{last}\n```"
    )


def incomplete_answer_suffix(partial: str | None) -> str:
    """User-visible footer when auto-continue still could not finish."""
    raw = partial or ""
    cjk = sum(1 for ch in raw if "\u4e00" <= ch <= "\u9fff")
    if cjk >= 8:
        return TRUNCATED_ANSWER_INCOMPLETE_SUFFIX_ZH
    return TRUNCATED_ANSWER_INCOMPLETE_SUFFIX_EN


LOOP_ABORT_MESSAGE = (
    "模型陷入重复叙述（空转计划），已停止本轮。"
    "请换一种说法再试；若是安装类任务，也可直接提供确切下载链接 / 安装步骤，"
    "或让我改用 web_search 一次后根据结果执行。"
)


def nudge_for_engineer_mode(kind: str, engineer_mode: str | None = None) -> str:
    """Return Linux or K8s harness nudge text without changing Linux defaults."""
    k8s = (engineer_mode or "linux").strip().lower() == "k8s"
    if kind == "verify":
        return VERIFY_NUDGE_K8S if k8s else VERIFY_NUDGE
    if kind == "act":
        return ACT_NUDGE_K8S if k8s else ACT_NUDGE
    if kind == "truncated_plan":
        return TRUNCATED_PLAN_NUDGE_K8S if k8s else TRUNCATED_PLAN_NUDGE
    if kind == "truncated_answer":
        return TRUNCATED_ANSWER_NUDGE
    return CONCLUDE_NUDGE


def _looks_like_sudo_password_needed(stdout: str, stderr: str) -> bool:
    """Generic auth-failure text — not app-specific hardcoding."""
    combined = f"{stdout}\n{stderr}".lower()
    return (
        "a password is required" in combined
        or "a terminal is required" in combined
        or "no tty present" in combined
        or "no askpass" in combined
        or "sorry, try again" in combined
        or "incorrect password" in combined
        or "authentication failure" in combined
        or "需要密码" in combined
        or ("密码" in combined and "sudo" in combined)
    )


def should_nudge_verify(
    *,
    risk: str,
    exit_code: int | None,
    already_nudged: bool,
    ok: bool | None = None,
    stdout: str = "",
    stderr: str = "",
) -> bool:
    if already_nudged:
        return False
    if ok is False:
        return False
    if exit_code != 0:
        return False
    if _looks_like_sudo_password_needed(stdout, stderr):
        return False
    return risk in {"R1", "R2", "R3"}


def claim_success_without_evidence(messages: list[dict[str, Any]]) -> bool:
    """Heuristic: assistant claims success without a later verify-style tool."""
    texts = [
        str(m.get("content") or "").lower()
        for m in messages
        if m.get("role") == "assistant"
    ]
    if not any("success" in t or "成功" in t or "已完成" in t for t in texts):
        return False
    tool_blobs = " ".join(
        str(m.get("content") or "") for m in messages if m.get("role") == "tool"
    ).lower()
    verify_hints = ("active", "listening", "running", "ok", "verify", "status")
    return not any(h in tool_blobs for h in verify_hints)
