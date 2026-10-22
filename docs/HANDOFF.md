# Codex 交接（2026-10-22）

当前目标按用户最新要求执行：本地运维回归为 Home 左侧本机交互式 Terminal（Windows 使用 PowerShell）、右侧聊天；删除其余未发布 0.0.7 功能。此前关于 Home 网页技能的交接方向已被用户明确替换。

实现计划：[`docs/superpowers/plans/2026-10-22-home-local-terminal-chat.md`](./superpowers/plans/2026-10-22-home-local-terminal-chat.md)。Home 复用本机聊天 scope 和 `AiEngineerPanel`。交互式本机终端使用 `portable-pty`，不新建 SSH 会话。原有主机、Kubernetes、数据库功能保留。

回归检查：

```bash
npm run test:e2e -- --grep "Home is a local terminal beside local chat"
cargo test local_terminal::tests --lib
node scripts/check-no-agent-hardcoding.mjs
./scripts/run-all-tests.sh
```

Windows PowerShell 真机路径需要 Windows 环境验证；不要把 Linux/macOS PTY 测试结果当成 Windows 真机验收。
