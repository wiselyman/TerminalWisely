# Navicat Filter & Sort + Insert Form Polish

**Goal:** Compact insert-row chrome; Navicat-like Filter & Sort pane above the data grid.

## 要保住的旧行为

- Opening DB sidebar does not auto-connect
- Workspace tabs / object·SQL inner tabs / tree context structure ops (incl. drop) still work
- Column-header click sort and ColumnHeaderMenu (asc/desc/clear/add filter) still work
- Insert / delete row / cell edit / approval still work
- `./scripts/run-all-tests.sh` passes

## 架构

- `src/components/db/DbWorkbench.tsx`: fix `db-insert-row`; funnel toggles Filter & Sort pane; remove primary global LIKE filter box
- New `src/components/db/FilterSortPane.tsx`: UI for filter/sort rules + Apply
- `src/components/db/workbenchModel.ts`: `filterRulesToWhere` / `sortRulesToOrder`; extend `tableViewSql` to accept structured rules
- CSS in `src/App.css`: insert form + pane at 12px
- Tests: `workbenchModel.test.ts`, `e2e/db-workbench.spec.ts`, `docs/TEST_MATRIX.md`

## 设计

1. Grid toolbar: funnel | prev | next | insert(+)
2. Pane open: Filter rows (`[✓] col | op | value`, `+`, and/or); Sort rows (`+` col + asc/desc); blue **应用筛选 & 排序**
3. Ops (SQL v1): `=` `!=` `<` `<=` `>` `>=` `contains` `begin with` `end with` `is null` `is not null`
4. Out of scope: brackets, text mode, Create Tool, profiles, cell context filter

## 任务

1. Insert form polish — 12px labels/inputs; button `db-action-btn` + insert label
2. Model — `filterRulesToWhere` / multi-sort ORDER BY; wire into loadTable
3. FilterSortPane + DbWorkbench — funnel, Apply; column「添加筛选」seeds rule and opens pane
4. TEST_MATRIX + `./scripts/run-all-tests.sh`
