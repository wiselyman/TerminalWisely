"""Codex agent runtime — full agent on local plane; remote via TW MCP."""

from __future__ import annotations

import logging
import os
from typing import Any

from app.agent.loop import AgentLoop
from app.runtime import RuntimeKind
from app.runtime.fakes import FakeCodexDriver, FakeResearch
from app.runtime.tw_mcp import TwMcpServer
from app.runtime.workspace import agent_workspace_dir
from app.session.attachments import content_as_plain_text
from app.state import RunStatus

logger = logging.getLogger("agent-sidecar.codex_runtime")

_REMOTE_PLANE_ADDENDUM = (
    "[TerminalWisely remote plane] The connected SSH/K8s host is reached only "
    "through TerminalWisely MCP tools (terminal_exec, web_search, web_fetch, "
    "ask_user, k8s_*). Do not open a new SSH login to that host."
)


def codex_sdk_importable() -> bool:
    """Optional Codex / OpenAI Agents SDK — gated so CI stays fake-only."""
    try:
        import agents  # noqa: F401  # openai-agents style

        return True
    except ImportError:
        try:
            import codex  # noqa: F401

            return True
        except ImportError:
            return False


def use_fake_codex() -> bool:
    flag = (os.environ.get("TW_AI_CODEX_FAKE") or "").strip().lower()
    if flag in {"1", "true", "yes"}:
        return True
    if flag in {"0", "false", "no"}:
        return False
    # Default: fake when no auth / no SDK (CI + local without Codex).
    has_auth = bool(
        (os.environ.get("CODEX_API_KEY") or os.environ.get("OPENAI_API_KEY") or "").strip()
    )
    if not has_auth:
        return True
    return not codex_sdk_importable()


class _SilentModel:
    """Tool-host only — Codex driver owns model samples."""

    async def chat_completions(self, messages, tools=None, **kwargs):  # type: ignore[no-untyped-def]
        return {
            "choices": [
                {
                    "message": {
                        "role": "assistant",
                        "content": "",
                        "tool_calls": [],
                    }
                }
            ]
        }

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return completion["choices"][0]["message"]


class CodexRuntime:
    kind: RuntimeKind = "codex"

    def __init__(self, *, driver: Any | None = None) -> None:
        self._driver = driver
        self._active_driver: Any | None = None

    def probe(self) -> dict[str, Any]:
        fake = use_fake_codex()
        has_auth = bool(
            (os.environ.get("CODEX_API_KEY") or os.environ.get("OPENAI_API_KEY") or "").strip()
        )
        return {
            "installed": fake or codex_sdk_importable(),
            "authenticated": fake or has_auth,
            "detail": "fake" if fake else ("sdk" if codex_sdk_importable() else "missing"),
            "fake": fake,
        }

    def cancel(self, run: Any) -> None:
        d = self._active_driver
        if d is not None and hasattr(d, "cancel"):
            d.cancel()
        run.cancel_requested = True

    async def start(self, run: Any, user_message: Any) -> None:
        run.metadata["runtime"] = "codex"
        cwd = agent_workspace_dir(run)
        run.metadata["agent_workspace"] = str(cwd)
        run.append_event(
            "status",
            {"phase": "thinking", "runtime": "codex", "cwd": str(cwd)},
        )
        run.status = RunStatus.RUNNING

        research = FakeResearch() if use_fake_codex() else None
        tool_loop = AgentLoop(
            run,
            model=_SilentModel(),
            **({"research": research} if research is not None else {}),
        )
        mcp = TwMcpServer(tool_loop)

        driver = self._driver
        if driver is None:
            if use_fake_codex():
                driver = FakeCodexDriver()
            else:
                run.status = RunStatus.FAILED
                run.append_event(
                    "error",
                    {
                        "message": (
                            "Codex SDK path not wired yet; set TW_AI_CODEX_FAKE=1 "
                            "or wait for SDK integration"
                        )
                    },
                )
                return

        self._active_driver = driver
        plain = content_as_plain_text(user_message)
        if not plain.strip():
            plain = str(user_message or "")
        prompt = f"{_REMOTE_PLANE_ADDENDUM}\n\n{plain}"

        async def call_mcp(name: str, args: dict[str, Any]) -> dict[str, Any]:
            return await mcp.call_tool(name, args)

        assistant_buf = ""
        try:
            async for ev in driver.run(prompt, call_mcp=call_mcp):
                if run.cancel_requested:
                    run.status = RunStatus.CANCELLED
                    run.append_event("cancelled", {"reason": "user_stop"})
                    return
                et = ev.get("type")
                if et == "assistant_delta":
                    text = str(ev.get("text") or "")
                    assistant_buf += text
                    run.append_event("assistant_delta", {"text": text})
                elif et == "assistant_message":
                    text = str(ev.get("text") or "")
                    assistant_buf += text
                    run.append_message({"role": "assistant", "content": text})
                    run.append_event("assistant_message", {"content": text})
                elif et == "external_tool_activity":
                    run.append_event(
                        "external_tool_activity",
                        {
                            "name": ev.get("name"),
                            "detail": ev.get("detail"),
                            "ok": ev.get("ok"),
                            "runtime": "codex",
                        },
                    )
                elif et == "cancelled":
                    run.status = RunStatus.CANCELLED
                    run.append_event("cancelled", {"reason": "driver"})
                    return
                elif et == "done":
                    break
        except Exception as exc:  # noqa: BLE001
            logger.exception("CodexRuntime failed")
            run.status = RunStatus.FAILED
            run.append_event("error", {"message": str(exc)})
            return
        finally:
            self._active_driver = None

        if run.status == RunStatus.RUNNING:
            if assistant_buf and not any(
                m.get("role") == "assistant" for m in run.messages
            ):
                run.append_message({"role": "assistant", "content": assistant_buf})
            run.status = RunStatus.COMPLETED
            run.append_event("status", {"status": "completed", "runtime": "codex"})


def probe_codex() -> dict[str, Any]:
    return CodexRuntime().probe()
