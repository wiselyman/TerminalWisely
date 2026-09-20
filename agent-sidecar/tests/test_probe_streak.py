"""Force conclude after a long streak of investigative tools (no hardcoding)."""

from __future__ import annotations

from app.harness.guards.probe_streak import (
    PROBE_STREAK_FORCE_THRESHOLD,
    probe_tool_streak,
    should_force_probe_conclude,
)


def _asst_tools(*names: str) -> dict:
    return {
        "role": "assistant",
        "content": "",
        "tool_calls": [
            {
                "id": f"c{i}",
                "type": "function",
                "function": {"name": n, "arguments": "{}"},
            }
            for i, n in enumerate(names)
        ],
    }


def test_probe_streak_counts_consecutive_terminal_exec() -> None:
    messages = [
        {"role": "user", "content": "CPU freq?"},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
        _asst_tools("terminal_exec", "terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
        {"role": "tool", "tool_call_id": "c1", "content": "{}"},
    ]
    assert probe_tool_streak(messages) == 4


def test_probe_streak_resets_on_real_user_message() -> None:
    messages = [
        {"role": "user", "content": "old"},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
        {"role": "user", "content": "new question"},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
    ]
    assert probe_tool_streak(messages) == 1


def test_probe_streak_ignores_harness_user_notes() -> None:
    messages = [
        {"role": "user", "content": "CPU?"},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
        {"role": "user", "content": "[HARNESS] stop repeating"},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
    ]
    assert probe_tool_streak(messages) == 3


def test_probe_streak_breaks_on_assistant_final_answer() -> None:
    messages = [
        {"role": "user", "content": "CPU?"},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
        {"role": "assistant", "content": "2.8 GHz, not locked."},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
    ]
    assert probe_tool_streak(messages) == 1


def test_probe_streak_breaks_on_non_probe_tool() -> None:
    messages = [
        {"role": "user", "content": "fix something"},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
        _asst_tools("apply_patch"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
        _asst_tools("terminal_exec"),
        {"role": "tool", "tool_call_id": "c0", "content": "{}"},
    ]
    assert probe_tool_streak(messages) == 1


def test_should_force_conclude_at_threshold() -> None:
    assert not should_force_probe_conclude(PROBE_STREAK_FORCE_THRESHOLD - 1)
    assert should_force_probe_conclude(PROBE_STREAK_FORCE_THRESHOLD)
    assert should_force_probe_conclude(PROBE_STREAK_FORCE_THRESHOLD + 2)
