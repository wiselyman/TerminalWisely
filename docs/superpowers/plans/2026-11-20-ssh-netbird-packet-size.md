# SSH connection failure with strict packet-size servers

## 要保住的旧行为

- 使用密码认证或私钥认证成功后，SSH session 仍会晋升为正式 tab 并显示终端。
- SSH 连接失败时，临时 connecting tab 会被移除，并显示连接错误通知；失败不能留下不可操作的 session。
- 同一 SSH transport 配置继续供终端会话和独立文件传输连接复用。
- 终端窗口大小、keepalive 和 16 MiB channel window 配置保持有效。

## 架构

- SSH transport 配置位于 `src-tauri/src/ssh/client.rs::ssh_client_config`，终端和文件传输共用此配置。
- 在 `client.rs` 增加针对 packet size 配置的 Rust 单元回归测试，先验证当前 64 KiB 配置不符合 SSH transport 可接受范围，再调整配置。
- 不增加主机名、服务名或供应商特判；将 packet limit 设为协议/transport 安全范围内的通用值。
- 本次不改 session tab 生命周期；连接错误回滚是现有行为，修正 transport 后连接成功时 tab 应晋升并保留。

## 设计

- 用户点击已保存主机后，connecting tab 转为终端 tab，tab 保留且可交互。
- 加载期间仍显示 connecting 状态；连接成功显示终端；连接失败仍移除临时 tab，并在应用 toast 区显示错误。
- 不改变认证表单、主机列表或错误文案。

## 任务

1. 为 SSH client 配置添加 packet size 边界回归测试；先运行并确认当前 64 KiB 配置失败。
2. 将通用 SSH channel maximum packet size 调整到不会超过 TCP packet 边界的值；运行 Rust 单测确认通过。
3. 运行硬编码禁检与全量测试，核对 session tab 成功晋升和失败回滚相关测试。
