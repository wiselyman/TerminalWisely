"""Strip model thinking / CoT from assistant-visible content."""

from __future__ import annotations

import re
from collections import Counter

_OPEN_CLOSE = (
    ("think", "think"),
    ("thinking", "thinking"),
    ("reasoning", "reasoning"),
    ("reflection", "reflection"),
    ("redacted_thinking", "redacted_thinking"),
)
_THINK_TAG_RE = re.compile(
    "|".join(
        rf"<{re.escape(o)}\b[^>]*>.*?</{re.escape(c)}>"
        for o, c in _OPEN_CLOSE
    ),
    re.IGNORECASE | re.DOTALL,
)

# Untagged English planning dumps (common when thinking mode leaks into content).
_COT_MARKERS = (
    "the user is asking",
    "the user wants",
    "the user requested",
    "here's a thinking process",
    "thinking process:",
    "identify the goal",
    "constraint check",
    "drafting the response",
    "final polish",
    "refining the response",
    "for the first question",
    "for the second question",
    "based on my system prompt",
    "i will answer in",
    "this looks correct and complete",
    "no specific formatting constraints",
    "plan:",
    "identity:",
    "search capability:",
    "sudo password",
    "i cannot provide it interactively",
    "i will ask the user for the password",
    "step-by-step plan",
    "my plan is",
    "i need to",
    "first, i should",
    "next, i should",
    "let's execute",
    "command construction",
    "risk assessment",
    "actually, i think",
    "wait, i should",
    "let me try to",
    "this is a security policy",
)

# Chinese "thinking out loud" that never calls tools (URL guessing loops, etc.).
_ZH_PLAN_MARKERS = (
    "让我尝试",
    "实际上，让我",
    "或者，我可以",
    "或者让我尝试",
    "根据之前的搜索结果",
    "让我尝试一个常见",
    "看看是否有下载链接",
    "官方下载页面通常",
    "下载链接可能类似于",
    "我可以使用已知的",
    "让我直接访问",
    "或者，我可以使用",
)

_NUMBERED_PLAN_RE = re.compile(r"^\d+\.\s+\*\*[^*]+\*\*", re.MULTILINE)
_CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def _cjk_count(text: str) -> int:
    return len(_CJK_RE.findall(text or ""))


_CMD_LINE_RE = re.compile(
    r"(?:^|\n)\s*(?:sudo\s+)?(?:lscpu|free|df|ps|cat|head|tail|uname|lsblk|"
    r"hostnamectl|uptime|whoami|id|ss|netstat|systemctl|journalctl|dmesg|"
    r"apt(?:-get)?|dpkg|rpm|yum|dnf|which|type)\b",
    re.IGNORECASE,
)


def is_repetition_loop(text: str | None) -> bool:
    """True when the model is stuck repeating the same *prose* paragraph.

    Command dumps (``ps aux``, ``lscpu | grep …`` listed 4 times before
    ``terminal_exec``) are not loops — they share short prefixes and would
    false-positive a sliding-window count.
    """
    raw = (text or "").strip()
    if len(raw) < 240:
        return False
    # Tool-call preambles: several diagnostic commands, little repeated prose.
    cmd_hits = len(_CMD_LINE_RE.findall(raw))
    if cmd_hits >= 2 and _cjk_count(raw) < 80:
        return False
    paras = [p.strip() for p in re.split(r"\n{2,}", raw) if len(p.strip()) >= 40]
    if len(paras) >= 3:
        top_n = Counter(paras).most_common(1)[0][1]
        if top_n >= 3:
            return True
    # Same *prose* span ≥3 times. Skip windows that look like shell/JSON.
    for size in (64, 96, 128):
        if len(raw) < size * 3:
            continue
        for start in (0, len(raw) // 3):
            window = raw[start : start + size]
            if len(window) < size:
                continue
            if _looks_like_commandish(window):
                continue
            if raw.count(window) >= 3:
                return True
    return False


def _looks_like_commandish(window: str) -> bool:
    low = window.lower()
    if any(tok in low for tok in ("terminal_exec", "\"command\"", "| grep", "| head", "sudo ")):
        return True
    if _CMD_LINE_RE.search(window):
        return True
    return False


def looks_like_zh_planning_narration(text: str | None) -> bool:
    """Chinese self-talk / URL guessing without a real user-facing conclusion."""
    raw = (text or "").strip()
    if len(raw) < 80:
        return False
    hits = sum(1 for m in _ZH_PLAN_MARKERS if m in raw)
    if hits >= 2:
        return True
    if hits >= 1 and is_repetition_loop(raw):
        return True
    return False


def _looks_like_cot_block(text: str) -> bool:
    low = (text or "").strip().lower()
    if not low:
        return False
    hits = sum(1 for m in _COT_MARKERS if m in low)
    if hits >= 1:
        return True
    if re.match(r"^\d+\.\s+\*\*", low) and (
        "analyze" in low or "question" in low or "identify" in low or "goal" in low
    ):
        return True
    if looks_like_zh_planning_narration(text):
        return True
    return False


def _is_english_planning_dump(text: str) -> bool:
    """Long English planner / loop dumps with little or no CJK = not a user reply."""
    raw = (text or "").strip()
    if len(raw) < 400:
        return False
    if _cjk_count(raw) >= 24:
        return False
    low = raw.lower()
    if low.startswith(
        (
            "the user ",
            "here's a thinking",
            "thinking process",
            "okay, ",
            "ok, ",
            "let's ",
            "actually, ",
            "wait, i",
            "let me try",
        )
    ):
        return True
    if sum(1 for m in _COT_MARKERS if m in low) >= 2 and len(raw) > 800:
        return True
    if low.count("actually,") >= 2 and low.count("let me try") >= 1:
        return True
    if _NUMBERED_PLAN_RE.search(raw) and ("identify the goal" in low or "the user" in low):
        return True
    if raw.count("\n\n") > 40 and ("let's execute" in low or "let's proceed" in low):
        return True
    return False


def sanitize_assistant_content(text: str | None) -> str:
    """Return user-facing answer only — drop think tags and leaked CoT dumps."""
    raw = text if isinstance(text, str) else ""
    cleaned = _THINK_TAG_RE.sub("", raw).strip()
    if not cleaned:
        return ""

    if is_repetition_loop(cleaned) or looks_like_zh_planning_narration(cleaned):
        return ""

    if _is_english_planning_dump(cleaned):
        return ""

    parts = [p.strip() for p in re.split(r"\n{2,}", cleaned) if p.strip()]
    if len(parts) < 2:
        return "" if _looks_like_cot_block(cleaned) else cleaned

    if not any(_looks_like_cot_block(p) for p in parts):
        return cleaned

    answer: list[str] = []
    for part in reversed(parts):
        if _looks_like_cot_block(part) and answer:
            break
        if _looks_like_cot_block(part) and not answer:
            continue
        answer.append(part)
    if answer:
        return "\n\n".join(reversed(answer)).strip()
    return ""


_TAG_NAME_RE = re.compile(
    r"^</?(?:think|thinking|reasoning|reflection|redacted_thinking)\b[^>]*>",
    re.IGNORECASE,
)

_COT_OPENERS = (
    "the user is asking",
    "the user wants",
    "the user requested",
    "here's a thinking",
    "thinking process",
    "okay, ",
    "ok, ",
    "let's ",
    "identify the goal",
    "here's a thinking process",
    "actually, i think",
    "actually, ",
    "wait, i should",
    "let me try",
)

_ZH_STREAM_OPENERS = (
    "让我尝试",
    "实际上，让我",
    "或者，我可以",
    "或者让我尝试",
    "根据之前的搜索结果",
)


def _could_become_cot_opener(text: str) -> bool:
    """True while `text` is still a prefix of (or starts) a known CoT opener."""
    low = (text or "").lstrip().lower()
    if not low:
        return True
    for opener in _COT_OPENERS:
        if opener.startswith(low) or low.startswith(opener):
            return True
    stripped = (text or "").lstrip()
    for opener in _ZH_STREAM_OPENERS:
        if opener.startswith(stripped) or stripped.startswith(opener):
            return True
    return False


class StreamContentFilter:
    """Incremental filter: hide think-tags and planning dumps while streaming."""

    def __init__(self) -> None:
        self._raw = ""
        self._visible = ""
        self._pending = ""
        self._hold = ""
        self._in_think = False
        self._suppress_cot = False
        self._started = False
        self.thinking = False
        self.loop_detected = False

    def feed(self, chunk: str) -> str:
        """Ingest a content delta; return newly visible text (may be empty)."""
        if not chunk:
            return ""
        if self.loop_detected:
            self._raw += chunk
            return ""
        self._raw += chunk
        if len(self._raw) > 400 and is_repetition_loop(self._raw):
            self.loop_detected = True
            self.thinking = True
            self._suppress_cot = True
            return ""
        text = self._pending + chunk
        self._pending = ""
        out: list[str] = []
        i = 0
        while i < len(text):
            if self._in_think:
                close = re.search(
                    r"</(?:think|thinking|reasoning|reflection|redacted_thinking)\s*>",
                    text[i:],
                    re.IGNORECASE,
                )
                if not close:
                    self._pending = text[i:]
                    break
                i += close.end()
                self._in_think = False
                self.thinking = self._suppress_cot
                continue

            lt = text.find("<", i)
            if lt < 0:
                out.append(self._emit_plain(text[i:]))
                i = len(text)
                break

            if lt > i:
                out.append(self._emit_plain(text[i:lt]))
                i = lt

            if ">" not in text[i:]:
                self._pending = text[i:]
                break

            m = _TAG_NAME_RE.match(text[i:])
            if m:
                tag = m.group(0)
                i += m.end()
                if tag.startswith("</"):
                    self._in_think = False
                else:
                    self._in_think = True
                    self.thinking = True
                continue

            out.append(self._emit_plain(text[i]))
            i += 1

        visible_piece = "".join(x for x in out if x)
        if visible_piece:
            self._visible += visible_piece
            if is_repetition_loop(self._visible):
                self.loop_detected = True
                self.thinking = True
                return ""
        return visible_piece

    def _emit_plain(self, piece: str) -> str:
        if not piece:
            return ""
        if self._suppress_cot or self.loop_detected:
            self.thinking = True
            return ""

        if not self._started:
            self._hold += piece
            hold_low = self._hold.lstrip().lower()
            hold_zh = self._hold.lstrip()
            for opener in _COT_OPENERS:
                if hold_low.startswith(opener):
                    self._suppress_cot = True
                    self.thinking = True
                    self._hold = ""
                    self._started = True
                    return ""
            for opener in _ZH_STREAM_OPENERS:
                if hold_zh.startswith(opener):
                    self._suppress_cot = True
                    self.thinking = True
                    self._hold = ""
                    self._started = True
                    return ""
            if _could_become_cot_opener(self._hold):
                self.thinking = True
                return ""
            released = self._hold
            self._hold = ""
            self._started = True
            self.thinking = False
            return self._scrub_loops(released)

        return self._scrub_loops(piece)

    @staticmethod
    def _scrub_loops(piece: str) -> str:
        if re.search(r"let's execute|wait,\s*i'll check", piece, re.IGNORECASE):
            return re.sub(
                r"(?i)(\*\*)?(wait,?\s*i'?ll check the result\.?|let'?s execute\.?)(\*\*)?",
                "",
                piece,
            )
        return piece

    @property
    def raw(self) -> str:
        return self._raw

    def finalize(self) -> str:
        """Flush pending bytes and return fully sanitized visible content."""
        if self.loop_detected or self._suppress_cot:
            return ""
        if self._pending and not self._in_think and not self._suppress_cot:
            if not self._started:
                self._hold += self._pending
            else:
                self._visible += self._pending
        self._pending = ""
        if self._hold and not self._suppress_cot:
            zh = self._hold.lstrip()
            if any(zh.startswith(o) for o in _ZH_STREAM_OPENERS):
                self._hold = ""
            elif not _could_become_cot_opener(self._hold) or not any(
                self._hold.lstrip().lower().startswith(o)
                or o.startswith(self._hold.lstrip().lower())
                for o in _COT_OPENERS
            ):
                self._visible += self._hold
            self._hold = ""
        return sanitize_assistant_content(self._raw)
