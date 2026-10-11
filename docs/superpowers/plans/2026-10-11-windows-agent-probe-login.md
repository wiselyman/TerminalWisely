# Windows agent probe and browser login

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On Windows, guided CLI login opens the system browser, and the Agent picker stops flipping installed CLIs to the download icon.

**Architecture:** Path search and auth probes stay in `agent-sidecar/app/runtime/local_cli.py`. Login URL handling stays in `cli_login.py`. The picker keeps the last conclusive probe in `cursorRuntimeStatus.ts` and only opens a URL when the sidecar did not already open it.

**Tech Stack:** Python 3.12, Vitest, existing sidecar login tests.

## 要保住的旧行为

- macOS / Linux 仍由应用打开登录 URL（`NO_OPEN_BROWSER=1`），探测到已登录仍直接成功。
- 没装 CLI 时仍是 `install_needed`，不能选成回答的 Agent。
- 假运行时（`TW_AI_*_FAKE`）仍直接就绪。
- 空的 `status` 输出仍是 `login_needed`，不能当成已登录。

## 架构

安装位置与认证超时在 `local_cli.py`。登录子进程的环境和浏览器打开在 `cli_login.py`，响应增加 `open_browser`。前端合并探测结果在 `cursorRuntimeStatus.ts`，打开 URL 在 `guidedRuntimeLogin.ts`，失败文案和「不要把传输失败画成未安装」在 `AiEngineerPanel.tsx`。

## 设计

探测失败或认证命令超时：图标保持上一次的勾或钥匙；没有上一次时不显示下载图标。下载图标只表示确实没找到 CLI。Windows 上登录 URL 由 sidecar 用系统调用打开浏览器，按钮在失败后回到「登录」，提示仍是「登录失败，请重试。」

### Task 1

- [x] Failing tests for Windows bin dirs, UNC skip, auth timeout, UTF-16 login URL, and probe merge.
- [x] See those tests fail.
- [x] Implement the smallest fix and see the same tests pass.

### Task 2

- [x] `./scripts/run-all-tests.sh` passes.
