# MCP 目录与聊天安装 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Settings lists common computer-use MCPs; Install sends an install brief to Home local chat so the agent installs and registers; users can also search the web in chat or add custom servers.

**Architecture:** Static catalog in the frontend builds a prompt string. Settings UI opens Home local chat and `sendMessage`s that prompt. Sidecar reads/writes `user_mcp.json` with optional `env`. Local system prompt adds generic search-and-install guidance without naming apps.

**Tech Stack:** React settings Modal, Vitest, Playwright, pytest, existing `ai_local_exec` / `terminal_exec`, `user_mcp.py`.

## Global Constraints

- No per-app hardcoding in agent-sidecar prompts/broker (`check-no-agent-hardcoding.mjs` PASS).
- Catalog is frontend static data only.
- Install never runs from the settings button; only via chat agent.
- UI reuses Modal / `app-settings-section` / `--tw-*`.

---

## 要保住的旧行为

- 打开设置不发起 SSH、不连集群、不连数据库。
- Home 本机聊天仍是 `local` scope；离开 Home 后主机/集群/数据库侧栏聊天不变。
- 未配置用户 MCP 时，Home 仍只有 `terminal_exec`、`web_search`、`web_fetch`、`ask_user`。
- 本机变更仍经 CommandBroker；远程命令仍只在已有 SSH 上 `exec_command_capture`。
- 主机列表不出现本地终端。

## 架构

| 文件 | 职责 |
|---|---|
| `src/lib/aiEngineer/mcpCatalog.ts` | 静态目录 + `buildMcpInstallPrompt` + 当前平台过滤 |
| `src/lib/aiEngineer/mcpCatalog.test.ts` | 提示文案与平台测试 |
| `src/lib/aiEngineer/userMcpConfig.ts` | 解析/合并/序列化 `user_mcp.json` |
| `src/lib/aiEngineer/userMcpConfig.test.ts` | 配置合并测试 |
| `src/lib/aiEngineer/api.ts` | `aiUserMcpGet` / `aiUserMcpSave` invoke |
| `src-tauri/src/ai_engineer/` + commands | 读写 sidecar 同路径的 `user_mcp.json` |
| `src/components/AppSettingsDialog.tsx` | MCP 目录 UI + 自定义表单 + Install→chat |
| `src/stores/aiEngineerStore.ts` | `sendLocalInstallPrompt(text)` |
| `agent-sidecar/app/runtime/user_mcp.py` | 支持 `env`；Popen 传入环境 |
| `agent-sidecar/app/agent/prompts.py` | 本机提示：可用 web 查找并安装 MCP、登记路径 |
| `e2e/settings-i18n.spec.ts` 或新 spec | 设置可见目录；Install 打开 Home 并出现提示文案 |

依赖方向：Settings → catalog prompt → store send → Home chat → agent → `terminal_exec` + 写配置文件。Sidecar 下一轮加载 `user_mcp.json`。

## 设计

- 设置 → 「MCP 工具」→ 列表（当前系统可装）→ 可选密钥字段 → 「安装」→ 关闭设置、Home 聊天发出安装说明 → Agent 装包并登记。
- 自定义行：名称 / command / args / env → 保存。
- 已登记：显示名称，可移除。
- 空目录区用现有 spacing；按钮在 section 内右下角风格的 actions 行。
- 文案 en + zh-CN `shell.json`。
- 聊天自助：本机提示允许用 `web_search` / `web_fetch` 查找公开 MCP，核对后经批准安装并登记。

## 任务

### Task 1: Catalog prompt builder

**Files:**
- Create: `src/lib/aiEngineer/mcpCatalog.ts`
- Create: `src/lib/aiEngineer/mcpCatalog.test.ts`

- [x] **Step 1:** Write failing tests for `buildMcpInstallPrompt` (mentions register path, command, and does not claim settings will install) and platform filter.
- [x] **Step 2:** Implement catalog entries + builder.
- [x] **Step 3:** Vitest pass.

### Task 2: user_mcp.json config helpers + Rust get/save

**Files:**
- Create: `src/lib/aiEngineer/userMcpConfig.ts` + test
- Modify: Rust commands + `api.ts`
- Modify: `user_mcp.py` for `env` + tests

- [x] **Step 1:** Failing tests for merge/remove and env load in Python.
- [x] **Step 2:** Implement helpers, Tauri get/save, Popen env.
- [x] **Step 3:** Tests pass.

### Task 3: Settings UI + send to local chat

**Files:**
- Modify: `AppSettingsDialog.tsx`, `aiEngineerStore.ts`, i18n, e2e, App.css only if needed for section density

- [x] **Step 1:** Failing unit or e2e: Install opens home-local-chat with install text.
- [x] **Step 2:** UI + `sendLocalInstallPrompt`.
- [x] **Step 3:** Tests pass.

### Task 4: Local prompt hint

**Files:**
- Modify: `agent-sidecar/app/agent/prompts.py`
- Modify: `agent-sidecar/tests/test_tw_mcp_tools.py`

- [x] **Step 1:** Failing assert local prompt mentions web_search for finding MCP servers and `user_mcp.json`.
- [x] **Step 2:** Add generic sentences (no Feishu/Chrome/Word names).
- [x] **Step 3:** Pytest pass.

### Task 5: Verify

- [x] `node scripts/check-no-agent-hardcoding.mjs`
- [x] `./scripts/run-all-tests.sh`
- [x] `docs/TEST_MATRIX.md` MCP 目录行
- [x] 设计文档 `docs/superpowers/specs/2026-10-11-mcp-catalog-install-design.md`
