"""ScenarioDirector matching and step selection."""

from __future__ import annotations

from mock_ollama.director import load_scenarios


def test_director_list_pods_first_step_tool_call() -> None:
    director = load_scenarios()
    completion = director.build_completion(
        [{"role": "user", "content": "看看 demo 命名空间里的 Pod 都正常吗？"}],
        model="mock-k8s-engineer",
    )
    message = completion["choices"][0]["message"]
    assert message.get("tool_calls")
    assert message["tool_calls"][0]["function"]["name"] == "k8s_list"


def test_director_advances_after_tool_result() -> None:
    director = load_scenarios()
    messages = [
        {"role": "user", "content": "demo 里 broken-pull 为啥起不来？"},
        {
            "role": "assistant",
            "content": "",
            "tool_calls": [
                {
                    "id": "c1",
                    "type": "function",
                    "function": {"name": "k8s_list", "arguments": "{}"},
                }
            ],
        },
        {"role": "tool", "tool_call_id": "c1", "content": "[]"},
    ]
    completion = director.build_completion(messages, model="mock-k8s-engineer")
    message = completion["choices"][0]["message"]
    assert message["tool_calls"][0]["function"]["name"] == "k8s_describe"


def test_director_final_answer_after_describe() -> None:
    director = load_scenarios()
    messages = [
        {"role": "user", "content": "broken-pull ImagePullBackOff 根因？"},
        {"role": "tool", "tool_call_id": "c1", "content": "pods"},
        {"role": "tool", "tool_call_id": "c2", "content": "describe output"},
    ]
    completion = director.build_completion(messages, model="mock-k8s-engineer")
    message = completion["choices"][0]["message"]
    assert "ImagePullBackOff" in (message.get("content") or "")
    assert not message.get("tool_calls")
