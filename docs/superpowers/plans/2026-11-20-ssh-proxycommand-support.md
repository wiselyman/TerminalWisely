# Honor configured SSH ProxyCommand

> **Superseded:** This automatic proxy behavior caused TW to start the system proxy's browser authentication flow for saved hosts. The user confirmed direct password SSH works in Terminal and expects TW to do the same. See [the follow-up plan](./2026-11-20-ssh-direct-connect-no-implicit-proxy.md); automatic ProxyCommand execution has been removed.

## 要保住的旧行为

- 没有配置 SSH 代理的主机仍通过当前 russh TCP transport 连接。
- 密码和私钥认证、终端 PTY、重连、文件传输仍共享同一 SSH 会话行为。
- 已有连接失败时清理临时 tab 并显示错误；成功连接时临时 tab 晋升为可交互 SSH tab。
- SSH channel packet size 不超过 TCP packet 上限，channel window 和 keepalive 行为保持不变。

## 架构

- `src-tauri/src/ssh/client.rs::connect_ssh_transport` 是所有 SSH transport 的共享入口，终端、重连和文件传输都经由此处。
- 在 Unix 平台通过系统 OpenSSH 的 `ssh -G` 读取当前主机和用户的有效 `ProxyCommand`，有配置时启动命令并把其 stdin/stdout 作为 russh 的双向 transport；没有配置时保留现有 TCP 连接。
- 对 `%h`、`%p`、`%r` 和 `%%` 做通用参数展开；不识别的占位符明确报错。主机值需要 shell quoting，不能拼出可执行注入。
- 代理 SSH 握手单独允许最多 5 分钟，以覆盖浏览器 SSO；代理模式失败不自动重试，避免重复触发登录流程。普通直连仍保持 20 秒超时和 3 次重试。
- 将子进程 transport 与命令解析拆成小型内部函数，并为配置解析、展开、安全 quoting 加 Rust 单元测试；不增加任何供应商/主机特判。
- 不改变前端 tab 管理或连接失败 UX。此缺陷根因在 SSH transport 不遵从系统代理配置。

## 设计

- 用户点击保存的 SSH 主机后，加载状态继续显示在临时 tab。
- 有系统 `ProxyCommand` 时，经该双向代理字节流完成 russh 握手及密码/私钥认证；连接成功后原 tab 保留并显示终端。
- 代理认证等待期间 tab 保持 connecting；代理失败或 5 分钟超时后显示现有错误并清理临时 tab。
- 无代理配置时直接 TCP 连接，界面行为与现有流程一致。
- 代理命令启动、握手或认证失败时，清除临时 tab，并在 toast 区显示现有连接错误；代理进程退出不会静默留下断开的 session。

## 任务

1. 为 `ssh -G` 输出解析和 `%h/%p/%r/%%` 安全展开添加会失败的 Rust 单测，先看到当前缺少代理解析/展开实现。
2. 添加有效 ProxyCommand 检测和 Unix 子进程双向 stream，连接无代理主机时维持原 TCP 路径。
3. 对代理连接进程生命周期及错误传播添加测试；运行 Rust 单测和硬编码禁检。
4. 运行 `./scripts/run-all-tests.sh`，确认已有连接、会话回滚、文件传输和跨平台构建检查通过。
