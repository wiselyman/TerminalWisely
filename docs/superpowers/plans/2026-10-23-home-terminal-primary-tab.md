# Home 首个 Terminal 固定页签计划

## 要保住的旧行为

- Home 始终至少保留一个本机 Terminal，`+` 新建的后续终端仍可切换和关闭。
- 每个 Home Terminal 的 PTY 独立运行；关闭可关闭页签只结束对应 PTY。
- Home 聊天、双栏分隔条及 Hosts/Kubernetes/Databases 的既有行为保持不变。

## 架构

- `src/App.tsx`：以 Home 终端列表第一项作为固定主终端，不渲染其关闭按钮，并拒绝移除该项。
- `src/App.homeTab.test.ts`、`e2e/home-local-terminal-chat.spec.ts`：验证首项不可关闭及后续页签可关闭，复用当前 Home tab 壳。

## 设计

- Home 第一个 Terminal 页签没有关闭按钮，用户不能关闭它。
- 第二个及之后的页签继续显示关闭按钮；关闭后回到相邻可用终端，固定主终端始终保留。

## 任务

1. [x] 测试：更新静态和 Playwright 断言，验证第一个页签没有关闭控件、后续页签可关闭；先运行并确认失败。
2. [x] 实现：隐藏首个页签的关闭按钮，并在关闭回调中保护首项。
3. [x] 验证：运行 Home 相关 Vitest/Playwright、硬编码禁检和全量测试。
