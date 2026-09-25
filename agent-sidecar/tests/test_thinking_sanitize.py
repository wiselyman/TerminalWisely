"""Tests for stripping thinking / CoT from assistant content."""

from __future__ import annotations

from app.llm.thinking import sanitize_assistant_content


def test_strips_think_tags() -> None:
    raw = "<" + "think" + ">secret plan</" + "think" + ">\n\n正式回答"
    assert sanitize_assistant_content(raw) == "正式回答"


def test_strips_english_cot_dump() -> None:
    raw = """The user is asking two questions:

What large language model am I using?

Plan:

State that I am Qwen.

Drafting the response:

Identity: 我是 Qwen

This looks correct and complete.

我是 Qwen（通义千问）。

关于上网检索，我会调用 web_search 工具。"""
    out = sanitize_assistant_content(raw)
    assert "The user is asking" not in out
    assert "Drafting the response" not in out
    assert "我是 Qwen（通义千问）。" in out
    assert "web_search" in out


def test_keeps_normal_multilingual_answer() -> None:
    raw = "CPU 是 Grace Blackwell。\n\n相比骁龙更偏吞吐。"
    assert sanitize_assistant_content(raw) == raw


def test_strips_single_block_user_wants_plan() -> None:
    raw = (
        "The user wants to download and install Google Chrome on the server "
        "using a specific HTTP proxy (`http://10.6.20.38:7897`).\n\n"
        "1.  **Identify the goal**: Download and install Google Chrome.\n"
        "2.  **Identify constraints**: Use the given HTTP proxy.\n"
        "3.  **Plan**: curl the .deb then dpkg -i.\n"
        "4.  **Execute**: call terminal tools next."
    )
    assert sanitize_assistant_content(raw) == ""


def test_strips_zh_feishu_url_guess_loop() -> None:
    from app.llm.thinking import is_repetition_loop, looks_like_zh_planning_narration

    para = (
        "让我尝试一个常见的版本。\n\n"
        "实际上，让我尝试直接下载飞书的 deb 包。"
        "飞书官方下载页面通常会有一个 API 返回下载链接。\n\n"
        "或者，我可以使用已知的飞书下载 URL 格式。根据之前的搜索结果，"
        "飞书 Linux 版本的下载链接可能类似于：\n"
        "https://sf3-cn.feishucdn.com/obj/feishu-static/lark/Lark_x64_xxx.deb\n\n"
    )
    raw = para * 5
    assert looks_like_zh_planning_narration(raw)
    assert is_repetition_loop(raw)
    assert sanitize_assistant_content(raw) == ""


def test_looks_like_truncated_answer_trailing_enumeration_comma() -> None:
    from app.llm.thinking import looks_like_truncated_answer

    raw = (
        "## 内部流程\n\n"
        + ("说明一段足够长的正文用来过长度门槛。\n" * 3)
        + "画轨迹对比图 -> 存到 /tmp/stand_alone_inference/traj_1.jpeg 、"
    )
    assert looks_like_truncated_answer(raw)


def test_truncated_answer_nudge_includes_tail() -> None:
    from app.harness.verify import truncated_answer_nudge

    text = truncated_answer_nudge("存到 /tmp/x.jpeg 、")
    assert "Last incomplete line" in text
    assert "traj" in text or "/tmp/x.jpeg" in text


def test_looks_like_truncated_answer_prose_only_not_flagged() -> None:
    """Prose mid-cut without structural break is NOT heuristic-flagged (A uses budget)."""
    from app.llm.thinking import looks_like_truncated_answer

    raw = (
        "是的，这里的 70 指的是单流速度。\n\n" * 4
        + "70 tok/s ≈ 单流 decode 上限。一旦你"
    )
    assert not looks_like_truncated_answer(raw)
    assert not looks_like_truncated_answer(
        "### 建议\n\n就建议 A: kill 卡住的进程再重启，22GB 已下"
    )


def test_ends_without_sentence_terminator_parenthetical_size_cut() -> None:
    """Closing ) after a size/path is NOT a finished answer — even when short."""
    from app.harness.verify import (
        SOFT_CONTINUE_MIN_CHARS,
        ends_without_sentence_terminator,
    )

    cut = "已删除。`/data/models/` 现在为空，仅 12K (空目录)"
    assert ends_without_sentence_terminator(cut)
    assert len(cut.strip()) >= SOFT_CONTINUE_MIN_CHARS
    assert not ends_without_sentence_terminator("模型已停，文件已删干净。")
    assert not ends_without_sentence_terminator("Done.")


def test_ends_without_sentence_terminator_complete_checklist() -> None:
    """Finished markdown bullets / status emoji must not soft-continue forever."""
    from app.harness.verify import ends_without_sentence_terminator

    summary = (
        "你当前跑模型推理，nvcc 12.0.140 完全够用，不需要升级。\n\n"
        "总结：\n"
        "- 驱动 595.84 ✅ 最新\n"
        "- CUDA 13.2 (运行时) ✅ 最新\n"
        "- nvcc 12.0.140 ⚠️ 旧，但不影响你当前的模型推理"
    )
    assert not ends_without_sentence_terminator(summary)
    assert not ends_without_sentence_terminator(
        "总结：\n1. 驱动正常\n2. 运行时已就绪"
    )


def test_ends_without_sentence_terminator_long_cjk_line_without_period() -> None:
    """Long finished CJK prose missing final 。 must not soft-continue."""
    from app.harness.verify import ends_without_sentence_terminator

    line = (
        "RTX 5060 Ti 是 2025 年的中端显卡，16GB GDDR7 显存，"
        "跑 7B/13B/14B 很舒服，性价比不错"
    )
    assert len(line) >= 60
    assert not ends_without_sentence_terminator(f"## 一句话总结\n\n{line}")
    # Mid-clause comma at EOL still unfinished.
    assert ends_without_sentence_terminator(line + "，")


def test_continuation_overshoots_phantom_ack_and_second_summary() -> None:
    from app.harness.verify import (
        continuation_overshoots_finished_prose,
        should_stop_truncated_continue,
        trim_overcontinued_answer,
    )

    prev = (
        "RTX 5060 Ti 是 2025 年的中端卡，16GB GDDR7，"
        "跑 7B/13B/14B 很舒服，性价比不错"
    )
    joined = (
        prev
        + "。好的，那就不需要额外安装了。\n\n"
        "总结：\n"
        "- 驱动 ✅ 最新\n"
        "- 运行时 ✅ 最新"
    )
    assert continuation_overshoots_finished_prose(prev, joined)
    assert should_stop_truncated_continue(
        nudges=1, grew=True, previous=prev, emit=joined
    )
    assert trim_overcontinued_answer(prev, joined) == prev + "。"


def test_should_stop_truncated_continue_on_echo() -> None:
    from app.harness.verify import (
        collapse_repeated_paragraphs,
        continuation_is_redundant,
        should_stop_truncated_continue,
    )

    para = (
        "你当前跑模型推理，nvcc 12.0.140 完全够用，不需要升级。"
        "驱动与运行时已经支持最新功能。"
    )
    joined = f"{para}\n\n总结：\n- 驱动 ✅\n\n{para}\n\n总结：\n- 驱动 ✅"
    assert continuation_is_redundant(para, joined)
    assert should_stop_truncated_continue(
        nudges=1, grew=True, previous=para, emit=joined
    )
    assert should_stop_truncated_continue(
        nudges=1, grew=False, previous=para, emit=para
    )
    collapsed = collapse_repeated_paragraphs(joined)
    assert collapsed.count(para) == 1


def test_ends_without_sentence_terminator_path_arrow() -> None:
    from app.harness.verify import ends_without_sentence_terminator
    from app.llm.thinking import looks_like_truncated_answer

    cut = "具体操作如下。\n\n" * 3 + "Clash Verge -> 设置 ->"
    assert ends_without_sentence_terminator(cut)
    assert looks_like_truncated_answer(cut)


def test_colon_lead_in_is_not_truncated_answer() -> None:
    from app.harness.verify import (
        ends_without_sentence_terminator,
        looks_like_action_lead_in,
    )
    from app.llm.thinking import looks_like_truncated_answer

    lead = "规则已移入主 rules 段。现在重载配置并验证："
    assert looks_like_action_lead_in(lead)
    assert not ends_without_sentence_terminator(lead)
    assert not looks_like_truncated_answer(lead)


def test_join_answer_continuation_restated_dangling_line() -> None:
    """Continue restates the colon-cut line then finishes — one full answer."""
    from app.harness.verify import join_answer_continuation

    prev = (
        "**还没修好。** Merge.yaml 文件内容是对的。\n\n"
        "1. 打开 Profiles\n"
        "2. 重新选中当前配置\n\n"
        "或者我试试通过 API 强制重载："
    )
    nxt = (
        "或者我试试通过 API 强制重载配置。你在 Clash Verge GUI 里点一下"
        "当前配置的应用按钮，就能让 Merge 重新生效。生效后就会直连。"
    )
    out = join_answer_continuation(prev, nxt)
    assert "Profiles" in out
    assert "重新生效" in out
    assert "就会直连" in out
    assert "强制重载：或者我试试" not in out
    assert out.count("强制重载") == 1


def test_join_answer_continuation_pure_suffix() -> None:
    from app.harness.verify import join_answer_continuation

    prev = "说明一段足够长的正文。" * 4 + "存到 /tmp/a.jpeg 、"
    nxt = "以及 /tmp/b.jpeg。评估完成。"
    out = join_answer_continuation(prev, nxt)
    assert "a.jpeg" in out and "b.jpeg" in out
    assert out.endswith("评估完成。")


def test_looks_like_truncated_answer_unclosed_bracket_cjk() -> None:
    """Structural: cut at 「连通性 [不」."""
    from app.llm.thinking import looks_like_truncated_answer

    raw = (
        "### 我的建议\n\n"
        "如果你确实想尝试直接 HF 看能不能更快，我可以先只测连通性 [不"
    )
    assert looks_like_truncated_answer(raw)
    assert not looks_like_truncated_answer(
        "我可以先只测连通性（不下模型）。你要的话再说。"
    )


def test_looks_like_truncated_answer_incomplete_table() -> None:
    """Structural: table cut with blank / missing cell."""
    from app.llm.thinking import looks_like_truncated_answer

    raw = (
        "结论：不是慢，是网络层挂起。CDN 停推流了。\n\n"
        "### 怎么办（要动进程，等你拍板）\n\n"
        "| 方案 | 动作 | 说明 |\n"
        "|------|------|------|\n"
        "| A. 重新下载（推荐） | kill 卡住的进程 → 重新 `hf download` |"
    )
    assert looks_like_truncated_answer(raw)
    raw_empty = raw + " |"
    assert looks_like_truncated_answer(raw_empty)
    done = (
        raw
        + " 断点续传，已下 23GB 还在。|\n"
        + "| B. 再等 | 不动 | 多半回不来 |\n"
    )
    assert not looks_like_truncated_answer(done)


def test_looks_like_truncated_answer_unclosed_bold_number() -> None:
    """Structural: unclosed ** at 「大约 **1.」."""
    from app.llm.thinking import looks_like_truncated_answer

    raw = (
        "主模型 67/67 齐了。\n\n" * 4
        + "还剩 125 片（约 63% 未完成）。按你说的 7 MB/s 估算，"
        "ple-table 单片不大，但 125 片总量估计还有 40-60 GB，大约 **1."
    )
    assert looks_like_truncated_answer(raw)
    assert not looks_like_truncated_answer(
        "总量估计还有 40-60 GB，大约 **1.5–2 小时**。"
    )


def test_output_budget_exhausted() -> None:
    from app.llm.thinking import output_budget_exhausted

    assert output_budget_exhausted("length", None, 8192)
    assert output_budget_exhausted("max_tokens", None, 8192)
    assert output_budget_exhausted("stop", {"completion_tokens": 8000}, 8192)
    assert not output_budget_exhausted("stop", {"completion_tokens": 100}, 8192)
    assert not output_budget_exhausted("stop", None, 8192)
    assert not output_budget_exhausted("tool_calls", {"completion_tokens": 9000}, 8192)


def test_reasoning_starved_visible_reply() -> None:
    from app.llm.thinking import reasoning_starved_visible_reply

    usage = {
        "completion_tokens": 200,
        "completion_tokens_details": {"reasoning_tokens": 120},
    }
    # Thin visible after heavy reasoning → continue.
    assert reasoning_starved_visible_reply("stop", usage, "短", 8192)
    # Mid-clause with room left → continue.
    mid = ("说明如下。" * 20) + "KV cache 预留很大"
    assert reasoning_starved_visible_reply("stop", usage, mid, 8192)
    # Finished visible + low reasoning share → no.
    assert not reasoning_starved_visible_reply(
        "stop",
        {
            "completion_tokens": 200,
            "completion_tokens_details": {"reasoning_tokens": 10},
        },
        mid + "。",
        8192,
    )
    assert not reasoning_starved_visible_reply(
        "tool_calls", usage, "短", 8192
    )


def test_raised_max_output_tokens() -> None:
    from app import paths

    assert paths.max_output_tokens() >= 16384
    assert paths.max_output_tokens_hard_cap() >= paths.max_output_tokens()
    assert paths.prefer_complete_max_output_tokens() == paths.max_output_tokens_hard_cap()
    assert paths.raised_max_output_tokens(8192) == min(
        16384, paths.max_output_tokens_hard_cap()
    )
    assert paths.raised_max_output_tokens(100) == 200


def test_should_emit_soft_continue_hint() -> None:
    from app.harness.verify import should_emit_soft_continue_hint

    # Mid-clause cut (no sentence terminator) above the lowered threshold.
    mid = ("说明如下。" * 40) + "KV cache 预留很大"
    assert len(mid) >= 180
    assert should_emit_soft_continue_hint(
        mid, budget_hit=False, structural_trunc=False
    )
    # Finished prose with terminator — no soft hint.
    done = ("说明如下。" * 40) + "这是硬件上限决定的。"
    assert not should_emit_soft_continue_hint(
        done, budget_hit=False, structural_trunc=False
    )
    assert not should_emit_soft_continue_hint(
        mid, budget_hit=True, structural_trunc=False
    )
    assert not should_emit_soft_continue_hint(
        "short mid cut 预留很大", budget_hit=False, structural_trunc=False
    )
    # Truncation path already owns recovery — soft hint stays off.
    assert not should_emit_soft_continue_hint(
        mid, budget_hit=False, structural_trunc=True
    )


def test_looks_like_truncated_answer_dangling_heading() -> None:
    from app.llm.thinking import looks_like_truncated_answer

    raw = (
        "## 第 1 步到底在做什么\n\n"
        "GROOT 在看 DROID 演示，预测未来 8 步动作，再和真实动作对比。\n\n"
        "阶段1 输入 → 阶段2 Backbone → 阶段3 Action Head → 阶段4 对比画图。\n\n"
        "## 第 1 步到底在做什么"
    )
    assert looks_like_truncated_answer(raw)


def test_strip_trailing_dangling_heading_glued() -> None:
    from app.llm.thinking import (
        looks_like_truncated_answer,
        strip_trailing_dangling_heading,
    )

    raw = (
        "## 第 1 步到底在做什么\n\n"
        + ("GROOT 在看演示。\n\n" * 3)
        + "│ 预测动作 vs 真实动作 (数据里记录的) ## 第 1 步到底在做什么\n"
        + "## 第 1 步到底在做什么"
    )
    assert looks_like_truncated_answer(raw)
    cleaned = strip_trailing_dangling_heading(raw)
    assert cleaned.endswith("记录的)")
    assert "## 第 1 步" not in cleaned.splitlines()[-1]


def test_looks_like_truncated_answer_mid_box_line() -> None:
    from app.llm.thinking import looks_like_truncated_answer

    raw = (
        "## 流程\n\n"
        "说明一段足够长的正文用来过长度门槛。\n\n" * 2
        + "┌────────┐\n"
        "│ 预测动作 vs 真实动作 (数据里记录的)"
    )
    assert looks_like_truncated_answer(raw)


def test_looks_like_truncated_plan_step3() -> None:
    from app.llm.thinking import looks_like_truncated_plan

    raw = (
        "Do not use `mv` until we check.\n\n"
        "**Step 1: Check service file**\n"
        "`systemctl cat ollama.service`\n\n"
        "**Step 2: Check models**\n"
        "`ls -lh /usr/share/ollama/.ollama/models`\n\n"
        "**Step 3"
    )
    assert looks_like_truncated_plan(raw)
    assert not looks_like_truncated_plan("这台机器是 Debian 12。")


def test_looks_like_idle_plan_dump_repeated_intent() -> None:
    from app.llm.thinking import looks_like_idle_plan_dump, sanitize_assistant_content

    block = (
        "Wait, I'll just run the first command.\n\n"
        "Intent: 检查 Ollama 服务配置、当前用户主目录及模型目录内容 (Read-only)\n"
        'Command: echo "HOME=$HOME" && systemctl cat ollama && ls -l ~/lab/data\n\n'
    )
    raw = "Let's do this step-by-step to be safe.\n\n" + block * 5
    assert looks_like_idle_plan_dump(raw)
    assert sanitize_assistant_content(raw) == ""
    assert not looks_like_idle_plan_dump("这台机器是 Debian 12，内核 6.18。")


def test_looks_like_idle_plan_dump_helm_repeat() -> None:
    from app.llm.thinking import looks_like_idle_plan_dump, sanitize_assistant_content

    block = (
        "Let's check helm status.\n"
        "which helm\n"
        "helm version\n\n"
        "I'll run these.\n"
        "Then answer.\n\n"
        "I will check helm status.\n"
    )
    raw = block * 6
    assert looks_like_idle_plan_dump(raw)
    assert sanitize_assistant_content(raw) == ""


def test_response_echo_loop_keeps_first_answer() -> None:
    from app.llm.thinking import (
        StreamContentFilter,
        extract_first_user_answer,
        looks_like_response_echo_loop,
        sanitize_assistant_content,
    )

    ans = (
        "是的，**10.6.20.131** 目前有人使用。Ping 测试显示设备在线且响应正常"
        "（延迟约 0.17ms）。MAC 地址是 `e8:61:1a:03:b1:8b`。"
    )
    raw = (
        f"Response:\n{ans}\n\n"
        "This is sufficient. I will output the response.\n\n"
        "One detail: The user asked '10.6.20.131这个ip有人用吗'. "
        "I will answer '是的，有人用'. I will output the response.\n\n"
        f"Response:\n{ans}\n\n"
        "I will output the response.\n\n"
        "One last check: The user's query is '10.6.20.131这个ip有人用吗'. "
        "I will answer '是的，有人用'. I will output the response.\n\n"
        f"Response:\n{ans}\n"
    )
    assert looks_like_response_echo_loop(raw)
    out = sanitize_assistant_content(raw)
    assert "10.6.20.131" in out
    assert out.count("10.6.20.131") == 1
    assert "I will output" not in out
    assert "Response:" not in out
    assert extract_first_user_answer(raw).startswith("是的")

    f = StreamContentFilter()
    for i in range(0, len(raw), 37):
        f.feed(raw[i : i + 37])
    assert f.loop_detected
    final = f.finalize()
    assert "10.6.20.131" in final
    assert final.count("目前有人使用") == 1
    assert "I will output" not in final

    from app.llm.thinking import is_repetition_loop, StreamContentFilter

    raw = (
        "lscpu | grep -E \"Model name|Architecture|CPU(s)|Thread|Core|Socket\"\n"
        "free -h\n"
        "df -h /\n"
        "cat /etc/os-release | grep PRETTY_NAME\n"
        "lscpu | grep -E \"Model name|Architecture|CPU(s)|Thread|Core|Socket\"\n"
        "free -h\n"
        "df -h /\n"
        "cat /etc/os-release | grep PRETTY_NAME\n"
        "ps aux --sort=-%mem | head -n 10\n"
        "ps aux --sort=-%mem | head -n 10\n"
    )
    assert not is_repetition_loop(raw)
    f = StreamContentFilter()
    f.feed(raw)
    assert not f.loop_detected


def test_shell_script_dump_and_echo_loop() -> None:
    from app.llm.thinking import (
        is_command_dump_echo_loop,
        looks_like_shell_script_dump,
        StreamContentFilter,
    )

    block = (
        "我来检查主机上可能无效的大文件。\n"
        "# 检查已删除但仍被进程占用的文件\n"
        "lsof +L1 2>/dev/null | head -20\n\n"
        "# 检查孤立的大文件（超过100MB）\n"
        "find / -xdev -type f -size +100M -exec ls -lh {} \\; 2>/dev/null | "
        "sort -k5 -h -r | head -20\n\n"
        "# 检查核心转储文件\n"
        'find / -name "core*" -type f -size +10M 2>/dev/null | head -10\n\n'
        "# 检查孤立的大日志文件\n"
        'find /var/log -name "*.log" -type f -size +100M 2>/dev/null | head -10\n\n'
        "# 检查孤立的大备份文件\n"
        'find / -name "*.bak" -o -name "*.old" -type f -size +10M 2>/dev/null | head -10\n'
    )
    assert looks_like_shell_script_dump(block)
    # Dense paste without comment/blank lines (the live death-loop shape).
    dense = (
        "我来检查主机上可能无效的大文件。\n"
        "lsof +L1 2>/dev/null | head -20\n"
        "find / -xdev -type f -size +100M 2>/dev/null | head -20\n"
        'find / -name "core*" -type f -size +10M 2>/dev/null | head -10\n'
        'find /var/log -name "*.log" -type f -size +100M 2>/dev/null | head -10\n'
        'find / -name "*.bak" -type f -size +10M 2>/dev/null | head -10\n'
    )
    assert looks_like_shell_script_dump(dense)
    assert not is_command_dump_echo_loop(block)
    echoed = (block + "\n") * 3
    assert is_command_dump_echo_loop(echoed)
    f = StreamContentFilter()
    for i in range(0, len(echoed), 60):
        f.feed(echoed[i : i + 60])
    assert f.loop_detected


def test_short_command_preamble_still_not_echo_loop() -> None:
    from app.llm.thinking import is_command_dump_echo_loop, looks_like_shell_script_dump

    raw = (
        "lscpu | grep -E \"Model name|Architecture\"\n"
        "free -h\n"
        "df -h /\n"
        "lscpu | grep -E \"Model name|Architecture\"\n"
        "free -h\n"
        "df -h /\n"
    )
    assert not looks_like_shell_script_dump(raw)
    assert not is_command_dump_echo_loop(raw)


def test_closed_code_fence_not_truncated() -> None:
    from app.llm.thinking import looks_like_truncated_answer

    fenced = (
        "```json\n"
        "{\n"
        '  "name": "terminal_exec",\n'
        '  "arguments": {\n'
        '    "command": "systemctl stop teamviewer"\n'
        "  }\n"
        "}\n"
        "```"
    )
    assert not looks_like_truncated_answer(fenced)
    assert looks_like_truncated_answer("说明如下：`getting")


def test_extract_tool_calls_from_fenced_json() -> None:
    from app.llm.thinking import (
        extract_tool_calls_from_content,
        looks_like_tool_call_json_dump,
    )

    fenced = (
        "```json\n"
        "{\n"
        '  "name": "terminal_exec",\n'
        '  "arguments": {\n'
        '    "command": "systemctl stop teamviewer"\n'
        "  }\n"
        "}\n"
        "```"
    )
    recovered = extract_tool_calls_from_content(fenced)
    assert len(recovered) == 1
    assert recovered[0]["function"]["name"] == "terminal_exec"
    assert "systemctl stop teamviewer" in recovered[0]["function"]["arguments"]
    assert looks_like_tool_call_json_dump(fenced)
    # Incomplete dump still flagged (must not enter trunc-continue).
    assert looks_like_tool_call_json_dump(
        '```json\n{"name": "terminal_exec", "arguments": {"command":'
    )


def test_extract_bare_command_intent_args_as_terminal_exec() -> None:
    from app.llm.thinking import (
        extract_tool_calls_from_content,
        looks_like_tool_call_json_dump,
    )

    raw = (
        "find / -xdev -type f -size +100M -exec ls -lh {} \\; 2>/dev/null | sort -k5 -h\n"
        "```json\n"
        "{\n"
        '  "command": "find / -xdev -type f -size +100M | head",\n'
        '  "intent": "查找本地磁盘上大于 100MB 的大文件并按大小排序",\n'
        '  "timeout_seconds": 60\n'
        "}\n"
        "```"
    )
    recovered = extract_tool_calls_from_content(raw)
    assert len(recovered) == 1
    assert recovered[0]["function"]["name"] == "terminal_exec"
    assert "find /" in recovered[0]["function"]["arguments"]
    assert looks_like_tool_call_json_dump(raw)


def test_extract_xml_tool_call_markup() -> None:
    """Local models paste <tool_call><function=…> as content — must recover."""
    import json

    from app.llm.thinking import (
        extract_tool_calls_from_content,
        looks_like_tool_call_json_dump,
    )

    raw = (
        "<tool_call>\n"
        "<function=terminal_exec>\n"
        "<parameter=command>\n"
        "python3 -c \"from huggingface_hub import snapshot_download; "
        "snapshot_download('Qwen/Qwen-Image-2.1', "
        "local_dir='/home/user/lab/data/ComfyUI/models/diffusers/')\" 2>&1 | tail -20\n"
        "</parameter>\n"
        "<parameter=intent>\n"
        "用 Python API 下载 Qwen-Image-2.1 模型\n"
        "</parameter>\n"
        "<parameter=timeout_seconds>\n"
        "3600\n"
        "</parameter>\n"
        "</function>\n"
        "</tool_call>"
    )
    recovered = extract_tool_calls_from_content(raw)
    assert len(recovered) == 1
    assert recovered[0]["function"]["name"] == "terminal_exec"
    args = json.loads(recovered[0]["function"]["arguments"])
    assert "snapshot_download" in args["command"]
    assert "Qwen-Image-2.1" in args["intent"]
    assert args["timeout_seconds"] == 3600
    assert looks_like_tool_call_json_dump(raw)
    assert looks_like_tool_call_json_dump(
        "<tool_call>\n<function=terminal_exec>\n<parameter=command>\necho"
    )


def test_extract_xml_tool_call_unclosed_stream_cut() -> None:
    """Mid-stream cut before </function> must still recover command if present."""
    import json

    from app.llm.thinking import extract_tool_calls_from_content

    raw = (
        "<tool_call>\n"
        "<function=terminal_exec>\n"
        "<parameter=command>\n"
        "echo still-running\n"
        "</parameter>\n"
        "<parameter=intent>\n"
        "keep going"
    )
    recovered = extract_tool_calls_from_content(raw)
    assert len(recovered) == 1
    args = json.loads(recovered[0]["function"]["arguments"])
    assert args["command"] == "echo still-running"
    assert args["intent"] == "keep going"


def test_strip_tool_call_markup_drops_fenced_web_fetch_param_wall() -> None:
    from app.llm.thinking import strip_tool_call_markup

    raw = (
        "查价结果如下。\n\n"
        "```\n"
        "web_fetch\n"
        "url: https://example.com/gpu\n"
        "goal: 获取当前价格\n"
        "```\n\n"
        "大约一万。"
    )
    cleaned = strip_tool_call_markup(raw)
    assert "查价结果如下" in cleaned
    assert "大约一万" in cleaned
    assert "web_fetch" not in cleaned
    assert "example.com" not in cleaned


def test_strip_tool_call_markup_keeps_prose() -> None:
    from app.llm.thinking import strip_tool_call_markup

    raw = (
        "## 下载卡住了\n\n"
        "**你想怎么处理？**"
        "<tool_call>\n"
        "<function=terminal_exec>\n"
        "<parameter=command>\n"
        "kill -9 1\n"
        "</parameter>\n"
        "<parameter=intent>\n"
        "杀掉卡死的下载进程并确认\n"
        "</parameter>\n"
        "</function>\n"
        "</tool_call>\n\n"
        "<tool_call>\n"
        "<function=terminal_exec>\n"
        "<parameter=command>\n"
        "ps aux | grep x\n"
        "</parameter>\n"
        "<parameter=intent>\n"
        "检查下载进程是否还在\n"
        "</parameter>\n"
        "</function>\n"
        "</tool_call>"
    )
    cleaned = strip_tool_call_markup(raw)
    assert "下载卡住了" in cleaned
    assert "你想怎么处理" in cleaned
    assert "<tool_call>" not in cleaned
    assert "kill -9" not in cleaned
    assert "检查下载进程" not in cleaned


def test_prose_plus_two_xml_tools_recovers_both() -> None:
    import json

    from app.llm.thinking import extract_tool_calls_from_content, strip_tool_call_markup

    raw = (
        "**你想怎么处理？**<tool_call>\n"
        "<function=terminal_exec>\n"
        "<parameter=command>\nkill -9 1\n</parameter>\n"
        "<parameter=intent>\n杀掉\n</parameter>\n"
        "</function>\n</tool_call>\n"
        "<tool_call>\n"
        "<function=terminal_exec>\n"
        "<parameter=command>\nps aux\n</parameter>\n"
        "<parameter=intent>\n检查\n</parameter>\n"
        "</function>\n</tool_call>"
    )
    recovered = extract_tool_calls_from_content(raw)
    assert len(recovered) == 2
    assert "kill" in json.loads(recovered[0]["function"]["arguments"])["command"]
    assert "ps aux" in json.loads(recovered[1]["function"]["arguments"])["command"]
    assert "<tool_call>" not in strip_tool_call_markup(raw)
