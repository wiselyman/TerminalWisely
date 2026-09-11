"""Agent Status Bar — distill trajectory meta into an end-of-context block.

Ephemeral: attached only to the model request, not persisted in SessionLog.
"""

from __future__ import annotations

from collections import Counter
from typing import Any

_STATUS_MARK = "[AGENT_STATUS]"
_MAX_CHARS = 800


def _latest_user_goal(messages: list[dict[str, Any]], *, limit: int = 160) -> str:
    for msg in reversed(messages):
        if msg.get("role") != "user":
            continue
        content = msg.get("content")
        if isinstance(content, list):
            parts: list[str] = []
            for block in content:
                if isinstance(block, dict) and block.get("type") == "text":
                    parts.append(str(block.get("text") or ""))
            text = " ".join(parts).strip()
        else:
            text = str(content or "").strip()
        if text:
            return text if len(text) <= limit else text[: limit - 1] + "…"
    return ""


def _tool_counts(messages: list[dict[str, Any]]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        for tc in msg.get("tool_calls") or []:
            if not isinstance(tc, dict):
                continue
            fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
            name = str((fn or {}).get("name") or tc.get("name") or "").strip()
            if name:
                counts[name] += 1
    return counts


def _repeat_command_warning(messages: list[dict[str, Any]]) -> str | None:
    """Flag identical terminal_exec commands appearing 3+ times."""
    cmds: list[str] = []
    for msg in messages:
        if msg.get("role") != "assistant":
            continue
        for tc in msg.get("tool_calls") or []:
            if not isinstance(tc, dict):
                continue
            fn = tc.get("function") if isinstance(tc.get("function"), dict) else {}
            name = str((fn or {}).get("name") or "").strip()
            if name != "terminal_exec":
                continue
            raw = (fn or {}).get("arguments") or "{}"
            try:
                import json

                args = json.loads(raw) if isinstance(raw, str) else raw
            except Exception:  # noqa: BLE001
                args = {}
            if isinstance(args, dict):
                cmd = str(args.get("command") or "").strip()
                if cmd:
                    cmds.append(cmd)
    if not cmds:
        return None
    c = Counter(cmds)
    repeated = [(cmd, n) for cmd, n in c.items() if n >= 3]
    if not repeated:
        return None
    cmd, n = max(repeated, key=lambda x: x[1])
    preview = cmd if len(cmd) <= 80 else cmd[:79] + "…"
    return f"same terminal_exec repeated {n}×: {preview}"


def build_status_bar(
    *,
    messages: list[dict[str, Any]],
    security_mode: str = "safe",
    engineer_mode: str = "linux",
    memory_scope: str | None = None,
    active_plan: list[Any] | None = None,
    injected_skills: list[str] | None = None,
    last_mutation_risk: str | None = None,
    verify_nudged: bool = False,
    pending_approval: bool = False,
    pending_sudo: bool = False,
    tool_calls_used: int = 0,
) -> str:
    """Build a short status block for attention steering (≤ ~800 chars)."""
    lines = [_STATUS_MARK, "Current State:"]
    goal = _latest_user_goal(messages)
    if goal:
        lines.append(f"- Goal: {goal}")
    if active_plan:
        steps: list[str] = []
        for i, step in enumerate(active_plan[:8]):
            if isinstance(step, dict):
                label = str(step.get("step") or step.get("title") or step).strip()
                status = str(step.get("status") or "").strip()
                bit = f"{label}" + (f" [{status}]" if status else "")
            else:
                bit = str(step).strip()
            if bit:
                steps.append(f"{i + 1}.{bit}")
        if steps:
            lines.append(f"- Plan: {'; '.join(steps)}")
    counts = _tool_counts(messages)
    if counts or tool_calls_used:
        summary = ", ".join(f"{n}×{c}" for n, c in counts.most_common(6))
        if not summary:
            summary = f"total {tool_calls_used}"
        lines.append(f"- Tools: {summary}")
    warn = _repeat_command_warning(messages)
    if warn:
        lines.append(f"- Alert: {warn}")
    if injected_skills:
        lines.append(f"- Skills injected: {', '.join(injected_skills[:4])}")
    constraints: list[str] = [f"security={security_mode}", f"mode={engineer_mode}"]
    if memory_scope:
        constraints.append(f"host_scope={memory_scope}")
    if pending_approval:
        constraints.append("waiting_approval")
    if pending_sudo:
        constraints.append("waiting_sudo")
    if last_mutation_risk:
        constraints.append(f"last_mutation={last_mutation_risk}")
        if not verify_nudged:
            constraints.append("verify_pending")
        else:
            constraints.append("verify_nudged")
    lines.append(f"- Constraints: {'; '.join(constraints)}")
    text = "\n".join(lines)
    if len(text) > _MAX_CHARS:
        text = text[: _MAX_CHARS - 1] + "…"
    return text


def is_status_bar_message(msg: dict[str, Any]) -> bool:
    content = msg.get("content")
    return isinstance(content, str) and content.lstrip().startswith(_STATUS_MARK)


def messages_with_status_bar(
    messages: list[dict[str, Any]],
    status: str,
) -> list[dict[str, Any]]:
    """Append ephemeral status at the end (user role — OpenAI-compat safe).

    Call AFTER compact_messages_for_model / normalize so the bar is not merged
    into the static system prefix (preserves placement + KV stability).
    """
    out = [msg for msg in messages if not is_status_bar_message(msg)]
    if status.strip():
        # user role: mid/end system roles break some OpenAI-compatible gateways.
        out.append({"role": "user", "content": status})
    return out


def status_bar_for_run(run: Any) -> str:
    """Build status from an AgentRun-like object."""
    meta = getattr(run, "metadata", None) or {}
    if not isinstance(meta, dict):
        meta = {}
    plan = meta.get("active_plan")
    skills = meta.get("injected_skills")
    return build_status_bar(
        messages=list(getattr(run, "messages", None) or []),
        security_mode=str(getattr(run, "security_mode", None) or "safe"),
        engineer_mode=str(meta.get("engineer_mode") or "linux"),
        memory_scope=str(meta.get("memory_scope") or "") or None,
        active_plan=plan if isinstance(plan, list) else None,
        injected_skills=[str(s) for s in skills] if isinstance(skills, list) else None,
        last_mutation_risk=getattr(run, "last_mutation_risk", None),
        verify_nudged=bool(getattr(run, "verify_nudged", False)),
        pending_approval=getattr(run, "pending_approval", None) is not None,
        pending_sudo=bool(meta.get("pending_sudo")),
        tool_calls_used=int(getattr(run, "tool_calls_used", 0) or 0),
    )