# Cursor 与 Claude Code 的 MCP 集成

## 要保住的旧行为

- 打开数据库侧边栏不发起连接。
- Codex 启动参数仍包含 `-c mcp_servers.terminalwisely.command` 与 `.args`，提示词仍是 argv 最后一项。
- Cursor 启动仍带 `--approve-mcps` 与 `--trust`，且不带 `--stream-partial-output`。
- Claude Code 启动仍带 `--mcp-config <tw_mcp.json>` 与 `--strict-mcp-config`，写模式权限仍是 `bypassPermissions`。
- 已有的 `~/.cursor/mcp.json` 里其他 MCP 服务器原样保留。

## 架构

- 配置仍由 `agent-sidecar/app/runtime/cli_host.py` 的 `write_tw_mcp_config` 写出。
- Claude 只认 `--mcp-config` 指向的 `tw_mcp.json`（`--strict-mcp-config` 会忽略用户目录和项目 `.mcp.json`）。服务器条目必须带 `type: stdio` 与 `alwaysLoad: true`，否则打印模式不在回合开始时拉起该 server。
- Cursor CLI 没有 `--mcp-config`。它读 `<workspace>/.cursor/mcp.json`，以及用户目录 `~/.cursor/mcp.json`。临时工作区若被当成别的 git 根，项目文件会被跳过，所以同一份 server 还要合并进用户文件里的 `terminalwisely` 键。
- 不改 CommandBroker / 能力表。

## 设计

- 用户选 Cursor 或 Claude Code 发一条消息时，该进程的工具列表里有 server `terminalwisely`（`terminal_exec`、`web_search`、`web_fetch`、`ask_user`、`k8s_*`）。
- 配置写失败时仍启动 CLI；用户目录里的 Cursor 配置若不是合法 JSON，则不覆盖，只写工作区文件。

## 任务

1. 失败测试：`tw_mcp.json` 的 `terminalwisely` 含 `type=stdio` 与 `alwaysLoad=true`；工作区有 `.mcp.json`；`HOME/.cursor/mcp.json` 合并进 `terminalwisely` 且保留原有 server。
2. 实现 `write_tw_mcp_config` 的上述写出。
3. pytest 通过后跑 `./scripts/run-all-tests.sh`。
