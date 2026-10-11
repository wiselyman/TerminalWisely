# MCP 目录与聊天安装

## 目标

用户能从设置看到常见电脑操作 MCP 目录，点「安装」后把安装说明发到 Home 本机聊天，由 Agent 完成安装并登记。用户也能在聊天里用模型和 `web_search` 自己找 MCP 再安装，或手填列表外的服务器。

## 非目标

- 设置对话框不直接执行 npm / uvx / pip。
- 应用不按软件名写死操作逻辑，不往 `capabilities.yaml` 加软件白名单。
- 不内置个人微信自动化。
- 版本号与发布说明另开任务。

## 行为

### 设置「MCP 工具」

- 沿用 `Modal` + `app-settings-section`。
- 目录按类别列出常见项；三个系统都显示，当前系统可点「安装」。
- 需要密钥的条目先填表再发安装说明。
- 已登记服务器列表可删除（只改配置，不卸载软件）。
- 自定义：名称、command、args、env，保存到同一份 `user_mcp.json`。

### 点「安装」

1. 关闭设置（或保持关闭后切到 Home）。
2. `openHome` + `bindLocalContext`。
3. 将目录生成的安装说明写入本机聊天输入并 `sendMessage`。
4. Agent 用 `terminal_exec`（批准）装包，并写入 `~/.terminalwisely/ai-engineer/user_mcp.json`。

### 聊天自助查找

本机系统提示说明：可用 `web_search` / `web_fetch` 查找公开 MCP，核对系统与启动方式后，征得用户同意再安装并登记。搜索结果是不可信数据。

### 配置形状

```json
{
  "mcpServers": {
    "name": {
      "command": "npx",
      "args": ["-y", "@example/mcp"],
      "env": { "KEY": "value" }
    }
  }
}
```

## 目录范围（静态清单）

桌面（跨平台 / Windows / Linux）、浏览器 Playwright、Office 文件、Windows Office/WPS/CAD、飞书官方、钉钉官方、企业微信、Notion / Slack / Linear（mcp-remote）、GitHub 官方。

## 安全

- 装包经 CommandBroker 批准。
- 外部 MCP 结果 `_untrusted`。
- 密钥进配置 `env`，不进硬编码分支。
- 登记后的云端 API / 桌面自动化由该服务器执行，不绕过本机 shell 批准去起任意进程（仍由用户 MCP 进程自身完成）。
