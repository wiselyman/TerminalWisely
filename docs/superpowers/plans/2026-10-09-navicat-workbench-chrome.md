# Navicat 风格工作台收口（面包屑 + 底栏）

## 要保住的旧行为

- 打开数据库侧边栏不发起连接；只有点击连接才连
- 库顶栏页签、对象/SQL 平行子页签、左树层级、Object Pane 列表仍可用
- 表网格编辑、审批、导出/导入/建表/命名查询、会话/锁/容量、Explain 能力仍在（仅入口挪走）
- 顶栏 AI 工具条仍可进 `engineer_mode=db`（底栏不再有「打开 AI」）
- `node scripts/check-no-agent-hardcoding.mjs` 与 `./scripts/run-all-tests.sh` 通过

## 架构

- [`src/components/db/DbWorkbench.tsx`](../../src/components/db/DbWorkbench.tsx)：删 `db-context-bar`；结果区去掉 Summary/Plan 页签；底栏只留执行/取消/执行计划；其余进 `db-tools-menu`
- [`src/App.css`](../../src/App.css)：工具菜单样式
- e2e [`e2e/db-workbench.spec.ts`](../../e2e/db-workbench.spec.ts)：改断言走新入口
- i18n：必要时补「工具」文案

## 设计

1. 开库 / Object Pane：无 `postgres → …` 面包屑
2. 开表或 SQL：结果区只有数据；底栏三键 +「工具」
3. 工具 → 导出/导入/建表/命名查询/会话锁容量
4. 「执行计划」→ 结果区显示计划；再「执行」回到网格

## 任务

1. 面包屑：e2e `db-context` 不存在；删 context bar
2. 结果区：无 summary/plan 页签；Explain 后 `db-plan`；Run 回网格
3. 工具菜单：经 `db-tools-menu` 打开再点原控件
4. TEST_MATRIX + 全量测试
