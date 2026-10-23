# Home Terminal 灰色内衬修正计划

## 要保住的旧行为

- Home 终端仍铺满左侧工作区，终端与聊天之间的可调分隔条位置和行为不变。
- Home 的多个 Terminal 页签仍各自占满同一终端区域，切换页签和 PTY 生命周期不变。
- Hosts、Kubernetes、Databases 的终端留白和边框样式不受影响。

## 架构

- `src/App.css`：只调整 `.home-local-terminal` 的内边距，避免露出终端区域的灰色底色。
- `src/lib/chromeContract.test.ts`：扩展 Home 终端样式契约，确保 Home Terminal 不再有灰色内衬。

## 设计

- Home Terminal 内容从终端面板边缘开始，移除终端四周的 8px 灰色间隙。
- 继续复用当前 Home 双栏壳和可拖动分隔条；不新增界面元素或交互状态。

## 任务

1. [x] 测试：为 Home Terminal 增加无内衬的 CSS 契约断言，先运行并确认当前规则失败。
2. [x] 实现：移除 Home Terminal 容器的 8px 内边距。
3. [x] 验证：运行 chromeContract 单测、相关 Home Playwright 和全量测试。
