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
    "this is sufficient",
    "i will output the response",
    "one last check",
    "one detail:",
    "i will answer '",
    "i will answer \"",
)

# Model echo of "Response:" + same answer (common with local thinking models).
_RESPONSE_HEADER_RE = re.compile(r"(?mi)^\s*Response\s*:\s*")
_OUTPUT_META_LINE_RE = re.compile(
    r"(?im)^\s*(?:this is sufficient|i will output the response|"
    r"one last check\b|one detail\b|i will answer\b).*$"
)
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
_STEP_HEADER_RE = re.compile(
    r"(?:\*\*)?(?:Step|步骤)\s*\d+(?:\*\*)?",
    re.IGNORECASE,
)
# Self-talk hedges while stalling instead of calling tools (any language/model).
_WAFFLE_RE = re.compile(
    r"(?:^|\n)\s*(?:wait,|let's (?:run|start|go|execute|do|check)|"
    r"i'll (?:just )?run|i will (?:just )?(?:run|execute|check)|"
    r"let's start with|then i will proceed|then answer|"
    r"i'll run these)",
    re.IGNORECASE,
)
_INTENT_LABEL_RE = re.compile(r"(?:^|\n)\s*(?:Intent|意图)\s*:", re.IGNORECASE)
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


def looks_like_response_echo_loop(text: str | None) -> bool:
    """True when the model reprints ``Response:`` / the same answer multiple times."""
    raw = text or ""
    if len(_RESPONSE_HEADER_RE.findall(raw)) >= 2:
        return True
    low = raw.lower()
    if low.count("i will output the response") >= 2:
        return True
    if low.count("this is sufficient") >= 2 and _cjk_count(raw) >= 12:
        return True
    return False


def _cut_at_output_meta(text: str) -> str:
    """Drop trailing English 'I will output the response' self-talk."""
    lines = (text or "").splitlines()
    kept: list[str] = []
    meta_prefixes = (
        "this is sufficient",
        "i will output the response",
        "one last check",
        "one detail",
        "response:",
    )
    for line in lines:
        stripped = line.strip()
        low = stripped.lower()
        if _OUTPUT_META_LINE_RE.match(stripped):
            break
        if low.startswith("response:"):
            continue
        # Incomplete streamed prefixes of meta lines ("Th", "This is suf", …).
        if len(low) >= 3 and any(p.startswith(low) or low.startswith(p) for p in meta_prefixes):
            break
        kept.append(line)
    return "\n".join(kept).strip()


def extract_first_user_answer(text: str | None) -> str:
    """Best-effort first user-facing answer when the model echo-loops."""
    raw = (text or "").strip()
    if not raw:
        return ""

    def _usable(block: str) -> str | None:
        cut = _cut_at_output_meta(_RESPONSE_HEADER_RE.sub("", block).strip())
        if not cut:
            return None
        if looks_like_zh_planning_narration(cut) or _looks_like_cot_block(cut):
            return None
        if _cjk_count(cut) >= 8:
            return cut
        if len(cut) >= 24 and not any(m in cut.lower() for m in _COT_MARKERS):
            return cut
        return None

    if _RESPONSE_HEADER_RE.search(raw):
        for chunk in _RESPONSE_HEADER_RE.split(raw):
            got = _usable(chunk)
            if got:
                return got

    for part in re.split(r"\n{2,}", raw):
        got = _usable(part)
        if got:
            return got
    return ""


def looks_like_truncated_plan(text: str | None) -> bool:
    """True when the model dumped a numbered plan and stopped mid-step, no tools."""
    raw = (text or "").rstrip()
    if len(raw) < 40:
        return False
    if not _STEP_HEADER_RE.search(raw):
        return False
    # Ends on a step header with nothing after it: "**Step 3" / "步骤 3："
    last = raw.splitlines()[-1].strip() if raw.splitlines() else ""
    if _STEP_HEADER_RE.fullmatch(last.rstrip(":：")) or _STEP_HEADER_RE.fullmatch(last):
        return True
    if raw.endswith(("**Step", "**步骤", "Step ", "步骤 ")):
        return True
    # Truncated markdown heading / bold
    if raw.endswith(("**", "*")) and _STEP_HEADER_RE.search(raw[-80:]):
        return True
    return False


def looks_like_idle_plan_dump(text: str | None) -> bool:
    """True when the model is rewriting a plan in chat instead of calling tools.

    Behavioral, not model-specific: hedges + repeated Intent/Command blocks.
    A normal user-facing answer does not say Wait/Let's run a dozen times.
    """
    raw = text or ""
    if len(raw) < 280:
        return False
    waffle = len(_WAFFLE_RE.findall(raw))
    intents = len(_INTENT_LABEL_RE.findall(raw))
    steps = len(_STEP_HEADER_RE.findall(raw))
    lines = [ln.strip() for ln in raw.splitlines() if len(ln.strip()) >= 24]
    repeated_line = Counter(lines).most_common(1)[0][1] if lines else 0
    if waffle >= 4:
        return True
    if intents >= 3 and waffle >= 2:
        return True
    if repeated_line >= 4 and waffle >= 2:
        return True
    if steps >= 3 and waffle >= 3:
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

    if looks_like_zh_planning_narration(cleaned) or looks_like_idle_plan_dump(cleaned):
        return ""

    if is_repetition_loop(cleaned) or looks_like_response_echo_loop(cleaned):
        return extract_first_user_answer(cleaned)

    if _is_english_planning_dump(cleaned):
        return ""

    parts = [p.strip() for p in re.split(r"\n{2,}", cleaned) if p.strip()]
    if len(parts) < 2:
        single = cleaned
        if _RESPONSE_HEADER_RE.match(single):
            single = _RESPONSE_HEADER_RE.sub("", single, count=1).strip()
        single = _cut_at_output_meta(single)
        return "" if _looks_like_cot_block(single) else single

    if not any(_looks_like_cot_block(p) for p in parts):
        # Strip a lone Response: header / trailing output-meta if present.
        if looks_like_response_echo_loop(cleaned):
            return extract_first_user_answer(cleaned)
        if _RESPONSE_HEADER_RE.match(cleaned) or _OUTPUT_META_LINE_RE.search(cleaned):
            recovered = extract_first_user_answer(cleaned)
            if recovered:
                return recovered
        return cleaned

    answer: list[str] = []
    for part in reversed(parts):
        if _looks_like_cot_block(part) and answer:
            break
        if _looks_like_cot_block(part) and not answer:
            continue
        answer.append(part)
    if answer:
        joined = "\n\n".join(reversed(answer)).strip()
        return _cut_at_output_meta(_RESPONSE_HEADER_RE.sub("", joined, count=1).strip())
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
    "this is sufficient",
    "i will output the response",
    "one last check",
    "one detail:",
    "response:",
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
    """Incremental filter: hide think-tags and planning dumps while streaming.

    Important for Qwen-style models that leak English CoT into ``content`` before
    the real answer: suppress the opener, then **resume** when a user-facing
    answer appears. Never permanently mute the whole turn.
    """

    def __init__(self) -> None:
        self._raw = ""
        self._visible = ""
        self._pending = ""
        self._hold = ""
        self._cot_buf = ""
        self._in_think = False
        self._suppress_cot = False
        self._started = False
        self._has_user_answer = False
        self.thinking = False
        self.loop_detected = False

    def feed(self, chunk: str) -> str:
        """Ingest a content delta; return newly visible text (may be empty)."""
        if not chunk:
            return ""
        # Keep accumulating raw even after loop detection so finalize can recover.
        self._raw += chunk
        if self.loop_detected:
            return ""
        if len(self._raw) > 200 and (
            looks_like_idle_plan_dump(self._raw)
            or looks_like_response_echo_loop(self._raw)
            or (
                is_repetition_loop(self._raw)
                and (
                    not self._visible.strip()
                    or _cjk_count(self._visible) >= 12
                    or looks_like_response_echo_loop(self._visible)
                )
            )
        ):
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
            if (
                looks_like_idle_plan_dump(self._visible)
                or looks_like_response_echo_loop(self._visible)
                or looks_like_response_echo_loop(self._raw)
                or (len(self._visible) > 280 and is_repetition_loop(self._visible))
            ):
                self.loop_detected = True
                self.thinking = True
                recovered = extract_first_user_answer(
                    self._raw
                ) or extract_first_user_answer(self._visible)
                if recovered:
                    self._visible = recovered
                return ""
        return visible_piece

    def _release_answer_from_cot_buf(self) -> str:
        """If suppressed buffer contains a real answer after CoT, resume streaming it.

        Only release when we see substantial CJK (or a clearly non-planning block
        that sanitize would keep). English mid-CoT sentences must stay suppressed.
        """
        buf = self._cot_buf
        if not buf.strip():
            return ""
        parts = [p.strip() for p in re.split(r"\n{2,}", buf) if p.strip()]
        if len(parts) >= 2:
            for idx, part in enumerate(parts):
                if _looks_like_cot_block(part):
                    continue
                # Require CJK so English planner sentences don't escape.
                if _cjk_count(part) < 8:
                    continue
                if looks_like_zh_planning_narration(part):
                    continue
                released_parts: list[str] = []
                for block in parts[idx:]:
                    low = block.strip().lower()
                    if (
                        low.startswith("response:")
                        or _OUTPUT_META_LINE_RE.match(block.strip())
                        or _looks_like_cot_block(block)
                    ):
                        break
                    if (
                        "i will output the response" in low
                        or "this is sufficient" in low
                        or "one last check" in low
                        or "one detail:" in low
                    ):
                        cut = _cut_at_output_meta(block)
                        if cut.strip():
                            released_parts.append(cut)
                        break
                    released_parts.append(block)
                released = "\n\n".join(released_parts).strip()
                if not released:
                    continue
                # Keep suppressing — models often echo Response: after the answer.
                self._suppress_cot = True
                self.thinking = True
                self._has_user_answer = True
                self._cot_buf = ""
                return released
        # Single block / incomplete: substantial CJK that isn't planning narration.
        if (
            _cjk_count(buf) >= 20
            and not looks_like_zh_planning_narration(buf)
            and not _is_english_planning_dump(buf)
        ):
            low_buf = buf.lower()
            # Don't lock mid-sentence — wait for paragraph break or output-meta.
            if not (
                "\n\n" in buf
                or "i will output the response" in low_buf
                or "this is sufficient" in low_buf
                or "one last check" in low_buf
                or looks_like_response_echo_loop(buf)
            ):
                return ""
            # Strip leading English CoT lines if present.
            lines = buf.splitlines()
            start = 0
            for i, line in enumerate(lines):
                low = line.strip().lower()
                if not low:
                    start = i + 1
                    continue
                if any(low.startswith(o) for o in _COT_OPENERS) or _looks_like_cot_block(
                    line
                ):
                    start = i + 1
                    continue
                if _cjk_count(line) > 0:
                    start = i
                    break
            tail = _cut_at_output_meta("\n".join(lines[start:]).strip())
            if _cjk_count(tail) >= 12:
                self._suppress_cot = True
                self.thinking = True
                self._has_user_answer = True
                self._cot_buf = ""
                return tail
        return ""

    def _emit_plain(self, piece: str) -> str:
        if not piece:
            return ""
        if self.loop_detected:
            self.thinking = True
            return ""

        if self._suppress_cot:
            self.thinking = True
            self._cot_buf += piece
            # Already delivered a user answer — swallow echo / second Response:.
            if self._has_user_answer:
                if looks_like_response_echo_loop(self._raw) or is_repetition_loop(
                    self._raw
                ):
                    self.loop_detected = True
                return ""
            released = self._release_answer_from_cot_buf()
            return self._scrub_loops(released) if released else ""

        # After a real answer started, hide "Response:" / "I will output…" echoes.
        if (
            self._has_user_answer
            or _cjk_count(self._visible) >= 8
            or _cjk_count(self._hold) >= 8
        ):
            low = piece.lstrip().lower()
            if (
                low.startswith("response:")
                or "i will output the response" in low
                or low.startswith("this is sufficient")
                or low.startswith("one last check")
                or low.startswith("one detail")
            ):
                self._suppress_cot = True
                self.thinking = True
                self._cot_buf += piece
                self.loop_detected = True
                return ""

        scrubbed = self._scrub_answer_meta(piece)
        if scrubbed != piece:
            # Trailing meta stripped; keep answer text only and lock further CoT.
            if scrubbed.strip():
                piece = scrubbed
                self._has_user_answer = True
                self._suppress_cot = True
                self.loop_detected = True
            else:
                self._suppress_cot = True
                self.thinking = True
                self._cot_buf += piece
                self.loop_detected = True
                return ""

        if not self._started:
            self._hold += piece
            hold_low = self._hold.lstrip().lower()
            hold_zh = self._hold.lstrip()
            for opener in _COT_OPENERS:
                if hold_low.startswith(opener):
                    self._suppress_cot = True
                    self.thinking = True
                    self._cot_buf = self._hold
                    self._hold = ""
                    self._started = True
                    released = self._release_answer_from_cot_buf()
                    return self._scrub_loops(released) if released else ""
            for opener in _ZH_STREAM_OPENERS:
                if hold_zh.startswith(opener):
                    self._suppress_cot = True
                    self.thinking = True
                    self._cot_buf = self._hold
                    self._hold = ""
                    self._started = True
                    released = self._release_answer_from_cot_buf()
                    return self._scrub_loops(released) if released else ""
            if _could_become_cot_opener(self._hold):
                self.thinking = True
                return ""
            released = self._hold
            self._hold = ""
            self._started = True
            self.thinking = False
            if _cjk_count(released) >= 8:
                self._has_user_answer = True
            return self._scrub_loops(released)

        if _cjk_count(piece) >= 8:
            self._has_user_answer = True
        return self._scrub_loops(piece)

    @staticmethod
    def _scrub_answer_meta(piece: str) -> str:
        """If a chunk mixes a CJK answer with English output-meta, keep the answer."""
        if not piece:
            return piece
        if _cjk_count(piece) < 8:
            return piece
        low = piece.lower()
        if not (
            "i will output the response" in low
            or "this is sufficient" in low
            or "\nresponse:" in low
            or low.lstrip().startswith("response:")
            or "one last check" in low
            or "one detail:" in low
        ):
            return piece
        return _cut_at_output_meta(_RESPONSE_HEADER_RE.sub("", piece, count=1))

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

    @property
    def visible(self) -> str:
        return self._visible

    def finalize(self) -> str:
        """Return user-facing content — recover answers even after CoT suppress."""
        if self._pending and not self._in_think:
            if self._suppress_cot:
                self._cot_buf += self._pending
            elif not self._started:
                self._hold += self._pending
            else:
                self._visible += self._pending
        self._pending = ""
        if self._suppress_cot and self._cot_buf:
            released = self._release_answer_from_cot_buf()
            if released:
                self._visible += released
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

        cleaned = sanitize_assistant_content(self._raw)
        if cleaned:
            return cleaned
        if self.loop_detected:
            recovered = extract_first_user_answer(self._raw) or extract_first_user_answer(
                self._visible
            )
            if recovered:
                return recovered
        # Prefer already-streamed visible text over empty (avoids blinking cursor
        # when a false loop flag wiped sanitize but UI already showed an answer).
        if self._visible.strip():
            return self._visible.strip()
        return ""
