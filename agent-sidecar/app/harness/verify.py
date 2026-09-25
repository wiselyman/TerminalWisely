"""Post-mutation verification helpers."""

from __future__ import annotations

import re
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
    "their language, answering ONLY the latest user goal. Use tool evidence that "
    "directly supports that goal. Do not append a second summary or checklist for "
    "other this-turn findings unless they directly answer the latest ask. No more "
    "tools unless a fact for that goal is still missing."
)

LEAD_IN_ACT_NUDGE = (
    "[HARNESS] You announced a next step (text ends with :/：) but made no tool "
    "call. Call the required tool now. Do not narrate further without acting, "
    "and do not stop after a colon lead-in."
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
    "sections, do NOT open a new '# …' title, do NOT invent a user acknowledgment "
    "dialogue, and do NOT start a second summary/checklist section. You MUST "
    "finish the remaining content for the user in their language in this sample — "
    "do not stop to ask them to reply 「继续」/continue. Output plain continuation "
    "text only (no tools)."
)

TRUNCATED_ANSWER_INCOMPLETE_SUFFIX_ZH = (
    "\n\n…（回答未写完。回复「继续」可让我接着写。）"
)
TRUNCATED_ANSWER_INCOMPLETE_SUFFIX_EN = (
    "\n\n…(Reply cut off. Send “continue” to finish the rest.)"
)


SOFT_CONTINUE_NOTICE = "assistant_soft_continue"

# Soft recovery when the model early-stops (finish=stop, no budget/structure hit).
# Missing sentence-final punctuation is a generic structural cue — no word lists.
# Do NOT treat )]} as terminators: answers often cut after a parenthetical size/path
# like "`/data/foo` (12G)" which is still mid-reply.
# Keep the floor low — post-tool wrap-ups are often short but still cut mid-clause.
SOFT_CONTINUE_MIN_CHARS = 24
# Include :/： — a trailing colon is a lead-in ("next I will…:") not a mid-clause
# cut. Treating it as unfinished forced tool_choice=none continues and blocked
# the actual next tool call.
_SOFT_CONTINUE_TERMINATORS = frozenset("。！？.!?…」』”’\"'：:")


def truncated_answer_nudge(partial: str | None) -> str:
    """Nudge with the last incomplete line so the model can resume mid-token."""
    raw = (partial or "").rstrip()
    last = raw.splitlines()[-1].strip() if raw else ""
    if len(last) > 160:
        last = last[-160:]
    base = TRUNCATED_ANSWER_NUDGE
    # Mid-table cuts: ask for remaining rows only so markdown stays one table.
    table_lines = [
        ln for ln in raw.splitlines() if ln.strip().startswith("|")
    ]
    if len(table_lines) >= 2 or (last.startswith("|") and last.count("|") >= 2):
        base = (
            base
            + " If you were mid markdown table, emit ONLY the remaining table "
            "rows (lines starting with |). Do NOT repeat the header/separator "
            "and do NOT wrap rows in a new code fence."
        )
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


def ends_without_sentence_terminator(content: str | None) -> bool:
    """True when the last non-space char is not a sentence / clause closer."""
    raw = (content or "").rstrip()
    if not raw:
        return False
    # Path / arrow connectors are mid-menu cuts, not finished prose.
    if raw.endswith("->") or raw.endswith("→"):
        return True
    if raw[-1] in _SOFT_CONTINUE_TERMINATORS:
        return False
    last = raw.splitlines()[-1].strip() if raw.splitlines() else raw
    # Complete markdown list / checklist rows often omit a final 。
    if re.match(r"^[-*+]\s+\S", last) or re.match(r"^\d+\.\s+\S", last):
        if len(last) >= 8 and not last.endswith(("：", ":", "，", ",", "、")):
            return False
    # Status emoji / marks at EOL are finished bullets.
    if last.endswith(("✅", "❌", "⚠️", "⚠", "✔", "✖", "✓", "✗")):
        return False
    # Long last line without clause-continuation punctuation:
    # - no sentence closer in the line → finished CJK prose missing final 。
    # - closer exists but a long trailing clause after it → still mid-cut
    if len(last) >= 60 and not last.endswith(
        ("，", ",", "、", "：", ":", "(", "（", "[", "{", "`")
    ):
        closer_idxs = [last.rfind(c) for c in "。！？.!?"]
        last_closer = max(closer_idxs) if closer_idxs else -1
        if last_closer < 0:
            return False
        after = last[last_closer + 1 :].strip()
        if len(after) >= 12:
            return True
        return False
    return True


def continuation_overshoots_finished_prose(
    previous: str | None, joined: str | None
) -> bool:
    """True when a continue closed the sentence then dumped extra sections.

    Classic failure: missing final 。 → soft-continue → model adds 。 + dialogue
    ack + a second checklist. Generic structure only — no product keywords.
    """
    prev = (previous or "").rstrip()
    emit_s = (joined or "").rstrip()
    if not prev or not emit_s.startswith(prev):
        return False
    suffix = emit_s[len(prev) :]
    if not suffix:
        return False
    m = re.match(r"^([。！？.!?…]+)\s*", suffix)
    rest = suffix[m.end() :] if m else suffix
    rest = rest.lstrip("\n")
    if not rest or len(rest) < 24:
        return False
    if "\n\n" in rest:
        return True
    stripped = rest.lstrip()
    if re.match(r"^[-*+]\s+\S", stripped) or re.match(r"^\d+\.\s+\S", stripped):
        return True
    if re.match(r"^#{1,6}\s+\S", stripped):
        return True
    first_line = stripped.split("\n", 1)[0].strip()
    if first_line.endswith(("：", ":")) and len(first_line) <= 40:
        return True
    return False


def trim_overcontinued_answer(previous: str | None, emit: str | None) -> str:
    """Keep prior text (+ optional closer) when continue overshot into new sections."""
    prev = (previous or "").rstrip()
    emit_s = (emit or "").rstrip()
    if prev and emit_s.startswith(prev):
        suffix = emit_s[len(prev) :]
        m = re.match(r"^([。！？.!?…]+)", suffix)
        if m:
            return prev + m.group(1)
        return prev
    return emit_s or prev


def continuation_is_redundant(previous: str | None, joined: str | None) -> bool:
    """True when a trunc-continue mostly republished earlier paragraphs (dead loop)."""
    prev = (previous or "").strip()
    joined_s = (joined or "").strip()
    if not prev or not joined_s:
        return False
    if len(joined_s) <= len(prev) + 24:
        return True
    paras = [p.strip() for p in re.split(r"\n{2,}", joined_s) if len(p.strip()) >= 40]
    if paras:
        top = max((paras.count(p) for p in set(paras)), default=0)
        if top >= 2:
            return True
    # Long stem of the prior answer appears twice in the joined text.
    stem = prev[: min(96, len(prev))]
    if len(stem) >= 48 and joined_s.count(stem) >= 2:
        return True
    return False


def collapse_repeated_paragraphs(text: str | None) -> str:
    """Drop duplicate ≥40-char paragraphs (keep first) after a continue echo."""
    raw = text or ""
    if not raw.strip():
        return raw
    parts = re.split(r"(\n{2,})", raw)
    seen: set[str] = set()
    out: list[str] = []
    for part in parts:
        if re.fullmatch(r"\n{2,}", part or ""):
            if out and not re.fullmatch(r"\n{2,}", out[-1] or ""):
                out.append(part)
            continue
        key = part.strip()
        if len(key) >= 40:
            if key in seen:
                continue
            seen.add(key)
        out.append(part)
    # Trim trailing separators.
    while out and re.fullmatch(r"\n{2,}", out[-1] or ""):
        out.pop()
    return "".join(out)


def should_stop_truncated_continue(
    *,
    nudges: int,
    grew: bool,
    previous: str | None,
    emit: str | None,
) -> bool:
    """Stop auto-continue when the model is echoing instead of finishing."""
    from app.llm.thinking import is_repetition_loop, looks_like_response_echo_loop

    text = emit or ""
    if is_repetition_loop(text) or looks_like_response_echo_loop(text):
        return True
    if nudges > 0 and not grew:
        return True
    if nudges > 0 and continuation_is_redundant(previous, emit):
        return True
    if nudges > 0 and continuation_overshoots_finished_prose(previous, emit):
        return True
    return False


def looks_like_action_lead_in(content: str | None) -> bool:
    """Short assistant text that only announces a next step (ends with :/：).

    Under tool_choice=none this must not be treated as a finished answer — unlock
    tools and act. Generic punctuation cue only; no task/software keywords.
    """
    raw = (content or "").strip()
    if not raw or len(raw) > 240:
        return False
    return raw.endswith((":", "："))


def join_answer_continuation(previous: str | None, incoming: str | None) -> str:
    """Join a trunc-continue sample onto the prior partial into one full answer.

    Models often restate the dangling last line then finish. The UI must receive
    the joined full text (replace) — never a short suffix alone for the FE to guess.
    Generic overlap / last-line stem only — no task or software keywords.
    """
    prev = (previous or "").rstrip()
    nxt = (incoming or "").lstrip()
    if not prev:
        return nxt
    if not nxt:
        return prev

    lines = prev.splitlines() or [prev]
    last = lines[-1]
    stem = last.rstrip("：:，,、").strip()
    if len(stem) >= 6 and nxt.startswith(stem):
        lines[-1] = nxt
        joined = "\n".join(lines)
        return _collapse_dangling_line_repeat(joined)

    max_k = min(len(prev), len(nxt), 800)
    overlap = 0
    for k in range(max_k, 7, -1):
        if prev[-k:] == nxt[:k]:
            overlap = k
            break
    if overlap:
        joined = prev if overlap == len(nxt) else prev[:-overlap] + nxt
        return _collapse_dangling_line_repeat(joined)

    # Pure suffix (no restated stem) — append with a space if needed.
    if prev[-1:].isalnum() and nxt[:1].isalnum():
        return prev + " " + nxt
    return prev + nxt


def _collapse_dangling_line_repeat(text: str) -> str:
    """'重载：重载配置' → keep one copy when a continue restates the dangling stem."""
    return re.sub(r"([^\n：:]{6,}?)[：:，,、]\s*\1", r"\1", text)


def should_emit_soft_continue_hint(
    content: str | None,
    *,
    budget_hit: bool,
    structural_trunc: bool,
) -> bool:
    """Prose ended without A/B signals and without a sentence terminator.

    Soft notice only (no auto-continue) — recovers early-EOS cuts that look
    structurally fine (no unclosed fence/bold) but stop mid-clause.
    """
    if budget_hit or structural_trunc:
        return False
    raw = (content or "").strip()
    if len(raw) < SOFT_CONTINUE_MIN_CHARS:
        return False
    return ends_without_sentence_terminator(raw)


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
