# Database SQL Literal Safety Implementation Plan

**Goal:** Preserve string data and safely encode SQL text for supported engine dialects in grid edits and CSV imports.
**Architecture:** Centralize engine-aware SQL string serialization in `workbenchModel.ts`; callers already know the engine. Existing approval remains authoritative and receives the generated statement. Tests exercise representative quotes, backslashes, Unicode and numeric-looking text. No file split is needed for the focused helper.
**Tech Stack:** TypeScript, Vitest, SQLite Rust tests, Playwright.
**Spec:** `docs/superpowers/specs/2026-09-30-engine-matrix.md`

## 要保住的旧行为

- 数字、布尔值和 NULL 按其实际类型表达；普通文本保留原值。
- 单元格编辑、插入、删除和 CSV 导入仍通过现有审批链；筛选与对象定义查询仍有效。
- 支持的 SQL 引擎生成符合各自方言的字符串字面量。

## 架构

- `src/components/db/workbenchModel.ts` 的 SQL 生成器使用一个带引擎参数的字符串编码器；`workbenchModel.test.ts` 验证各入口；`src-tauri/src/db/sql_risk.rs` 验证生成语句可经风险分类器处理。
- MySQL/MariaDB 的字符串用 UTF-8 十六进制形式表达，避免反斜杠模式差异；PostgreSQL 使用明确的转义字符串；其他引擎采用标准引号转义。
- 保持现有驱动与审批接口；真实数据库环境不可用时明确记录未验证引擎。

## 设计

- 编辑、筛选、导入和查看定义的点击路径及加载、审批、成功、失败文案不变；用户输入的文本值保持原样。

## 任务

1. 先写包含反斜杠、引号、非 ASCII、数字文本的 SQL 生成失败测试并确认失败。
2. 实现按引擎编码并接入各 SQL 值生成入口；运行单元、风险分类器和界面回归。
3. 运行硬编码禁检及完整测试，记录真实数据库覆盖。
