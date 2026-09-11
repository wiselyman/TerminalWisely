"""Staged tool pipeline: pre → around → body → post (DeepSeek-style, no Cordis).

PolicyEngine / CommandBroker remain the authority for mutations. Hooks may only
deny early, wrap execution (timeout), or inject advisory context — never bypass
PolicyEngine or PrivilegeLease.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable, Protocol


@dataclass
class ToolExec:
    call_id: str
    name: str
    arguments: dict[str, Any]
    meta: dict[str, Any] = field(default_factory=dict)


@dataclass
class PreToolDecision:
    """Result of a pre-execute hook."""

    action: str = "allow"  # allow | deny
    result: dict[str, Any] | None = None  # when deny: payload for tool_result


@dataclass
class PostToolDecision:
    """Result of a post-execute hook (advisory only by default)."""

    additional_contexts: list[str] = field(default_factory=list)


class ToolPreHook(Protocol):
    async def pre(self, tool: ToolExec) -> PreToolDecision: ...


class ToolAroundHook(Protocol):
    async def around(
        self, tool: ToolExec, call: Callable[[], Awaitable[Any]]
    ) -> Any: ...


class ToolPostHook(Protocol):
    async def post(self, tool: ToolExec, result: Any) -> PostToolDecision: ...


BodyFn = Callable[[], Awaitable[Any]]


class ToolPipeline:
    """Ordered hook lists around a tool body."""

    def __init__(
        self,
        *,
        pre_hooks: list[ToolPreHook] | None = None,
        around_hooks: list[ToolAroundHook] | None = None,
        post_hooks: list[ToolPostHook] | None = None,
    ) -> None:
        self.pre_hooks: list[ToolPreHook] = list(pre_hooks or [])
        self.around_hooks: list[ToolAroundHook] = list(around_hooks or [])
        self.post_hooks: list[ToolPostHook] = list(post_hooks or [])

    def add_pre(self, hook: ToolPreHook) -> None:
        self.pre_hooks.append(hook)

    def add_around(self, hook: ToolAroundHook) -> None:
        self.around_hooks.append(hook)

    def add_post(self, hook: ToolPostHook) -> None:
        self.post_hooks.append(hook)

    async def run(self, tool: ToolExec, body: BodyFn) -> Any:
        for hook in self.pre_hooks:
            decision = await hook.pre(tool)
            if decision.action == "deny":
                return decision.result

        call: BodyFn = body
        for hook in reversed(self.around_hooks):
            inner = call
            hook_ref = hook

            async def wrapped(
                _h: ToolAroundHook = hook_ref, _inner: BodyFn = inner
            ) -> Any:
                return await _h.around(tool, _inner)

            call = wrapped

        result = await call()

        contexts: list[str] = []
        for hook in self.post_hooks:
            post = await hook.post(tool, result)
            if post.additional_contexts:
                contexts.extend(post.additional_contexts)
        if contexts:
            existing = list(tool.meta.get("additional_contexts") or [])
            existing.extend(contexts)
            tool.meta["additional_contexts"] = existing
        return result
