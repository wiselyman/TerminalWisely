# DB catalog truncation + type display + drop duplicate SQL

## 要保住的旧行为

- Data-grid page size stays 100; user SELECT still capped by data `MAX_ROW_LIMIT` (500) unless raised separately
- Object tree / filter / insert / approval still work
- Ad-hoc query empty still shows `db-empty`
- Full suite passes

## 架构

- [`gate.rs`](src-tauri/src/db/gate.rs): `CATALOG_ROW_LIMIT` for search/structure (column-per-row catalogs)
- [`commands.rs`](src-tauri/src/db/commands.rs): `db_search_objects` / `db_search_structure` use catalog limit
- [`driver.rs`](src-tauri/src/db/driver.rs): `pg_cell` add `time` (+ other common types)
- [`DbWorkbench.tsx`](src/components/db/DbWorkbench.tsx): remove redundant `db-grid-sql` strip; keep pager

## 设计

1. Catalog search returns one row per column → 500 rows truncates mid-schema (共性问题). Catalog ops get a much higher limit.
2. `unsupported:time` → format as `HH:MM:SS[.fraction]`.
3. Grid bottom bar: pagination only (SQL already in editor).

## 任务

1. CATALOG_ROW_LIMIT + wire search/structure
2. pg_cell time (+ uuid/json if cheap)
3. Remove db-grid-sql; update e2e
4. Full suite
