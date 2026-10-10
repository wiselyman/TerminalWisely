# Object pane counts + time cell picker

## 要保住的旧行为

- Object pane connection → DB → schema → tables navigation unchanged
- Cell edit still goes through `cellUpdateSql` / mutate / approval
- Catalog truncation fix remains
- Full suite passes

## 架构

- [`workbenchModel.ts`](src/components/db/workbenchModel.ts): `objectPaneSummary`, `cellEditorKind` / time value helpers
- [`DbWorkbench.tsx`](src/components/db/DbWorkbench.tsx): object-list footer count; tree kind label count; typed cell inputs
- i18n en/zh-CN shell
- Tests: workbenchModel + e2e object summary + time input type

## 设计

1. Object pane footer: `共 6 个 schema` / `共 54 张表` (`data-testid="db-object-summary"`)
2. Tree 「表」等 kind 节点显示 `(n)`
3. Edit time/date/timestamp cells with native `input type="time|date|datetime-local"` (clickable picker; not a custom clock face)

## 任务

1. Model helpers + unit tests
2. UI counts + cell editors
3. e2e + full suite
