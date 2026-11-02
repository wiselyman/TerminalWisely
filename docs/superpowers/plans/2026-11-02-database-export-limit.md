# Database Export Limit Implementation Plan

**Goal:** Report CSV export truncation accurately when the row budget is reached.
**Architecture:** The filtered-export loop in `DbWorkbench.tsx` probes one extra row/page when the budget is reached, retaining at most 500 rows; errors flow to the active tab and busy state is reset. Playwright uses the existing Tauri mock to exercise the workflow. No split is needed for this focused change.
**Tech Stack:** TypeScript, Playwright.
**Spec:** `docs/superpowers/specs/2026-09-30-engine-matrix.md`

## 要保住的旧行为

- 本页导出仍只包含可见结果；不足 500 行的筛选导出仍包含全部查询结果。
- 筛选与排序继续应用于导出；导出最多 500 行。
- 切换请求后迟到的导出结果不下载。

## 架构

- `DbWorkbench.tsx` 管理分页、截断提示及错误；`src/e2e/tauriCoreMock.ts` 提供可控结果，`e2e/db-workbench.spec.ts` 验证 UI。
- 不更改驱动、查询审批或 CSV 格式。

## 设计

- 用户在打开的表上选择筛选导出；加载期间保留现有忙碌状态。成功时下载 CSV，超限时显示现有截断提示；失败时在当前标签显示错误并解除忙碌。

## 任务

1. 写 Playwright 测试：多于 500 行时只导出 500 行并显示截断提示；恰好 500 行不显示截断提示。先确认失败。
2. 实现额外探测并处理失败，运行对应测试。
3. 运行硬编码禁检和完整回归。
