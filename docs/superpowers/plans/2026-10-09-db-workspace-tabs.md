# DB 库级顶栏 + 对象/SQL 平行子页签

> 权威任务列表见 Cursor plan；本文件满足功能五段落盘。

## 要保住的旧行为

- 打开数据库侧边栏不发起连接；只有点击连接才连
- 左树仍按连接 → 库 → schema → 类型 → 对象展开；Object Pane 在未聚焦子页签时仍显示列表
- 表数据网格、单元格单击编辑、审批、导出导入、右键菜单、引擎能力差异仍可用
- E2E：先有库上下文再打开表 / 新建查询；跑 SQL 前仍可 `db-new-query`
- `node scripts/check-no-agent-hardcoding.mjs` 与 `./scripts/run-all-tests.sh` 通过

## 架构

- `src/stores/dbWorkspaceStore.ts`：顶栏库工作区 + 每库子页签
- `src/components/db/workbenchModel.ts`：`WorkbenchTab`（query | ObjectKind）
- `src/App.tsx`：Home 后渲染库页签
- `src/components/db/DbWorkbench.tsx`：开库 / 开对象 / 新建 SQL

## 设计

1. 点开库 → 顶栏 Home 右侧出现库页签
2. 打开表/视图/键/集合 → 内栏对象页签；`+` → SQL 页签，彼此平行
3. 关尽子页签 → Object Pane；关顶栏库页签 → 清该 workspace

## 任务

见计划 todos；每项先红测再实现。
