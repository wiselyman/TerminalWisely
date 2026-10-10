# Navicat 网格工具条对齐 + 插行/空页 UX

**Goal:** Match Navicat data-grid chrome: no empty-page “没有行”, filter-only pane (no sort), inline insert row, top/bottom toolbars aligned with SQL + pagination at bottom.

## 要保住的旧行为

- Filter funnel + Apply still rewrites WHERE; column-header sort/menu still work
- Insert still goes through write approval path (`rowInsertSql` / mutate)
- Workspace tabs / tree structure ops / Explain / Tools menu unchanged
- Ad-hoc SQL that returns zero rows still shows `db-empty` (e2e “SELECT empty”)
- `./scripts/run-all-tests.sh` passes

## 架构

- [`DbWorkbench.tsx`](src/components/db/DbWorkbench.tsx): clamp `turnPage`; hide `db-empty` for `tableView`; inline draft insert row in grid; split grid chrome into top icon bar + bottom SQL/pagination bar
- [`FilterSortPane.tsx`](src/components/db/FilterSortPane.tsx) → filter-only (drop sort UI/props); column headers remain sort entry
- [`App.css`](src/App.css): Navicat-like top/bottom grid bars
- Tests: e2e `db-workbench`, model if needed; `docs/TEST_MATRIX.md`

## 设计

1. **空页**：`tableView` 下 `next` 仅当本页行数 = page size；`prev` 仅当 page > 1；越界不跳转。表浏览空结果不显示「没有行」，只留空表头网格。
2. **筛选面板**：只保留筛选条件 + 应用；去掉排序区（排序走列头）。
3. **插行**：`+` 在网格顶部插入可编辑草稿行；单元格填值后点行内确认（或 Enter）提交，不再用表单条。
4. **工具条**：上方图标条（筛选 | +）；下方条左侧只读 SQL、右侧分页（上一页/页码/下一页），与底栏执行区视觉分离但同宽对齐。

## 任务

1. Clamp pagination + hide tableView empty copy — e2e/regression
2. Strip sort from filter pane — update e2e
3. Inline insert draft row — e2e assert grid row not `db-insert-row` form
4. Top/bottom grid chrome CSS + layout
5. Full suite

## 回归（2026-10-09）

对象表页签点「执行」曾 `run()` 清掉 `tableView`，顶栏退化成整行 client「筛选」输入且 `+` 消失。已：对象数据页签保留/恢复 browse chrome；插行列名回退到 `result.columns`。
