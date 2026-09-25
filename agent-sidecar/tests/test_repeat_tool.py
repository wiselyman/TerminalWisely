import asyncio
import json

from app.harness.guards.repeat_tool import (
    RepeatToolReminder,
    normalize_shell_command,
    repeat_tool_key,
    tool_result_failed,
)
from app.harness.pipeline import ToolExec


def test_repeat_key_ignores_intent() -> None:
    a = repeat_tool_key(
        "terminal_exec",
        {"command": "curl -s http://x", "intent": "Verify API"},
    )
    b = repeat_tool_key(
        "terminal_exec",
        {"command": "curl -s http://x", "intent": "Check again"},
    )
    assert a == b
    assert "intent" not in a


def test_normalize_command_trims_line_tails() -> None:
    a = normalize_shell_command("python -c 'x'  \ntry:\n  pass\n")
    b = normalize_shell_command("python -c 'x'\ntry:\n  pass")
    assert a == b


def test_tool_result_failed_ignores_cancel_deny() -> None:
    assert tool_result_failed({"ok": False, "error": "boom"}) is True
    assert tool_result_failed({"ok": True, "exit_code": 1}) is True
    assert tool_result_failed({"ok": False, "cancelled": True}) is False
    assert tool_result_failed({"ok": False, "denied": True}) is False


def test_hard_deny_after_identical_commands() -> None:
    async def _run() -> None:
        guard = RepeatToolReminder(hard_deny_at=4, thresholds=[2, 3])
        cmd = {"command": "curl -s http://127.0.0.1:8000/v1/models", "intent": "a"}
        for i in range(3):
            d = await guard.pre(
                ToolExec(call_id=f"c{i}", name="terminal_exec", arguments=cmd)
            )
            assert d.action == "allow"
            await guard.post(
                ToolExec(call_id=f"c{i}", name="terminal_exec", arguments=cmd),
                {"ok": True},
            )
        denied = await guard.pre(
            ToolExec(
                call_id="c3",
                name="terminal_exec",
                arguments={**cmd, "intent": "different title"},
            )
        )
        assert denied.action == "deny"
        assert denied.result is not None
        assert denied.result.get("stop_repeating") is True
        assert denied.result.get("repeat_count") == 4

    asyncio.run(_run())


def test_fail_deny_on_second_identical_after_failure() -> None:
    """Approved mutation that crashes must not be resubmitted unchanged."""

    async def _run() -> None:
        guard = RepeatToolReminder(hard_deny_at=4, fail_deny_at=2, thresholds=[2, 3])
        cmd = {
            "command": (
                "python3 - <<'PY'\n"
                "try:\n"
                "font = 1\n"  # broken indent — same script each time
                "PY"
            ),
            "intent": "Generate diagram",
        }
        d1 = await guard.pre(ToolExec("1", "terminal_exec", cmd))
        assert d1.action == "allow"
        note = guard.note_result(
            "terminal_exec",
            cmd,
            {
                "ok": False,
                "exit_code": 1,
                "stderr": "IndentationError: expected an indented block",
            },
        )
        assert note is not None
        assert "Approval" in note or "approval" in note.lower()

        denied = await guard.pre(
            ToolExec(
                "2",
                "terminal_exec",
                {**cmd, "intent": "Generate diagram again"},
            )
        )
        assert denied.action == "deny"
        assert denied.result is not None
        assert denied.result.get("stop_repeating") is True
        assert denied.result.get("prior_failed") is True

    asyncio.run(_run())


def test_success_then_identical_still_allows_until_hard_deny() -> None:
    async def _run() -> None:
        guard = RepeatToolReminder(hard_deny_at=4, fail_deny_at=2, thresholds=[2, 3])
        cmd = {"command": "echo ok"}
        for i in range(3):
            d = await guard.pre(ToolExec(str(i), "terminal_exec", cmd))
            assert d.action == "allow"
            guard.note_result("terminal_exec", cmd, {"ok": True, "exit_code": 0})
        denied = await guard.pre(ToolExec("3", "terminal_exec", cmd))
        assert denied.action == "deny"
        assert denied.result is not None
        assert denied.result.get("prior_failed") is False

    asyncio.run(_run())


def test_reset_clears_chain() -> None:
    async def _run() -> None:
        guard = RepeatToolReminder(hard_deny_at=3, thresholds=[2])
        args = {"command": "echo hi"}
        await guard.pre(ToolExec("1", "terminal_exec", args))
        await guard.pre(ToolExec("2", "terminal_exec", args))
        guard.reset()
        d = await guard.pre(ToolExec("3", "terminal_exec", args))
        assert d.action == "allow"

    asyncio.run(_run())


def test_json_args_roundtrip_key() -> None:
    args = {"command": "echo x", "intent": "t"}
    raw = json.dumps(args)
    parsed = json.loads(raw)
    assert repeat_tool_key("terminal_exec", parsed) == repeat_tool_key(
        "terminal_exec", args
    )
