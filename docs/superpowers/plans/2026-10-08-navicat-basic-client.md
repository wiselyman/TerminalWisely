# 0.0.5 Navicat 运维基本客户端对齐

> 对照：[Navicat 18 Windows Manual](https://www.navicat.com/manual/online_manual/en/navicat_18/win_manual/)。档 1：运维基本客户端。不做 Table Designer / Query Builder / Model / BI / 结构同步。

**Goal:** 补齐对象右键、重命名、Empty vs Truncate、选区执行（已有则加回归）、单元格置 NULL，并写 Navicat 基本层对照矩阵。

## 要保住的旧行为

- 打开侧栏不自动连接；保存后不自动连接；只有点击才连接。
- 连接失败保持折叠；标题后 hint；结果区无连接错误块。
- 引擎选择器图标与 accessible name。
- 双击表、排序筛选分页、插入删行、CSV、命名查询、Explain、会话/锁/大小、写审批。
- 硬编码禁检；不为单引擎开 capabilities 白名单。

## 架构

- 缺口矩阵：`docs/superpowers/specs/2026-09-30-engine-matrix.md`「Navicat 18 基本层对照」。
- SQL：`workbenchModel.ts` 增加 `renameObjectSql`、`emptyTableSql`；选区执行沿用 `statementToRun` / `chosenSql`。
- UI：`ObjectContextMenu.tsx`；`DbWorkbench` 挂树节点；单元格 NULL 走 `cellUpdateSql(..., null)`。

## 设计

1. 对象树右键：打开 / 定义 / 重命名 / Empty / Truncate / 刷新。
2. 重命名内联输入，审批后刷新对象列表。
3. 有选区时运行选区；无选区整段。
4. 可编辑格可置 NULL（字面量 NULL，不是空串）。

## 任务

见 Cursor 计划 todos；每项先红测再实现。
