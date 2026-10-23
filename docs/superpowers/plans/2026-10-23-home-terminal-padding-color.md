# Home Terminal 内边距背景一致性修复

## 要保住的旧行为

- Home Terminal 提示符与输出仍与容器左边缘保留至少 12px 内边距，切换终端标签和窗口缩放后仍可正常显示。
- 浅色和深色主题下，xterm 终端画布继续分别使用 `#ffffff` 和 `#0d1117`。
- Home 聊天、分栏尺寸、会话状态和其他空间行为保持不变。

## 架构

- `src/styles/tokens.css`：声明 Home 终端背景主题令牌，与 `terminalThemeFor` 的终端画布颜色一致。
- `src/styles/home.css`：仅将 `.home-local-terminal` 的 padding 区域背景绑定到终端背景令牌；保留现有 12px 内边距。
- `e2e/home-local-terminal-chat.spec.ts`：在浅色和深色主题断言 padding 容器与终端画布背景一致；不改终端生命周期或 FitAddon。

## 设计

- Home 启动后，提示符四周保留原有间距；间距区域与终端画布同色，不出现浅灰/深色边框感色带。
- 主题切换时由主题令牌更新底色。加载、成功、失败状态和提示文案均不变。

## 任务

- [x] 在 Playwright 测试中断言 Home Terminal padding 区域浅色为 `rgb(255, 255, 255)`、深色为 `rgb(13, 17, 23)`，并确认内边距不小于 12px；运行测试确认旧实现因 `--tw-bg` 背景色不匹配而失败。
- [x] 在 `tokens.css` 增加浅色/深色终端背景令牌，在 `home.css` 用该令牌绘制 padding 区域；运行定向 Playwright 和相关 Vitest。
- [x] 运行硬编码检查和 `./scripts/run-all-tests.sh`，确认通过后将改动提交并推送 `main`。

## 验收记录

- RED：定向 Playwright 复现浅色 padding 区为 `rgb(248, 250, 252)`，与预期终端白色不同。
- GREEN：修复后两种主题背景断言与 12px padding 均通过；Home 分栏全量 E2E 通过。
- `node scripts/check-no-agent-hardcoding.mjs`、`git diff --check` 通过。
- `./scripts/run-all-tests.sh`：全部自动化检查通过；Vitest 571 项，Sidecar 502 项（3 项跳过），Playwright 95 项。
