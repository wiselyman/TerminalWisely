"""Light AgentLoop streaming event test with mock model."""

from __future__ import annotations

import asyncio
from typing import Any, AsyncIterator

import pytest

from app.agent.loop import AgentLoop
from app.llm.gateway import ModelGateway
from app.state import AgentRun, RunStatus


class _StreamModel:
    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
    ) -> AsyncIterator[dict[str, Any]]:
        yield {"type": "content", "text": "主机"}
        yield {"type": "content", "text": "正常"}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_loop_emits_assistant_delta_then_message() -> None:
    run = AgentRun(session_id="s1", run_id="r1")
    loop = AgentLoop(run, model=_StreamModel(), max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="状态？")
    types = [e.type for e in run.events]
    assert "assistant_delta" in types
    assert "assistant_message" in types
    assert run.status == RunStatus.COMPLETED
    deltas = "".join(
        str(e.payload.get("text") or "")
        for e in run.events
        if e.type == "assistant_delta"
    )
    assert "主机" in deltas
    final = next(e for e in run.events if e.type == "assistant_message")
    assert "主机正常" in str(final.payload.get("content") or "")


class _ToolThenAnswerModel:
    """First turn: command dump + tool_calls; second: real answer."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
    ) -> Any:
        self.calls += 1
        dump = (
            "lscpu | grep -E \"Model name|Architecture|CPU(s)|Thread|Core|Socket\"\n"
            "free -h\n"
            "df -h /\n"
            "cat /etc/os-release | grep PRETTY_NAME\n"
        ) * 3
        if self.calls == 1:
            yield {"type": "content", "text": dump}
            yield {
                "type": "tool_call_delta",
                "index": 0,
                "id": "call_ps_1",
                "name": "terminal_exec",
                "arguments": '{"command":"ps aux --sort=-%mem | head -n 10"}',
            }
            yield {"type": "finished", "finish_reason": "tool_calls"}
            return
        yield {"type": "content", "text": "占用内存最多的是 gnome-shell。"}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_tool_turn_with_command_dump_does_not_abort() -> None:
    from app.agent.loop import deliver_tool_result
    from app.harness.verify import LOOP_ABORT_MESSAGE as MSG

    run = AgentRun(session_id="s2", run_id="r2")
    model = _ToolThenAnswerModel()
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=30)

    async def _feed() -> None:
        for _ in range(200):
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                break
            await asyncio.sleep(0.01)
        else:
            raise AssertionError("timed out waiting for WAITING_TOOL")
        assert run.pending_tool is not None
        deliver_tool_result(
            run,
            run.pending_tool.call_id,
            {
                "ok": True,
                "exit_code": 0,
                "stdout": "USER PID %MEM CMD\nwyf 1 12.0 gnome-shell\n",
                "stderr": "",
                "_untrusted": True,
            },
        )

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="现在哪个程序占用的内存最大")
    await feeder
    texts = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert MSG not in texts
    assert run.status == RunStatus.COMPLETED
    assert any("gnome-shell" in t for t in texts)


class _CotThenEmptyModel:
    """After tools exist, emit English CoT only (would wipe content) twice."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
    ) -> Any:
        self.calls += 1
        if self.calls == 1:
            yield {
                "type": "tool_call_delta",
                "index": 0,
                "id": "call_os_1",
                "name": "terminal_exec",
                "arguments": '{"command":"cat /etc/os-release"}',
            }
            yield {"type": "finished", "finish_reason": "tool_calls"}
            return
        # CoT-only turns — sanitize to empty; must NOT LOOP_ABORT when tools exist.
        yield {
            "type": "content",
            "text": (
                "Here's a thinking process:\n\n"
                "The user wants to know the OS. I should conclude from tools.\n\n"
                "1. **Identify the goal**: answer OS.\n"
                "2. **Plan**: narrate without answering."
            ),
        }
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_cot_empty_after_tools_does_not_loop_abort() -> None:
    from app.agent.loop import deliver_tool_result
    from app.harness.verify import LOOP_ABORT_MESSAGE as MSG

    run = AgentRun(session_id="s3", run_id="r3")
    model = _CotThenEmptyModel()
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=30)

    async def _feed() -> None:
        for _ in range(200):
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                break
            await asyncio.sleep(0.01)
        else:
            raise AssertionError("timed out waiting for WAITING_TOOL")
        assert run.pending_tool is not None
        deliver_tool_result(
            run,
            run.pending_tool.call_id,
            {
                "ok": True,
                "exit_code": 0,
                "stdout": "PRETTY_NAME=\"Debian GNU/Linux 12 (bookworm)\"\nID=debian\n",
                "stderr": "",
                "_untrusted": True,
            },
        )

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="这是什么操作系统")
    await feeder
    texts = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert MSG not in texts
    assert run.status == RunStatus.COMPLETED
    assert any(e.type == "act_nudge" for e in run.events)


class _IdlePlanThenToolModel:
    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
    ) -> Any:
        self.calls += 1
        if self.calls == 1:
            block = (
                "Wait, I'll just run the first command.\n\n"
                "Intent: 检查 Ollama 服务配置 (Read-only)\n"
                "Command: systemctl cat ollama && ls -l ~/lab/data\n\n"
            )
            yield {"type": "content", "text": "Let's do this step-by-step.\n\n" + block * 5}
            yield {"type": "finished", "finish_reason": "stop"}
            return
        if self.calls == 2:
            yield {
                "type": "tool_call_delta",
                "index": 0,
                "id": "call_inspect_1",
                "name": "terminal_exec",
                "arguments": '{"command":"systemctl cat ollama"}',
            }
            yield {"type": "finished", "finish_reason": "tool_calls"}
            return
        yield {"type": "content", "text": "服务用户是 ollama，接下来会迁移模型目录。"}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_idle_plan_dump_forces_tool_call() -> None:
    from app.agent.loop import deliver_tool_result
    from app.harness.verify import LOOP_ABORT_MESSAGE as MSG

    run = AgentRun(session_id="s4", run_id="r4")
    model = _IdlePlanThenToolModel()
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=30)

    async def _feed() -> None:
        for _ in range(200):
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                break
            await asyncio.sleep(0.01)
        else:
            raise AssertionError("timed out waiting for WAITING_TOOL")
        deliver_tool_result(
            run,
            run.pending_tool.call_id,
            {
                "ok": True,
                "exit_code": 0,
                "stdout": "# /lib/systemd/system/ollama.service\nUser=ollama\n",
                "stderr": "",
                "_untrusted": True,
            },
        )

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="做吧")
    await feeder
    texts = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert MSG not in texts
    assert any(
        e.type == "act_nudge" and e.payload.get("kind") == "idle_plan" for e in run.events
    )
    assert any(e.type == "tool_call" for e in run.events)


class _TruncatedThenContinueModel:
    """First turn cuts mid-clause; second finishes (no tools on continue)."""

    def __init__(self) -> None:
        self.calls = 0
        self.tool_choices: list[Any] = []

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
    ) -> Any:
        self.calls += 1
        self.tool_choices.append(tool_choice)
        if self.calls == 1:
            body = (
                "## 内部流程\n\n"
                + ("说明一段足够长的正文用来过长度门槛。\n" * 4)
                + "画轨迹对比图 -> 存到 /tmp/stand_alone_inference/traj_1.jpeg 、"
            )
            yield {"type": "content", "text": body}
            # Hard budget signal — structural alone must not auto-continue.
            yield {
                "type": "usage",
                "usage": {"prompt_tokens": 100, "completion_tokens": 32000},
            }
            yield {"type": "finished", "finish_reason": "length"}
            return
        yield {
            "type": "content",
            "text": "以及 traj_2.jpeg。评估完成。",
        }
        yield {"type": "finished", "finish_reason": "stop"}


@pytest.mark.asyncio
async def test_loop_auto_continues_truncated_answer() -> None:
    run = AgentRun(session_id="s1", run_id="r-trunc")
    model = _TruncatedThenContinueModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="解释内部流程")
    assert run.status == RunStatus.COMPLETED
    assert model.calls >= 2
    assert model.tool_choices[0] == "auto"
    assert model.tool_choices[1] == "none"
    assert any(
        e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        for e in run.events
    )
    finals = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert any("traj_1.jpeg" in t for t in finals)
    assert any("traj_2.jpeg" in t or "评估完成" in t for t in finals)
    # Sidecar must emit one authoritative joined answer — not a bare suffix.
    joined = [t for t in finals if "traj_1.jpeg" in t and "traj_2.jpeg" in t]
    assert joined, finals
    assert any("评估完成" in t for t in joined)


class _LengthFinishThenContinueModel:
    def __init__(self) -> None:
        self.calls = 0
        self.tool_choices: list[Any] = []

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
    ) -> Any:
        self.calls += 1
        self.tool_choices.append(tool_choice)
        if self.calls == 1:
            # Complete-looking prose, but provider says length + near-cap usage.
            yield {
                "type": "content",
                "text": "进度如下：主模型已齐，ple-table 还在下，大约还要一段时间。",
            }
            yield {
                "type": "usage",
                "usage": {"prompt_tokens": 100, "completion_tokens": 8000},
            }
            yield {"type": "finished", "finish_reason": "length"}
            return
        yield {"type": "content", "text": "更准确说大约 1.5–2 小时。"}
        yield {"type": "finished", "finish_reason": "stop"}


@pytest.mark.asyncio
async def test_loop_auto_continues_on_finish_length_signal() -> None:
    """A: budget/finish_reason drives continue even without structural cut."""
    run = AgentRun(session_id="s1", run_id="r-len")
    model = _LengthFinishThenContinueModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="还剩多少")
    assert run.status == RunStatus.COMPLETED
    assert model.calls >= 2
    assert any(
        e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        for e in run.events
    )
    finals = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert any("1.5" in t or "小时" in t for t in finals)
    assert any(e.type == "model_sample_end" for e in run.events)


class _UsageAfterFinishModel:
    """Usage arrives AFTER finished — loop must drain, not break early."""

    def __init__(self) -> None:
        self.calls = 0
        self.max_tokens_seen: list[int | None] = []

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        self.max_tokens_seen.append(max_tokens)
        if self.calls == 1:
            yield {
                "type": "content",
                "text": "进度如下：主模型齐了，表还在下，大约还要一段时间。",
            }
            yield {"type": "finished", "finish_reason": "stop"}
            # Late usage (OpenAI include_usage order) — near the requested sample cap.
            cap = int(max_tokens or 8192)
            yield {
                "type": "usage",
                "usage": {
                    "prompt_tokens": 50,
                    "completion_tokens": max(1, int(cap * 0.96)),
                },
            }
            return
        yield {"type": "content", "text": "补充：大约 1.5 小时。"}
        yield {"type": "finished", "finish_reason": "stop"}


@pytest.mark.asyncio
async def test_loop_drains_usage_after_finished_and_raises_budget() -> None:
    run = AgentRun(session_id="s1", run_id="r-drain")
    model = _UsageAfterFinishModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="还剩多少")
    assert run.status == RunStatus.COMPLETED
    assert model.calls >= 2
    ends = [e for e in run.events if e.type == "model_sample_end"]
    assert ends
    assert ends[0].payload.get("budget_hit") is True
    # Second sample should request a raised max_tokens.
    assert model.max_tokens_seen[0] is not None
    assert model.max_tokens_seen[1] is not None
    assert model.max_tokens_seen[1] > model.max_tokens_seen[0]


class _ProseStopNoUsageModel:
    """Clean prose + stop + no usage → must NOT auto-continue."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        yield {
            "type": "content",
            "text": "这台机器是 Debian 12，内核与磁盘均正常。",
        }
        yield {"type": "finished", "finish_reason": "stop"}


@pytest.mark.asyncio
async def test_loop_does_not_fake_continue_on_prose_stop() -> None:
    run = AgentRun(session_id="s1", run_id="r-prose")
    model = _ProseStopNoUsageModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="状态？")
    assert run.status == RunStatus.COMPLETED
    assert model.calls == 1
    assert not any(
        e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        for e in run.events
    )


class _LongProseSoftHintModel:
    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        if self.calls == 1:
            # Mid-clause early stop (no sentence terminator) — soft hint only.
            body = ("说明一段足够长的正文用来触发续写。" * 12) + "KV cache 预留很大"
            yield {"type": "content", "text": body}
            yield {"type": "finished", "finish_reason": "stop"}
            return
        yield {
            "type": "content",
            "text": "，但仍在可接受范围。总结完毕。",
        }
        yield {"type": "finished", "finish_reason": "stop"}


@pytest.mark.asyncio
async def test_loop_mid_clause_prose_auto_continues() -> None:
    """Long mid-clause early stop → auto-continue (must finish, not soft-hint)."""
    run = AgentRun(session_id="s1", run_id="r-soft")
    model = _LongProseSoftHintModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="详细说明")
    assert run.status == RunStatus.COMPLETED
    assert model.calls >= 2
    assert any(
        e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        for e in run.events
    )
    assert not any(e.type == "assistant_soft_continue" for e in run.events)
    finals = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert any("总结完毕" in t or "可接受" in t for t in finals)


class _PathArrowThenToolsIgnoredModel:
    """First sample ends with path arrow; second ignores tool_choice=none."""

    def __init__(self) -> None:
        self.calls = 0
        self.tool_choices: list[Any] = []

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        import json

        self.calls += 1
        self.tool_choices.append(tool_choice)
        if self.calls == 1:
            body = ("具体操作如下。" * 8) + "Clash Verge -> 设置 ->"
            yield {"type": "content", "text": body}
            yield {"type": "finished", "finish_reason": "stop"}
            return
        # Ignore tool_choice=none — still emit a tool call (must be dropped).
        if tool_choice == "none" or tools is None:
            yield {
                "type": "tool_call_delta",
                "index": 0,
                "id": "call_ignore",
                "function": {
                    "name": "terminal_exec",
                    "arguments": json.dumps({"command": "echo should_drop"}),
                },
            }
            yield {
                "type": "content",
                "text": "系统代理，开启。",
            }
            yield {"type": "finished", "finish_reason": "stop"}
            return
        yield {"type": "content", "text": "done"}
        yield {"type": "finished", "finish_reason": "stop"}


@pytest.mark.asyncio
async def test_loop_path_arrow_continue_drops_ignored_tools() -> None:
    run = AgentRun(session_id="s1", run_id="r-arrow")
    model = _PathArrowThenToolsIgnoredModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="怎么设")
    assert run.status == RunStatus.COMPLETED
    assert model.calls >= 2
    assert "none" in model.tool_choices
    assert not any(e.type == "tool_call" for e in run.events)
    finals = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert any("系统代理" in t for t in finals)
    joined = [t for t in finals if "Clash Verge" in t and "系统代理" in t]
    assert joined, finals


class _ColonCutThenContinueModel:
    """Stops mid-prose (no terminator); continue finishes. Colon is NOT a cut."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        if self.calls == 1:
            body = (
                "**还没修好。** Merge.yaml 文件内容是对的。\n\n"
                "1. 打开 Profiles\n"
                "2. 重新选中当前配置\n\n"
                "或者我试试通过 API 强制重载配置。你在 Clash Verge GUI 里点一下"
                "当前配置的应用按钮，就能让 Merge"
            )
            yield {"type": "content", "text": body}
            yield {"type": "finished", "finish_reason": "stop"}
            return
        yield {
            "type": "content",
            "text": " 重新生效。生效后就会直连。",
        }
        yield {"type": "finished", "finish_reason": "stop"}


@pytest.mark.asyncio
async def test_loop_colon_cut_continue_emits_joined_full_answer() -> None:
    run = AgentRun(session_id="s1", run_id="r-colon")
    model = _ColonCutThenContinueModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="修好了吗")
    assert run.status == RunStatus.COMPLETED
    assert model.calls >= 2
    finals = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    joined = [
        t
        for t in finals
        if "Profiles" in t and "重新生效" in t and "就会直连" in t
    ]
    assert joined, finals
    assert not any(t.rstrip().endswith("Merge") for t in joined)


class _LeadInColonThenToolModel:
    """Forced no-tools sample only announces next step with ：; then acts."""

    def __init__(self) -> None:
        self.calls = 0
        self.tool_choices: list[Any] = []

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        import json

        self.calls += 1
        self.tool_choices.append(tool_choice)
        if self.calls == 1:
            yield {
                "type": "content",
                "text": "规则已移入主 rules 段。现在重载配置并验证：",
            }
            yield {"type": "finished", "finish_reason": "stop"}
            return
        if self.calls == 2:
            yield {
                "type": "tool_call_delta",
                "index": 0,
                "id": "call_reload",
                "name": "terminal_exec",
                "arguments": json.dumps({"command": "echo reloaded"}),
            }
            yield {"type": "finished", "finish_reason": "tool_calls"}
            return
        yield {"type": "content", "text": "已重载，出口正常。"}
        yield {"type": "finished", "finish_reason": "stop"}


@pytest.mark.asyncio
async def test_loop_colon_lead_in_unlocks_tools_instead_of_trunc_continue() -> None:
    from app.agent.loop import deliver_tool_result
    from app.harness.guards.probe_streak import FORCE_TOOL_CHOICE_NONE_KEY

    run = AgentRun(session_id="s1", run_id="r-leadin")
    run.messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "把规则挪进 rules"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_move",
                    "type": "function",
                    "function": {
                        "name": "terminal_exec",
                        "arguments": '{"command":"echo moved"}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call_move",
            "content": (
                "[UNTRUSTED EXTERNAL DATA]\n"
                '{"ok": true, "stdout": "moved\\n", "exit_code": 0}'
            ),
        },
    ]
    run.metadata[FORCE_TOOL_CHOICE_NONE_KEY] = True
    model = _LeadInColonThenToolModel()
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=30)

    async def _feed() -> None:
        for _ in range(200):
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                deliver_tool_result(
                    run,
                    run.pending_tool.call_id,
                    {
                        "ok": True,
                        "exit_code": 0,
                        "stdout": "reloaded\n",
                        "stderr": "",
                        "_untrusted": True,
                    },
                )
            if run.status == RunStatus.COMPLETED:
                break
            await asyncio.sleep(0.01)

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message=None)
    await feeder
    assert run.status == RunStatus.COMPLETED
    assert any(
        e.type == "act_nudge" and e.payload.get("kind") == "lead_in_act"
        for e in run.events
    )
    assert not any(
        e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        for e in run.events
    )
    assert model.tool_choices[0] == "none"
    assert any(c == "auto" for c in model.tool_choices[1:])
    assert any(
        "已重载" in str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    )


class _FinishedProseNoSoftHintModel:
    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        body = ("说明一段足够长的正文，结论完整。" * 10).strip()
        yield {"type": "content", "text": body}
        yield {"type": "finished", "finish_reason": "stop"}


@pytest.mark.asyncio
async def test_loop_no_soft_hint_when_prose_has_terminator() -> None:
    run = AgentRun(session_id="s1", run_id="r-soft-done")
    model = _FinishedProseNoSoftHintModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="详细说明")
    assert run.status == RunStatus.COMPLETED
    assert model.calls == 1
    assert not any(e.type == "assistant_soft_continue" for e in run.events)


class _EndlessProbeModel:
    """Keeps issuing different terminal_exec probes until harness forces none."""

    def __init__(self) -> None:
        self.calls = 0
        self.tool_choices: list[Any] = []
        self._cmds = [
            "ls /sys/devices/system/cpu/cpufreq/",
            "cat /sys/devices/system/cpu/cpufreq/policy0/scaling_cur_freq",
            "cat /sys/devices/system/cpu/cpufreq/policy0/cpuinfo_max_freq",
            "cat /sys/devices/system/cpu/cpufreq/policy0/cpuinfo_min_freq",
            "ls /sys/devices/system/cpu/cpufreq/policy0/",
            "cat /sys/devices/system/cpu/cpufreq/policy1/scaling_cur_freq",
        ]

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        self.tool_choices.append(tool_choice)
        if tool_choice == "none" or tools is None:
            yield {
                "type": "content",
                "text": "当前约 2.8 GHz（等于上限），未见锁在更低档。",
            }
            yield {"type": "finished", "finish_reason": "stop"}
            return
        cmd = self._cmds[min(self.calls - 1, len(self._cmds) - 1)]
        import json

        yield {
            "type": "tool_call_delta",
            "index": 0,
            "id": f"call_probe_{self.calls}",
            "name": "terminal_exec",
            "arguments": json.dumps({"command": cmd}),
        }
        yield {"type": "finished", "finish_reason": "tool_calls"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_probe_streak_forces_conclude_without_more_tools() -> None:
    from app.agent.loop import deliver_tool_result
    from app.harness.guards.probe_streak import PROBE_STREAK_FORCE_THRESHOLD

    run = AgentRun(session_id="s-probe", run_id="r-probe")
    model = _EndlessProbeModel()
    loop = AgentLoop(run, model=model, max_tool_calls=32, max_run_seconds=60)

    async def _feed() -> None:
        delivered = 0
        for _ in range(400):
            if run.status in (RunStatus.COMPLETED, RunStatus.FAILED, RunStatus.CANCELLED):
                return
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                deliver_tool_result(
                    run,
                    run.pending_tool.call_id,
                    {
                        "ok": True,
                        "exit_code": 0,
                        "stdout": "2808000\n",
                        "stderr": "",
                        "_untrusted": True,
                    },
                )
                delivered += 1
                await asyncio.sleep(0)
                continue
            await asyncio.sleep(0.01)
        raise AssertionError(f"feeder timed out after {delivered} delivers")

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="CPU主频多少，有没有锁频")
    await feeder
    assert run.status == RunStatus.COMPLETED
    assert any(
        e.type == "harness_nudge" and e.payload.get("kind") == "probe_streak"
        for e in run.events
    )
    assert "none" in model.tool_choices
    # Must stop probing once forced — not burn the whole cmd list.
    assert model.calls <= PROBE_STREAK_FORCE_THRESHOLD + 2
    finals = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert any("2.8" in t or "锁" in t for t in finals)


class _EndlessEchoModel:
    """Streams the same prose forever until the consumer breaks."""

    def __init__(self) -> None:
        self.chunks = 0

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        block = (
            "But the user has already requested to answer in Chinese, I need to "
            "summarize all the information of large files. From the `du` output "
            "just now, the largest files/directories are:\n"
            "1. /data/models - 34G\n"
            "2. /home/wiselyman/venvs - 9.0G\n"
            "Let me check the specific files under the /data/models directory.\n"
        )
        # Cap absurdly high — harness must break earlier via content-loop grace.
        for _ in range(500):
            if should_cancel and should_cancel():
                break
            self.chunks += 1
            yield {"type": "content", "text": block}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_content_echo_loop_aborts_stream_instead_of_spinning() -> None:
    run = AgentRun(session_id="s-echo", run_id="r-echo")
    model = _EndlessEchoModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="磁盘都被什么占了")
    assert run.status == RunStatus.COMPLETED
    # Must not drain hundreds of echo chunks.
    assert model.chunks < 40
    assert bool(run.metadata.get("_content_loop")) or any(
        e.type == "act_nudge" for e in run.events
    ) or any(
        e.type == "assistant_message"
        and "LOOP" not in str(e.payload.get("content") or "").upper()
        for e in run.events
    )


_DENSE_SHELL_DUMP = (
    "我来检查主机上可能无效的大文件。\n"
    "lsof +L1 2>/dev/null | head -20\n"
    "find / -xdev -type f -size +100M 2>/dev/null | head -20\n"
    'find / -name "core*" -type f -size +10M 2>/dev/null | head -10\n'
    'find /var/log -name "*.log" -type f -size +100M 2>/dev/null | head -10\n'
    'find / -name "*.bak" -type f -size +10M 2>/dev/null | head -10\n'
)


class _ShellDumpThenToolModel:
    """Pastes a dense find/lsof script; after act nudge, calls the tool then answers."""

    def __init__(self) -> None:
        self.calls = 0
        self.tool_choices: list[Any] = []

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        self.tool_choices.append(tool_choice)
        if self.calls == 1:
            # finish_reason=length used to force truncated_answer + tool_choice=none.
            yield {"type": "content", "text": _DENSE_SHELL_DUMP}
            yield {"type": "finished", "finish_reason": "length"}
            return
        if self.calls == 2:
            assert tool_choice != "none", "shell dump must not lock tools off"
            yield {
                "type": "tool_call_delta",
                "index": 0,
                "id": "call_find_1",
                "name": "terminal_exec",
                "arguments": '{"command":"echo ok"}',
            }
            yield {"type": "finished", "finish_reason": "tool_calls"}
            return
        yield {"type": "content", "text": "未发现无效大文件。"}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_shell_script_dump_forces_act_not_truncated_continue() -> None:
    from app.agent.loop import deliver_tool_result

    model = _ShellDumpThenToolModel()
    run = AgentRun(session_id="s-shell", run_id="r-shell")
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=30)

    async def _feed() -> None:
        for _ in range(300):
            if run.status in (RunStatus.COMPLETED, RunStatus.FAILED):
                return
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                deliver_tool_result(
                    run,
                    run.pending_tool.call_id,
                    {
                        "ok": True,
                        "exit_code": 0,
                        "stdout": "ok\n",
                        "stderr": "",
                        "_untrusted": True,
                    },
                )
                await asyncio.sleep(0)
                continue
            await asyncio.sleep(0.01)

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="现在主机上有什么无效的大文件")
    await feeder
    assert run.status == RunStatus.COMPLETED
    assert model.tool_choices[0] == "auto"
    assert model.tool_choices[1] != "none"
    assert any(
        e.type == "act_nudge"
        and e.payload.get("kind") in {"act", "idle_plan", "truncated_plan"}
        for e in run.events
    )
    assert not any(
        e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        for e in run.events
    )


class _ToolJsonDumpModel:
    """Pastes a fenced tool-call JSON as content (no tool_calls API)."""

    def __init__(self) -> None:
        self.calls = 0
        self.tool_choices: list[Any] = []

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        self.tool_choices.append(tool_choice)
        if self.calls == 1:
            # Read-only command so the loop hits WAITING_TOOL (not approval).
            dump = (
                "```json\n"
                "{\n"
                '  "name": "terminal_exec",\n'
                '  "arguments": {\n'
                '    "command": "echo ok"\n'
                "  }\n"
                "}\n"
                "```"
            )
            yield {"type": "content", "text": dump}
            yield {"type": "finished", "finish_reason": "stop"}
            return
        yield {"type": "content", "text": "完成。"}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_tool_json_content_recovers_as_tool_call() -> None:
    from app.agent.loop import deliver_tool_result

    model = _ToolJsonDumpModel()
    run = AgentRun(session_id="s-tj", run_id="r-tj")
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=30)

    async def _feed() -> None:
        for _ in range(300):
            if run.status in (RunStatus.COMPLETED, RunStatus.FAILED):
                return
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                deliver_tool_result(
                    run,
                    run.pending_tool.call_id,
                    {
                        "ok": True,
                        "exit_code": 0,
                        "stdout": "ok\n",
                        "stderr": "",
                        "_untrusted": True,
                    },
                )
                await asyncio.sleep(0)
                continue
            await asyncio.sleep(0.01)

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="跑一下 echo")
    await feeder
    assert run.status == RunStatus.COMPLETED
    assert not any(
        e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        for e in run.events
    )
    assert any(
        m.get("role") == "assistant" and m.get("tool_calls") for m in run.messages
    )


class _ToolXmlDumpModel:
    """Pastes XML-ish <tool_call><function=…> as content (no tool_calls API)."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        if self.calls == 1:
            dump = (
                "<tool_call>\n"
                "<function=terminal_exec>\n"
                "<parameter=command>\n"
                "echo xml-ok\n"
                "</parameter>\n"
                "<parameter=intent>\n"
                "verify xml recover\n"
                "</parameter>\n"
                "<parameter=timeout_seconds>\n"
                "30\n"
                "</parameter>\n"
                "</function>\n"
                "</tool_call>"
            )
            yield {"type": "content", "text": dump}
            yield {"type": "finished", "finish_reason": "stop"}
            return
        yield {"type": "content", "text": "完成。"}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_tool_xml_content_recovers_as_tool_call() -> None:
    from app.agent.loop import deliver_tool_result

    model = _ToolXmlDumpModel()
    run = AgentRun(session_id="s-txml", run_id="r-txml")
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=30)

    async def _feed() -> None:
        for _ in range(300):
            if run.status in (RunStatus.COMPLETED, RunStatus.FAILED):
                return
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                deliver_tool_result(
                    run,
                    run.pending_tool.call_id,
                    {
                        "ok": True,
                        "exit_code": 0,
                        "stdout": "xml-ok\n",
                        "stderr": "",
                        "_untrusted": True,
                    },
                )
                await asyncio.sleep(0)
                continue
            await asyncio.sleep(0.01)

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="跑一下")
    await feeder
    assert run.status == RunStatus.COMPLETED
    assert model.calls >= 2
    assert any(
        m.get("role") == "assistant" and m.get("tool_calls") for m in run.messages
    )
    # XML dump must not remain as the user-facing answer.
    finals = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert not any("<tool_call>" in t for t in finals if t.strip())
    assert any("完成" in t for t in finals)


class _BareArgsJsonDumpModel:
    """Pastes bare {"command","intent","timeout_seconds"} without tool name."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions(self, *args: Any, **kwargs: Any) -> dict[str, Any]:
        raise AssertionError("non-stream should not be used")

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        if self.calls == 1:
            dump = (
                "find / -xdev -type f -size +100M | head\n"
                "```json\n"
                "{\n"
                '  "command": "echo ok",\n'
                '  "intent": "probe",\n'
                '  "timeout_seconds": 60\n'
                "}\n"
                "```"
            )
            yield {"type": "content", "text": dump}
            yield {"type": "finished", "finish_reason": "stop"}
            return
        yield {"type": "content", "text": "完成。"}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_bare_command_intent_json_recovers_as_tool_call() -> None:
    from app.agent.loop import deliver_tool_result

    model = _BareArgsJsonDumpModel()
    run = AgentRun(session_id="s-bare", run_id="r-bare")
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=30)

    async def _feed() -> None:
        for _ in range(300):
            if run.status in (RunStatus.COMPLETED, RunStatus.FAILED):
                return
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                deliver_tool_result(
                    run,
                    run.pending_tool.call_id,
                    {
                        "ok": True,
                        "exit_code": 0,
                        "stdout": "ok\n",
                        "stderr": "",
                        "_untrusted": True,
                    },
                )
                await asyncio.sleep(0)
                continue
            await asyncio.sleep(0.01)

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="这台电脑上有哪些大文件")
    await feeder
    assert run.status == RunStatus.COMPLETED
    assert any(
        m.get("role") == "assistant" and m.get("tool_calls") for m in run.messages
    )
    assert not any(e.type == "assistant_soft_continue" for e in run.events)
    assert not any(
        e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        for e in run.events
    )


class _StructuralTableStopModel:
    """Stops mid markdown table once, then finishes on continue."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        if self.calls == 1:
            body = (
                "| size | path |\n"
                "| --- | --- |\n"
                "| 101M | /a |\n"
                "| 106M | /llvm/bin/llvm-split"
            )
            yield {"type": "content", "text": body}
            yield {"type": "finished", "finish_reason": "stop"}
            return
        yield {
            "type": "content",
            "text": " x4 |\n| 106M | /llvm/bin/llvm-dwp x4 |\n\n以上为主要大文件。",
        }
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_loop_structural_table_stop_auto_continues() -> None:
    """Mid markdown table with finish=stop → auto-continue until finished."""
    run = AgentRun(session_id="s1", run_id="r-table")
    model = _StructuralTableStopModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="大文件有哪些")
    assert run.status == RunStatus.COMPLETED
    assert model.calls >= 2
    assert any(
        e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        for e in run.events
    )
    assert not any(e.type == "assistant_soft_continue" for e in run.events)
    finals = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert any("主要大文件" in t or "llvm-dwp" in t for t in finals)


class _EchoContinueLoopModel:
    """First cut mid-clause; continues only restate the same summary (dead loop)."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        body = (
            "你当前跑模型推理，nvcc 12.0.140 完全够用，不需要升级。"
            "驱动与运行时已经支持最新功能，可以继续用现有环境。\n\n"
            "总结：\n"
            "- 驱动 595.84 ✅ 最新\n"
            "- CUDA 13.2 (运行时) ✅ 最新\n"
            "- nvcc 12.0.140 ⚠️ 旧，但不影响你当前的模型推理"
        )
        if self.calls == 1:
            # Cut before the checklist so soft-continue triggers once.
            cut = (
                "你当前跑模型推理，nvcc 12.0.140 完全够用，不需要升级。"
                "驱动与运行时已经支持最新功能，可以继续用现有环境"
            )
            yield {"type": "content", "text": cut}
            yield {"type": "finished", "finish_reason": "stop"}
            return
        # Echo the full answer again instead of only the missing suffix.
        yield {"type": "content", "text": body}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_loop_stops_trunc_continue_on_echoed_summary() -> None:
    """Echoed summary after continue must not leave the run busy forever."""
    run = AgentRun(session_id="s1", run_id="r-echo-cont")
    model = _EchoContinueLoopModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="CUDA 要不要升级")
    assert run.status == RunStatus.COMPLETED
    # One continue attempt, then stop — not 16 echo rounds.
    assert model.calls == 2
    assert (
        sum(
            1
            for e in run.events
            if e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        )
        == 1
    )
    finals = [
        str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    ]
    assert any("✅" in t and "总结" in t for t in finals)
    # Collapsed — summary block should not be duplicated endlessly.
    best = max(finals, key=len)
    assert best.count("总结：") <= 2


class _CompleteChecklistModel:
    """Finished checklist ending — must not soft-continue at all."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        body = (
            "你当前跑模型推理，nvcc 12.0.140 完全够用，不需要升级。\n\n"
            "总结：\n"
            "- 驱动 595.84 ✅ 最新\n"
            "- CUDA 13.2 (运行时) ✅ 最新\n"
            "- nvcc 12.0.140 ⚠️ 旧，但不影响你当前的模型推理"
        )
        yield {"type": "content", "text": body}
        yield {"type": "finished", "finish_reason": "stop"}

    @staticmethod
    def extract_assistant_message(completion: dict[str, Any]) -> dict[str, Any]:
        return ModelGateway.extract_assistant_message(completion)


@pytest.mark.asyncio
async def test_loop_complete_checklist_does_not_soft_continue() -> None:
    run = AgentRun(session_id="s1", run_id="r-checklist-done")
    model = _CompleteChecklistModel()
    loop = AgentLoop(run, model=model, max_tool_calls=4, max_run_seconds=30)
    await loop.run_until_pause_or_done(user_message="CUDA 要不要升级")
    assert run.status == RunStatus.COMPLETED
    assert model.calls == 1
    assert not any(
        e.type == "act_nudge" and e.payload.get("kind") == "truncated_answer"
        for e in run.events
    )


class _ContentToolJsonDumpModel:
    """Pastes tool JSON as content (local models); must not reopen tools under FORCE."""

    def __init__(self) -> None:
        self.calls = 0

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        self.calls += 1
        dump = (
            '{"name":"terminal_exec","arguments":'
            '{"command":"curl -s http://127.0.0.1:8000/v1/models",'
            '"intent":"Verify the model API is ready and responding"}}'
        )
        yield {"type": "content", "text": dump}
        yield {"type": "finished", "finish_reason": "stop"}


@pytest.mark.asyncio
async def test_force_tool_choice_none_skips_content_tool_json_recovery() -> None:
    from app.harness.guards.probe_streak import (
        FORCE_TOOL_CHOICE_NONE_KEY,
        PROBE_CONCLUDE_SENT_KEY,
    )

    run = AgentRun(session_id="s1", run_id="r-no-recover")
    run.messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "查 API"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_prev",
                    "type": "function",
                    "function": {
                        "name": "terminal_exec",
                        "arguments": '{"command":"curl -s http://127.0.0.1:8000/v1/models"}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call_prev",
            "content": (
                "[UNTRUSTED EXTERNAL DATA]\n"
                '{"ok": true, "stdout": "{\\"data\\":[]}\\n", "exit_code": 0}'
            ),
        },
    ]
    run.metadata[FORCE_TOOL_CHOICE_NONE_KEY] = True
    run.metadata[PROBE_CONCLUDE_SENT_KEY] = True
    model = _ContentToolJsonDumpModel()
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=20)
    await loop.run_until_pause_or_done(user_message=None)
    assert run.status == RunStatus.COMPLETED
    assert model.calls == 1
    assert not any(
        e.type == "tool_call" for e in run.events
    ), "must not recover pasted tool JSON while FORCE_TOOL_CHOICE_NONE"
    assert not any(
        e.type == "act_nudge" for e in run.events
    ), "must not idle-plan act under FORCE after tool JSON dump"


@pytest.mark.asyncio
async def test_probe_conclude_blocks_lead_in_tool_reopen() -> None:
    from app.harness.guards.probe_streak import (
        FORCE_TOOL_CHOICE_NONE_KEY,
        PROBE_CONCLUDE_SENT_KEY,
    )

    run = AgentRun(session_id="s1", run_id="r-no-leadin")
    run.messages = [
        {"role": "system", "content": "sys"},
        {"role": "user", "content": "查 API"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "call_curl",
                    "type": "function",
                    "function": {
                        "name": "terminal_exec",
                        "arguments": '{"command":"curl -s http://x"}',
                    },
                }
            ],
        },
        {
            "role": "tool",
            "tool_call_id": "call_curl",
            "content": (
                "[UNTRUSTED EXTERNAL DATA]\n"
                '{"ok": true, "stdout": "ok\\n", "exit_code": 0}'
            ),
        },
    ]
    run.metadata[FORCE_TOOL_CHOICE_NONE_KEY] = True
    run.metadata[PROBE_CONCLUDE_SENT_KEY] = True
    model = _LeadInColonThenToolModel()
    loop = AgentLoop(run, model=model, max_tool_calls=8, max_run_seconds=20)
    await loop.run_until_pause_or_done(user_message=None)
    assert run.status == RunStatus.COMPLETED
    assert model.calls == 1
    assert not any(
        e.type == "act_nudge" and e.payload.get("kind") == "lead_in_act"
        for e in run.events
    )
    assert "auto" not in model.tool_choices


class _IdenticalCurlLoopModel:
    """Keeps requesting the same curl until tool_choice=none forces prose."""

    def __init__(self) -> None:
        self.calls = 0
        self.tool_choices: list[Any] = []

    async def chat_completions_stream(
        self,
        messages: list[dict[str, Any]],
        tools: list[dict[str, Any]] | None = None,
        *,
        temperature: float = 0.2,
        tool_choice: Any = "auto",
        should_cancel: Any = None,
        max_tokens: int | None = None,
    ) -> Any:
        import json

        self.calls += 1
        self.tool_choices.append(tool_choice)
        if tool_choice == "none":
            yield {"type": "content", "text": "API 已就绪，无需再探测。"}
            yield {"type": "finished", "finish_reason": "stop"}
            return
        yield {
            "type": "tool_call_delta",
            "index": 0,
            "id": f"call_curl_{self.calls}",
            "name": "terminal_exec",
            "arguments": json.dumps(
                {
                    "command": "curl -s http://127.0.0.1:8000/v1/models",
                    "intent": f"Verify the model API is ready and responding #{self.calls}",
                }
            ),
        }
        yield {"type": "finished", "finish_reason": "tool_calls"}


@pytest.mark.asyncio
async def test_identical_tool_hard_deny_forces_conclude() -> None:
    from app.agent.loop import deliver_tool_result

    run = AgentRun(session_id="s1", run_id="r-repeat-stop")
    model = _IdenticalCurlLoopModel()
    loop = AgentLoop(run, model=model, max_tool_calls=16, max_run_seconds=45)
    # Faster deny for the test (production default is 4).
    loop._repeat_guard.hard_deny_at = 3  # noqa: SLF001

    async def _feed() -> None:
        for _ in range(400):
            if run.status in (
                RunStatus.COMPLETED,
                RunStatus.FAILED,
                RunStatus.CANCELLED,
            ):
                return
            if run.status == RunStatus.WAITING_TOOL and run.pending_tool:
                deliver_tool_result(
                    run,
                    run.pending_tool.call_id,
                    {
                        "ok": True,
                        "exit_code": 0,
                        "stdout": '{"data":[]}\n',
                        "stderr": "",
                        "_untrusted": True,
                    },
                )
                await asyncio.sleep(0)
                continue
            await asyncio.sleep(0.01)

    feeder = asyncio.create_task(_feed())
    await loop.run_until_pause_or_done(user_message="模型 API 通吗")
    await feeder
    assert run.status == RunStatus.COMPLETED
    assert any(
        e.type == "harness_nudge" and e.payload.get("kind") == "repeat_tool_stop"
        for e in run.events
    )
    assert any(c == "none" for c in model.tool_choices)
    assert any(
        "API 已就绪" in str(e.payload.get("content") or "")
        for e in run.events
        if e.type == "assistant_message"
    )
