# SSH Direct Connection Without Implicit Proxy

## 要保住的旧行为

- TW 使用保存的主机地址，通过直接 TCP SSH 完成密码或私钥认证；不因系统 SSH 的代理设置而擅自启动外部登录流程。
- 同一个 SSH transport 仍供终端、重连和 SFTP 文件传输使用。
- 普通连接仍保留 20 秒超时和最多 3 次尝试。
- SSH 最大 packet size 维持在 TCP packet 上限以内。

## 架构

- 共享连接入口仍是 `src-tauri/src/ssh/client.rs::connect_ssh_transport`。
- 移除自动读取和执行系统 `ProxyCommand` 的路径，直接使用 russh TCP transport。
- 保留 `ssh_client_config` 的 32 KiB packet 修复，不改会话和 tab 生命周期。
- 用本地 TCP listener 的 Rust 单测验证传输确实连接指定地址，且不执行配置中的代理命令。

## 设计

- 用户点击主机卡片后，TW 直接连接卡片上配置的主机和端口；连接中继续显示 connecting 状态。
- 密码/密钥认证成功后进入原终端界面，不启动浏览器。
- 连接失败沿用现有错误提示与临时 tab 清理行为。

## 任务

1. 给直接 TCP stream 写回归测试，测试在配置代理命令时仍能与本地 TCP listener 往返数据；先确认测试因启动代理命令而失败。
2. 移除系统 ProxyCommand 发现、展开及子进程 transport，恢复直接 TCP SSH transport；保留 20 秒/3 次直连策略和 packet-size 限制。
3. 运行 SSH Rust 单测、硬编码禁检和 `./scripts/run-all-tests.sh`。
