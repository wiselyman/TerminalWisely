# Database Pagination Implementation Plan

**Goal:** Make table browsing use valid pagination syntax for each supported SQL engine.
**Architecture:** Generate dialect-specific pagination in the existing pure `tableViewSql` helper; the workbench and Rust drivers continue to execute the generated statement. No file split is needed for this small change.
**Tech Stack:** TypeScript, Vitest, Playwright, Rust database drivers.
**Spec:** `docs/superpowers/specs/2026-09-30-engine-matrix.md`

## 要保住的旧行为

- PostgreSQL、MySQL、MariaDB 和 SQLite 的表浏览仍使用原有 LIMIT/OFFSET，筛选和排序保持有效。
- 表格分页仍以每页 100 行计算偏移；用户指定的排序保持优先。
- 打开表格仍通过现有查询与审批路径，错误显示在当前标签。

## 架构

- `src/components/db/workbenchModel.ts` 负责 SQL 方言；`workbenchModel.test.ts` 验证输出。
- SQL Server 的 OFFSET/FETCH 必须有 ORDER BY；未指定排序时使用常量排序。Oracle 使用 OFFSET/FETCH。
- 不改驱动和审批链；真实服务器验证单独记录环境限制。

## 设计

- 用户打开表、排序或翻页的点击路径和现有文案不变。加载及查询失败仍显示在当前工作区，成功显示结果网格。

## 任务

1. 在 `workbenchModel.test.ts` 添加 SQL Server 与 Oracle 首、后页及排序断言，先运行并确认失败。
2. 修改 `tableViewSql` 生成对应方言，运行单元测试确认通过，再运行硬编码检查。
3. 运行数据库 Playwright 和 `./scripts/run-all-tests.sh`，记录真实引擎未覆盖情况。
