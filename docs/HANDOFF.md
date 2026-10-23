# Codex 交接（2026-10-23）

当前 Home 目标：本机交互式 Terminal（Windows 使用 PowerShell）+ 右侧聊天；左侧空间导航顺序 Home、Hosts、Kubernetes、Databases。Home 隐藏整个左侧目录区域，Terminal 从内容区最左边开始；标题栏保留空间入口。点击 Hosts/Kubernetes/Databases 离开 Home 并显示各自侧栏目录。其余未发布 0.0.7 功能已删除。此前关于 Home 网页技能的交接方向已被用户明确替换。

实现计划：[`docs/superpowers/plans/2026-10-22-home-local-terminal-chat.md`](./superpowers/plans/2026-10-22-home-local-terminal-chat.md)。Home 复用本机聊天 scope 和 `AiEngineerPanel`。交互式本机终端使用 `portable-pty`，不新建 SSH 会话。原有主机、Kubernetes、数据库功能保留。

回归检查：

```bash
npm run test:e2e -- --grep "Home is a local terminal beside local chat"
cargo test local_terminal::tests --lib
node scripts/check-no-agent-hardcoding.mjs
./scripts/run-all-tests.sh
```

Windows PowerShell 真机路径需要 Windows 环境验证；不要把 Linux/macOS PTY 测试结果当成 Windows 真机验收。

Home 全宽终端布局计划：[`docs/superpowers/plans/2026-10-22-home-terminal-full-left.md`](./superpowers/plans/2026-10-22-home-terminal-full-left.md)。Home 下隐藏侧栏视觉区域并让终端从内容区 x=0 开始；保留 `ConnectionPanel` 的 DB portal host，确保其他空间切换后数据库目录恢复。最新全量自动化测试已通过。


最新目标：Home 和其他空间都不显示独立 Home 页签，Home 仅通过空间导航按钮访问；Home 终端/聊天分隔条可拖动和键盘调整，比例范围 20%–80% 并持久化。最新 `./scripts/run-all-tests.sh` 全量通过（84 Playwright、502 Sidecar）。计划：[`docs/superpowers/plans/2026-10-23-home-tab-resizable-split.md`](./superpowers/plans/2026-10-23-home-tab-resizable-split.md)。
