"""Append-only session event log + surface projection (DeepSeek-inspired).

Model-visible history is derived from the surface. Raw events stay for replay.
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from typing import Any, Literal

SurfaceOpKind = Literal["append", "replace", "none"]


@dataclass(frozen=True)
class SurfaceOp:
    kind: SurfaceOpKind = "append"
    start: int | None = None  # surface index inclusive (replace)
    end: int | None = None  # surface index inclusive (replace)

    @staticmethod
    def append() -> SurfaceOp:
        return SurfaceOp(kind="append")

    @staticmethod
    def none() -> SurfaceOp:
        return SurfaceOp(kind="none")

    @staticmethod
    def replace(start: int, end: int) -> SurfaceOp:
        return SurfaceOp(kind="replace", start=start, end=end)

    def to_dict(self) -> Any:
        if self.kind == "none":
            return None
        if self.kind == "append":
            return "append"
        return {"op": "replace", "start": self.start, "end": self.end}

    @staticmethod
    def from_raw(raw: Any) -> SurfaceOp:
        if raw is None:
            return SurfaceOp.none()
        if raw == "append":
            return SurfaceOp.append()
        if isinstance(raw, dict) and raw.get("op") == "replace":
            return SurfaceOp.replace(int(raw["start"]), int(raw["end"]))
        return SurfaceOp.none()


@dataclass
class SessionEvent:
    seq: int
    type: str
    data: dict[str, Any]
    surface_op: SurfaceOp = field(default_factory=SurfaceOp.none)
    ts: float = field(default_factory=time.time)

    def to_jsonl(self) -> dict[str, Any]:
        op = self.surface_op.to_dict()
        row: dict[str, Any] = {
            "seq": self.seq,
            "type": self.type,
            "data": self.data,
            "ts": self.ts,
        }
        if op is not None:
            row["surface_op"] = op
        return row

    @staticmethod
    def from_jsonl(row: dict[str, Any]) -> SessionEvent:
        return SessionEvent(
            seq=int(row["seq"]),
            type=str(row["type"]),
            data=dict(row.get("data") or {}),
            surface_op=SurfaceOp.from_raw(row.get("surface_op")),
            ts=float(row.get("ts") or time.time()),
        )


# Event types that may carry surface ops (model-visible).
_SURFACE_TYPES = frozenset(
    {
        "system/message",
        "user/message",
        "assistant/message",
        "tool/result",
    }
)


def _redact_multimodal_content(content: Any) -> Any:
    """Strip base64 image payloads before disk persistence."""
    if not isinstance(content, list):
        return content
    out: list[Any] = []
    for part in content:
        if not isinstance(part, dict):
            out.append(part)
            continue
        if part.get("type") == "image_url":
            media = "image/png"
            url = ""
            img = part.get("image_url")
            if isinstance(img, dict):
                url = str(img.get("url") or "")
            if url.startswith("data:") and ";base64," in url:
                media = url[5:].split(";", 1)[0] or media
            out.append(
                {
                    "type": "image_url",
                    "image_url": {"url": f"data:{media};base64,[omitted]"},
                }
            )
        else:
            out.append(part)
    return out


def _redact_event_row(row: dict[str, Any]) -> dict[str, Any]:
    data = row.get("data")
    if not isinstance(data, dict):
        return row
    content = data.get("content")
    if not isinstance(content, list):
        return row
    redacted = dict(row)
    redacted["data"] = {**data, "content": _redact_multimodal_content(content)}
    return redacted


def _openai_from_surface_event(ev: SessionEvent) -> dict[str, Any] | None:
    d = ev.data
    if ev.type == "system/message":
        return {"role": "system", "content": str(d.get("content") or "")}
    if ev.type == "user/message":
        content = d.get("content")
        # Preserve multimodal parts (list) for vision turns; str for legacy.
        if isinstance(content, list):
            return {"role": "user", "content": content}
        return {"role": "user", "content": str(content or "")}
    if ev.type == "assistant/message":
        msg: dict[str, Any] = {
            "role": "assistant",
            "content": d.get("content"),
        }
        tcs = d.get("tool_calls")
        if tcs:
            msg["tool_calls"] = tcs
        return msg
    if ev.type == "tool/result":
        return {
            "role": "tool",
            "tool_call_id": str(d.get("tool_call_id") or ""),
            "content": str(d.get("content") or ""),
        }
    return None


@dataclass
class SessionLog:
    """Append-only log; derive_messages() projects the surface."""

    events: list[SessionEvent] = field(default_factory=list)
    _surface_seqs: list[int] = field(default_factory=list, repr=False)
    _message_cache: list[dict[str, Any]] | None = field(default=None, repr=False)
    _replace_generation: int = 0

    def __len__(self) -> int:
        return len(self.events)

    def append(
        self,
        type_: str,
        data: dict[str, Any] | None = None,
        *,
        surface_op: SurfaceOp | None = None,
    ) -> SessionEvent:
        if surface_op is None:
            if type_ in _SURFACE_TYPES:
                surface_op = SurfaceOp.append()
            else:
                surface_op = SurfaceOp.none()

        seq = len(self.events)
        ev = SessionEvent(seq=seq, type=type_, data=dict(data or {}), surface_op=surface_op)
        self.events.append(ev)

        if surface_op.kind == "append":
            self._surface_seqs.append(seq)
            self._message_cache = None
        elif surface_op.kind == "replace":
            start = surface_op.start
            end = surface_op.end
            if start is None or end is None:
                raise ValueError("replace surface_op requires start/end")
            if not (0 <= start <= end < len(self._surface_seqs)):
                raise ValueError(
                    f"replace range out of bounds: {start}..{end} "
                    f"(surface_len={len(self._surface_seqs)})"
                )
            # Shadow [start, end] with this new surface node (seq).
            self._surface_seqs = (
                self._surface_seqs[:start] + [seq] + self._surface_seqs[end + 1 :]
            )
            self._replace_generation += 1
            self._message_cache = None
        else:
            # log-only
            pass
        return ev

    def derive_messages(self) -> list[dict[str, Any]]:
        if self._message_cache is not None:
            return [dict(m) for m in self._message_cache]
        out: list[dict[str, Any]] = []
        for seq in self._surface_seqs:
            ev = self.events[seq]
            msg = self.derive_event_message(ev)
            if msg is not None:
                out.append(msg)
        self._message_cache = [dict(m) for m in out]
        return [dict(m) for m in out]

    def surface_len(self) -> int:
        return len(self._surface_seqs)

    def surface_event_at(self, index: int) -> SessionEvent:
        return self.events[self._surface_seqs[index]]

    @staticmethod
    def derive_event_message(ev: SessionEvent) -> dict[str, Any] | None:
        return _openai_from_surface_event(ev)

    def compaction_busy(self) -> bool:
        """True when a compaction/start lacks matching compaction/end."""
        open_id: str | None = None
        for ev in self.events:
            if ev.type == "compaction/start":
                open_id = str(ev.data.get("compaction_id") or "open")
            elif ev.type == "compaction/end":
                open_id = None
        return open_id is not None

    # --- OpenAI-shape helpers (loop / main compatibility) ---

    def append_system(self, content: str) -> SessionEvent:
        return self.append("system/message", {"content": content})

    def append_user(self, content: str | list[dict[str, Any]]) -> SessionEvent:
        return self.append("user/message", {"content": content})

    def append_assistant(
        self, content: str | None, tool_calls: list[dict[str, Any]] | None = None
    ) -> SessionEvent:
        data: dict[str, Any] = {"content": content}
        if tool_calls:
            data["tool_calls"] = tool_calls
        return self.append("assistant/message", data)

    def append_tool_result(self, tool_call_id: str, content: str) -> SessionEvent:
        return self.append(
            "tool/result",
            {"tool_call_id": tool_call_id, "content": content},
        )

    def append_tool_call_log(
        self, call_id: str, name: str, arguments: dict[str, Any]
    ) -> SessionEvent:
        """Log-only tool/call (pairing); result lands on surface."""
        return self.append(
            "tool/call",
            {"call_id": call_id, "name": name, "arguments": arguments},
            surface_op=SurfaceOp.none(),
        )

    def insert_system_at_front(self, content: str) -> None:
        """Rare repair: prepend system when missing (rebuild surface)."""
        # Rebuild by inserting a new system event and fixing surface order.
        # Simpler path used by loop: if empty, append; if first isn't system, insert.
        msgs = self.derive_messages()
        if msgs and msgs[0].get("role") == "system":
            return
        # Full rebuild from current surface + new system at front.
        old_surface = list(self._surface_seqs)
        sys_ev = SessionEvent(
            seq=len(self.events),
            type="system/message",
            data={"content": content},
            surface_op=SurfaceOp.append(),
        )
        self.events.append(sys_ev)
        self._surface_seqs = [sys_ev.seq] + old_surface
        self._message_cache = None
        self._replace_generation += 1

    def replace_surface_messages(self, messages: list[dict[str, Any]]) -> None:
        """Rebuild surface from an OpenAI message list (repair path).

        Appends a log-only marker then new surface nodes via replace of entire range,
        or clear+append if empty.
        """
        self.append(
            "session/repair",
            {"reason": "replace_surface_messages", "count": len(messages)},
            surface_op=SurfaceOp.none(),
        )
        # Clear surface by replacing all nodes if any, else just append.
        new_seqs: list[int] = []
        for msg in messages:
            role = msg.get("role")
            if role == "system":
                ev = self.append(
                    "system/message",
                    {"content": str(msg.get("content") or "")},
                    surface_op=SurfaceOp.none(),  # manually manage surface
                )
            elif role == "user":
                raw = msg.get("content")
                if isinstance(raw, list):
                    ev = self.append(
                        "user/message",
                        {"content": raw},
                        surface_op=SurfaceOp.none(),
                    )
                else:
                    ev = self.append(
                        "user/message",
                        {"content": str(raw or "")},
                        surface_op=SurfaceOp.none(),
                    )
            elif role == "assistant":
                data: dict[str, Any] = {"content": msg.get("content")}
                if msg.get("tool_calls"):
                    data["tool_calls"] = msg["tool_calls"]
                ev = self.append("assistant/message", data, surface_op=SurfaceOp.none())
            elif role == "tool":
                ev = self.append(
                    "tool/result",
                    {
                        "tool_call_id": str(msg.get("tool_call_id") or ""),
                        "content": str(msg.get("content") or ""),
                    },
                    surface_op=SurfaceOp.none(),
                )
            else:
                continue
            # Mark as surface append in bookkeeping without using append's surface_op
            # (we passed none). Manually track:
            new_seqs.append(ev.seq)
            # Fix the event's surface_op for persistence fidelity
            self.events[ev.seq] = SessionEvent(
                seq=ev.seq,
                type=ev.type,
                data=ev.data,
                surface_op=SurfaceOp.append(),
                ts=ev.ts,
            )
        self._surface_seqs = new_seqs
        self._message_cache = None
        self._replace_generation += 1

    def seed_from_openai_messages(self, messages: list[dict[str, Any]]) -> None:
        """Load history into an empty log (FE seed / hydrate)."""
        if self.events:
            raise RuntimeError("seed_from_openai_messages requires empty log")
        for msg in messages:
            role = msg.get("role")
            if role == "system":
                self.append_system(str(msg.get("content") or ""))
            elif role == "user":
                raw = msg.get("content")
                if isinstance(raw, list):
                    self.append_user(raw)
                else:
                    self.append_user(str(raw or ""))
            elif role == "assistant":
                self.append_assistant(
                    msg.get("content") if isinstance(msg.get("content"), str) else msg.get("content"),
                    list(msg["tool_calls"]) if msg.get("tool_calls") else None,
                )
            elif role == "tool":
                self.append_tool_result(
                    str(msg.get("tool_call_id") or ""),
                    str(msg.get("content") or ""),
                )

    def dump_jsonl_rows(self) -> list[dict[str, Any]]:
        return [_redact_event_row(ev.to_jsonl()) for ev in self.events]

    @staticmethod
    def load_jsonl_rows(rows: list[dict[str, Any]]) -> SessionLog:
        log = SessionLog()
        for row in rows:
            ev = SessionEvent.from_jsonl(row)
            # Replay surface fold deterministically
            if ev.seq != len(log.events):
                # tolerate gaps by padding? prefer strict
                raise ValueError(f"non-contiguous seq: expected {len(log.events)}, got {ev.seq}")
            log.events.append(ev)
            op = ev.surface_op
            if op.kind == "append":
                log._surface_seqs.append(ev.seq)
            elif op.kind == "replace":
                start, end = op.start, op.end
                assert start is not None and end is not None
                log._surface_seqs = (
                    log._surface_seqs[:start] + [ev.seq] + log._surface_seqs[end + 1 :]
                )
                log._replace_generation += 1
        log._message_cache = None
        return log

    def to_jsonl_text(self) -> str:
        return "\n".join(json.dumps(r, ensure_ascii=False) for r in self.dump_jsonl_rows()) + (
            "\n" if self.events else ""
        )

    @staticmethod
    def from_jsonl_text(text: str) -> SessionLog:
        rows: list[dict[str, Any]] = []
        for line in text.splitlines():
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
        return SessionLog.load_jsonl_rows(rows)
