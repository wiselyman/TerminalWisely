# Home Terminal Tab and Desktop App Label

## 要保住的旧行为

- Home 的每个 Terminal 页签仍选择对应的本机 PTY；切换页签不会创建 SSH 会话，也不会销毁 PTY。
- Home 聊天按钮仍能在 Home Terminal 与聊天面板间切换，并保留聊天草稿。
- 点击 Home Desktop 入口仍显示本机 Desktop；切回 Home Terminal 后，终端仍显示在工作区。
- Desktop 图标仍显示完整的本地化应用名称，点击图标仍能打开或聚焦对应应用。

## 架构

- `src/App.tsx`：Home Terminal 页签的选中处理；点击时选择该 PTY、关闭 Home Desktop 表面并收起 Home 聊天。
- `src/components/desktop/DesktopIcons.tsx` 与 `src/styles/desktop.css`：桌面图标标签提供完整文本和适配长度的换行空间。
- `e2e/home-local-terminal-chat.spec.ts`：覆盖终端页签切回本机 Terminal 和 MarkWisely 标签完整显示。
- `docs/TEST_MATRIX.md`：记录 Home Terminal/Desktop 切换及桌面图标标签回归覆盖。
- 不新增依赖，不修改后端接口或数据存储。

## 设计

- 用户在 Home Desktop 或聊天面板显示时点击 Terminal 页签，立即选中该页签、退出 Desktop 并收起聊天，显示对应本机 Terminal。
- Desktop 图标下方始终展示完整应用名称；名称过长时可在图标下方换行，不以省略号截断。
- 成功通过界面状态体现；当前 PTY 或 Desktop 状态异常时保持现有错误处理，不增加新提示。

## 任务

- [x] 先添加 Playwright 回归：从 Home Desktop 点击 Terminal 页签后 Desktop/聊天隐藏且终端可见；MarkWisely 桌面图标标签完整显示。
- [x] 运行目标 Playwright 用例，确认新断言先失败。
- [x] 实现页签切换行为和桌面图标标签换行样式。
- [x] 更新测试矩阵并运行目标回归、硬编码检查和全量测试。
