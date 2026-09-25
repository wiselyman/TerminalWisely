"""External / builtin agent runtime adapters."""

from __future__ import annotations

from typing import Any, Literal, Protocol

RuntimeKind = Literal["builtin", "cursor", "codex"]

SUPPORTED_RUNTIMES: frozenset[str] = frozenset({"builtin", "cursor", "codex"})


class RuntimeProbe(dict[str, Any]):
    """installed / authenticated / detail — plain dict for JSON."""


class AgentRuntime(Protocol):
    kind: RuntimeKind

    async def start(self, run: Any, user_message: Any) -> None:
        """Drive the run to completion (or until cancel)."""

    def cancel(self, run: Any) -> None:
        """Best-effort cancel of an in-flight external/builtin run."""

    def probe(self) -> dict[str, Any]:
        """Return {installed, authenticated, detail}."""


def normalize_runtime(value: str | None) -> RuntimeKind:
    raw = (value or "builtin").strip().lower() or "builtin"
    if raw not in SUPPORTED_RUNTIMES:
        raise ValueError(f"unsupported runtime: {raw}")
    return raw  # type: ignore[return-value]


def runtime_available(kind: RuntimeKind) -> bool:
    """Task 1: only builtin is wired. Cursor/Codex land in later tasks."""
    return kind == "builtin"
