"""Strip model thinking / CoT from assistant-visible content."""

from __future__ import annotations

import re

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

_NUMBERED_PLAN_RE = re.compile(r"^\d+\.\s+\*\*[^*]+\*\*", re.MULTILINE)
_CJK_RE = re.compile(r"[\u4e00-\u9fff]")


def _cjk_count(text: str) -> int:
    return len(_CJK_RE.findall(text or ""))


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
    # Repeated self-debate loops ("Actually… Wait… Actually…").
    if low.count("actually,") >= 2 and low.count("let me try") >= 1:
        return True
    if _NUMBERED_PLAN_RE.search(raw) and ("identify the goal" in low or "the user" in low):
        return True
    # Pathological loops like thousands of "Let's execute." paragraphs.
    if raw.count("\n\n") > 40 and ("let's execute" in low or "let's proceed" in low):
        return True
    return False


def sanitize_assistant_content(text: str | None) -> str:
    """Return user-facing answer only — drop think tags and leaked CoT dumps."""
    raw = text if isinstance(text, str) else ""
    cleaned = _THINK_TAG_RE.sub("", raw).strip()
    if not cleaned:
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
    # Entire message was planning / CoT — do not show it as the reply.
    return ""


_TAG_NAME_RE = re.compile(
    r"^</?(?:think|thinking|reasoning|reflection|redacted_thinking)\b[^>]*>",
    re.IGNORECASE,
)

# Full CoT openers we must never partially leak ("The" from "The user wants…").
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


def _could_become_cot_opener(text: str) -> bool:
    """True while `text` is still a prefix of (or starts) a known CoT opener."""
    low = (text or "").lstrip().lower()
    if not low:
        return True
    for opener in _COT_OPENERS:
        if opener.startswith(low) or low.startswith(opener):
            return True
    return False


class StreamContentFilter:
    """Incremental filter: hide think-tags and English planning dumps while streaming."""

    def __init__(self) -> None:
        self._raw = ""
        self._visible = ""
        self._pending = ""  # incomplete tag prefix
        self._hold = ""  # ambiguous start (e.g. "The") until CoT decision
        self._in_think = False
        self._suppress_cot = False
        self._started = False  # True once we leave the hold/suppress gate
        self.thinking = False  # True while inside think tags or cot suppress

    def feed(self, chunk: str) -> str:
        """Ingest a content delta; return newly visible text (may be empty)."""
        if not chunk:
            return ""
        self._raw += chunk
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
        return visible_piece

    def _emit_plain(self, piece: str) -> str:
        if not piece:
            return ""
        if self._suppress_cot:
            self.thinking = True
            return ""

        if not self._started:
            self._hold += piece
            hold_low = self._hold.lstrip().lower()
            # Decide CoT as soon as an opener fully matches.
            for opener in _COT_OPENERS:
                if hold_low.startswith(opener):
                    self._suppress_cot = True
                    self.thinking = True
                    self._hold = ""
                    self._started = True
                    return ""
            # Still could be "The" → "The user wants…" — keep holding.
            if _could_become_cot_opener(self._hold):
                self.thinking = True
                return ""
            # Not a CoT opener — release held text as visible answer.
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
        if self._pending and not self._in_think and not self._suppress_cot:
            if not self._started:
                self._hold += self._pending
            else:
                self._visible += self._pending
        self._pending = ""
        if self._hold and not self._suppress_cot:
            if not _could_become_cot_opener(self._hold) or not any(
                self._hold.lstrip().lower().startswith(o) or o.startswith(self._hold.lstrip().lower())
                for o in _COT_OPENERS
            ):
                self._visible += self._hold
            self._hold = ""
        return sanitize_assistant_content(self._raw)
