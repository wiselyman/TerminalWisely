"""Post-mutation verification helpers."""

from __future__ import annotations

from typing import Any


VERIFY_NUDGE = (
    "[HARNESS] Previous mutating command reported exit_code=0 but SUCCESS requires "
    "evidence. Run a verify terminal_exec (status/logs/port/test) before concluding. "
    "Exit code alone is insufficient."
)

ACT_NUDGE = (
    "[HARNESS] Your previous turn had no tool calls and no user-facing answer "
    "(planning/thinking only). Call the required tools now (e.g. terminal_exec / "
    "web_fetch) to make progress. Do not narrate a plan without acting."
)

LOOP_ABORT_MESSAGE = (
    "模型陷入重复叙述（空转计划），已停止本轮。"
    "请换一种说法再试；若是安装类任务，也可直接提供确切下载链接 / 安装步骤，"
    "或让我改用 web_search 一次后根据结果执行。"
)


def should_nudge_verify(
    *,
    risk: str,
    exit_code: int | None,
    already_nudged: bool,
) -> bool:
    if already_nudged:
        return False
    if exit_code != 0:
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
