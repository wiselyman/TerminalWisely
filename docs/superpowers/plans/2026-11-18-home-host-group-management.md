# Home 主机与分组管理计划

## 要保住的旧行为

- 点击主机卡片仍打开该主机的 Desktop 页签；拖动主机调整分组或顺序时不打开连接。
- 编辑主机继续使用现有保存连接表单与持久化更新流程；删除主机只删除所选保存连接。
- 分组和主机排序继续由 hosts entity layout 持久化；删除自定义分组后，该组主机进入 Ungrouped。
- Ungrouped 不可删除；拖放在同组内继续支持主机排序，跨组时整张分组内容区域都可作为投放目标。

## 架构

| 职责 | 文件 |
|---|---|
| Home 分组、主机卡片操作与拖放目标标记 | `src/components/home/HomeHostDirectory.tsx`, `src/styles/home.css` |
| 复用保存主机编辑/删除表单和命令 | `src/components/ConnectionPanel.tsx`, `src/App.tsx` |
| 分组新建、改名、删除及持久化 | `src/App.tsx`, `src/stores/entityLayoutStore.ts`（复用现有 API） |
| 大范围拖放命中且保留同组排序 | `src/lib/entityPointerReorder.ts` |
| 持久化与交互回归 | `src/components/home/HomeHostDirectory.test.ts`, `e2e/home-host-directory.spec.ts`, `src/e2e/tauriCoreMock.ts` |

依赖方向：Home 组件通过回调请求主机和分组操作；App 将操作委托给 ConnectionPanel 暴露的既有保存主机入口及 entity layout store；通用拖放工具只读取 DOM 标记，不依赖 Home 组件。新增分组时放在分组列表末尾；删除分组复用 store 的移入 Ungrouped 语义。

## 设计

- 每个分组以有边界和浅色底的独立面板呈现，标题、计数和分组操作有清晰层级。分组主体（标题、空状态、卡片区域）都能接收跨组拖放；组内已有主机卡片仍用于 before/after 排序。
- 页面顶部显示“新建分组”。点击后创建默认命名分组；标题编辑按钮进入行内重命名，保存后更新，取消恢复旧名。删除分组直接删除并将组内主机移至 Ungrouped。
- 每张主机卡片提供编辑和删除按钮。编辑打开现有连接编辑表单；删除后该卡片从 Home 消失。删除操作使用已有保存连接删除流程。
- 分组或主机加载时维持现有目录加载反馈；空分组仍显示可投放的空态；主机删除、分组删除后界面按持久化结果更新。

## 任务

### 任务 1：分组区分和宽区域拖放

- [x] 先增加拖放命中回归测试，覆盖空分组主体与另一分组卡片区域；同组仍优先主机 before/after 排序。
- [x] 运行相关测试，确认拖到空分组主体的场景失败。
- [x] 扩展分组 DOM drop 标记和通用 target 解析，并加强分组面板样式。
- [x] 重跑组件与现有拖放测试。

### 任务 2：主机编辑和删除

- [x] 先增加主机卡片操作和 E2E 回归用例；确认编辑入口不可见/删除入口不可见时用例失败。
- [x] 运行新增用例确认入口缺失时失败。
- [x] 从 ConnectionPanel 注册复用的编辑/删除操作，Home 卡片增加操作按钮并保留主卡片点击打开 Desktop。
- [x] 重跑 Home 组件及 E2E 主机操作用例。

### 任务 3：分组新建、改名与删除

- [x] 先增加创建分组、删除分组后主机转入 Ungrouped 的 E2E 用例并确认失败。
- [x] 运行新增用例确认新建入口缺失时失败。
- [x] 在 Home 接入已有 entity layout store 的 add/rename/delete API；Ungrouped 不显示删除/改名操作。
- [x] 重跑分组管理 E2E 和布局 store 测试。

### 任务 4：回归和文档

- [x] 更新对应 TEST_MATRIX 行并扩展 Home 静态 wiring 检查。
- [x] 运行 `node scripts/check-no-agent-hardcoding.mjs`、`npm run test:smoke` 与 `./scripts/run-all-tests.sh`；全量通过。
- [x] 运行 Home 分组和主机操作 Playwright 路径及完整 133 项 E2E；提交前按仓库规定核对并提交 `main`。
