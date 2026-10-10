import { describe, expect, it } from "vitest";
import {
  ENGINE_PORTS,
  OFFERED_ENGINES,
  buildObjectTree,
  cellUpdateSql,
  connectionMatchesFilter,
  createTableSql,
  csvInsertBatches,
  csvInsertSql,
  definitionSql,
  dropTableSql,
  emptyTableSql,
  filterGridRows,
  formatDbFormError,
  shortDbFormError,
  forgetSavedQueries,
  freshQueryTab,
  freshObjectTab,
  findObjectTab,
  objectTabOrigin,
  objectTabTitle,
  nextSqlTabTitle,
  browseConnection,
  browseDatabase,
  browseKind,
  browseSchema,
  kindSchemas,
  maintainSql,
  objectPaneCrumbs,
  objectPaneRows,
  objectPaneSummary,
  objectPaneVisibleColumns,
  cellEditorKind,
  cellEditorValue,
  cellEditorInputType,
  cellUsesDateTimePicker,
  cellEditorKindFromValue,
  resolveCellEditorKind,
  workspaceId,
  mongoDeleteCommand,
  mongoInsertCommand,
  mongoReplaceCommand,
  objectKinds,
  objectMenuActions,
  objectsIn,
  mongoAuthDatabase,
  parseMongoJson,
  readSavedQueries,
  redisAuthMode,
  redisDelCommand,
  redisExpireCommand,
  redisPersistCommand,
  redisSetCommand,
  rememberQuery,
  renameObjectSql,
  resultPresentation,
  rowDeleteSql,
  rowInsertSql,
  rowsToCsv,
  sampleFieldNames,
  schemaNames,
  schemasFirst,
  tableDefinitionFromColumns,
  tableGroups,
  tableViewSql,
  sqlDiffersFromTableBrowse,
  filterRulesToWhere,
  sortRulesToOrder,
  truncateTableSql,
  orderDatabases,
  pageWindow,
  previewCsvImport,
  tableDataSql,
  tableSelectSql,
  tabsAfterConnectionSwitch,
  writeSavedQueries,
  type FilterRule,
  type QueryStore,
  type SortRule,
} from "./workbenchModel";

describe("database workbench model", () => {
  it("groups schema, tables, views, and routines", () => {
    const tree = buildObjectTree(
      [
        ["public", "orders", "id", "integer", "BASE TABLE"],
        ["public", "orders", "name", "text", "BASE TABLE"],
        ["public", "order_view", "id", "integer", "VIEW"],
        ["public", "touch_order", "", "FUNCTION", "ROUTINE"],
      ],
      "",
    );
    expect(tree.map((node) => `${node.kind}:${node.name}`)).toEqual([
      "table:orders",
      "view:order_view",
      "routine:touch_order",
    ]);
    expect(tree[0].columns).toEqual([
      { name: "id", type: "integer", key: false },
      { name: "name", type: "text", key: false },
    ]);
    expect(tableGroups("postgres", "table")).toEqual([
      "field",
      "index",
      "foreign_key",
      "unique",
      "check",
      "exclusion",
      "rule",
      "trigger",
    ]);
    expect(tableGroups("mariadb", "table")).toEqual(["field", "index", "foreign_key", "check", "trigger"]);
    expect(tableGroups("mysql", "table")).toEqual(["field", "index", "foreign_key", "check", "trigger"]);
    expect(tableGroups("postgres", "view")).toEqual(["field"]);
    expect(tableGroups("sqlite", "table")).toEqual(["field"]);
    expect(tableGroups("redis", "key")).toEqual([]);
    const keyed = buildObjectTree(
      [
        ["public", "orders", "id", "bigint", "BASE TABLE", "PRI"],
        ["public", "orders", "label", "text", "BASE TABLE", ""],
        ["public", "orders", "orders_label_idx", "", "INDEX"],
      ],
      "",
    );
    expect(keyed.map((node) => `${node.kind}:${node.name}`)).toEqual(["table:orders"]);
    expect(keyed[0].columns).toEqual([
      { name: "id", type: "bigint", key: true },
      { name: "label", type: "text", key: false },
    ]);
    expect(keyed[0].members).toEqual([{ group: "index", name: "orders_label_idx", detail: "" }]);
    expect(kindSchemas(tree, "table")).toEqual(["public"]);
    expect(schemasFirst("postgres")).toBe(true);
    expect(schemasFirst("mysql")).toBe(false);
    expect(schemasFirst("sqlserver")).toBe(true);
    expect(schemasFirst("oracle")).toBe(true);
    expect(objectKinds("postgres")).toEqual(["table", "view", "materialized_view", "routine"]);
    expect(objectsIn(tree, "view", null).map((node) => node.name)).toEqual(["order_view"]);
    expect(objectsIn(tree, "table", "public").map((node) => node.name)).toEqual(["orders"]);
    const withMatview = buildObjectTree(
      [
        ["public", "orders", "id", "integer", "BASE TABLE"],
        ["public", "daily", "id", "integer", "MATERIALIZED VIEW"],
        ["analytics", "roll", "id", "integer", "MATERIALIZED VIEW"],
      ],
      "",
    );
    expect(schemaNames(withMatview)).toEqual(["analytics", "public"]);
    expect(objectsIn(withMatview, "table", "public").map((node) => node.name)).toEqual(["orders"]);
    expect(objectsIn(withMatview, "materialized_view", null).map((node) => node.name)).toEqual(["daily", "roll"]);
    expect(objectsIn(withMatview, null, "public").map((node) => `${node.kind}:${node.name}`)).toEqual([
      "table:orders",
      "materialized_view:daily",
    ]);
    // Navicat Object Pane: connection → DBs; PG database → schemas; schema → tables only
    const conn = browseConnection();
    expect(objectPaneCrumbs("postgres", conn)).toEqual(["postgres"]);
    expect(objectPaneRows(conn, ["saad2", "app"], withMatview).map((row) => row.name)).toEqual([
      "saad2",
      "app",
    ]);
    expect(objectPaneVisibleColumns(objectPaneRows(conn, ["saad2", "app"], withMatview))).toEqual({
      schema: false,
      kind: false,
    });
    const dbBrowse = browseDatabase("postgres", "saad2");
    expect(dbBrowse.level).toBe("database");
    expect(objectPaneCrumbs("postgres", dbBrowse)).toEqual(["postgres", "saad2"]);
    expect(objectPaneRows(dbBrowse, ["saad2"], withMatview).map((row) => `${row.typeKey}:${row.name}`)).toEqual([
      "schema:analytics",
      "schema:public",
    ]);
    expect(objectPaneVisibleColumns(objectPaneRows(dbBrowse, ["saad2"], withMatview))).toEqual({
      schema: false,
      kind: false,
    });
    expect(objectPaneSummary(dbBrowse, ["saad2"], withMatview)).toEqual({ count: 2, typeKey: "schema" });
    const schemaBrowse = browseSchema("postgres", "saad2", "public");
    expect(schemaBrowse.kind).toBe("table");
    expect(objectPaneCrumbs("postgres", schemaBrowse)).toEqual(["postgres", "saad2", "public"]);
    expect(
      objectPaneRows(schemaBrowse, ["saad2"], withMatview).map((row) => `${row.typeKey}:${row.name}`),
    ).toEqual(["table:orders"]);
    // Single kind under one schema — name column only.
    expect(objectPaneVisibleColumns(objectPaneRows(schemaBrowse, ["saad2"], withMatview))).toEqual({
      schema: false,
      kind: false,
    });
    expect(objectPaneSummary(schemaBrowse, ["saad2"], withMatview)).toEqual({ count: 1, typeKey: "table" });
    const mixedRows = [
      {
        name: "orders",
        schema: "public",
        typeKey: "table" as const,
        action: "open-object" as const,
      },
      {
        name: "audit",
        schema: "analytics",
        typeKey: "view" as const,
        action: "open-object" as const,
      },
    ];
    expect(objectPaneVisibleColumns(mixedRows)).toEqual({ schema: true, kind: true });
    expect(cellEditorKind("time(6)")).toBe("time");
    // Postgres information_schema / pg_catalog often spell it this way
    expect(cellEditorKind("time without time zone")).toBe("time");
    expect(cellEditorKind("time with time zone")).toBe("time");
    expect(cellEditorKind("timestamptz")).toBe("datetime");
    expect(cellEditorKind("timestamp without time zone")).toBe("datetime");
    expect(cellEditorKind("date")).toBe("date");
    expect(cellEditorKind("varchar")).toBe("text");
    expect(cellEditorKind("bool")).toBe("boolean");
    expect(cellEditorKind("int4")).toBe("number");
    expect(cellEditorValue("time", "20:15:00.000000")).toBe("20:15:00");
    expect(cellEditorInputType("time")).toBe("time");
    expect(cellUsesDateTimePicker("time")).toBe(true);
    expect(cellUsesDateTimePicker("text")).toBe(false);
    expect(cellEditorKindFromValue("20:15:00.000000")).toBe("time");
    expect(cellEditorKindFromValue("2025-03-06")).toBe("date");
    expect(cellEditorKindFromValue("2025-03-06 14:58:18.24575")).toBe("datetime");
    expect(resolveCellEditorKind("", "20:15:00.000000")).toBe("time");
    expect(resolveCellEditorKind("varchar", "hello")).toBe("text");
    expect(objectPaneRows(browseKind("saad2", "routine", "public"), ["saad2"], tree).map((r) => r.name)).toEqual([
      "touch_order",
    ]);
    expect(browseDatabase("mysql", "shop").level).toBe("kind");
    expect(browseDatabase("mysql", "shop").kind).toBe("table");
    expect(tableDataSql("postgres", "materialized_view", "public", "daily")).toBe(
      'SELECT * FROM "public"."daily" LIMIT 1000',
    );
    expect(objectKinds("mysql")).toEqual(["table", "view", "routine", "event"]);
    expect(objectKinds("mariadb")).toEqual(["table", "view", "routine", "event"]);
    const events = buildObjectTree([["twreview", "nightly", "", "", "EVENT"]], "");
    expect(events.map((node) => node.kind)).toEqual(["event"]);
    expect(objectsIn(events, "table", null)).toEqual([]);
    expect(tableDataSql("mysql", "event", "twreview", "nightly")).toBeNull();
    expect(redisAuthMode("", false)).toBe("none");
    expect(redisAuthMode("default", true)).toBe("password");
    expect(redisAuthMode("app", true)).toBe("user");
    expect(mongoAuthDatabase("")).toBe("admin");
    expect(mongoAuthDatabase(" app ")).toBe("app");
    expect(resultPresentation("redis")).toBe("values");
    expect(resultPresentation("mongodb")).toBe("documents");
    expect(resultPresentation("postgres")).toBe("grid");
    expect(tableDataSql("redis", "key", "0", "user:1")).toBe("GET user:1");
    expect(sampleFieldNames(['{"name":"a","n":1}', "not-json", '{"name":"b","extra":true}'])).toEqual([
      "name",
      "n",
      "extra",
    ]);
  });

  it("quotes identifiers for the engine and skips routines", () => {
    expect(tableSelectSql("postgres", "table", 'public', 'ord"ers')).toBe(
      'SELECT * FROM "public"."ord""ers"',
    );
    expect(tableSelectSql("mysql", "view", "shop", "ord`ers")).toBe(
      "SELECT * FROM `shop`.`ord``ers`",
    );
    expect(tableSelectSql("mariadb", "table", "shop", "orders")).toBe("SELECT * FROM `shop`.`orders`");
    expect(tableSelectSql("sqlserver", "table", "dbo", "ord]ers")).toBe("SELECT * FROM [dbo].[ord]]ers]");
    expect(tableSelectSql("oracle", "table", "HR", "ORDERS")).toBe('SELECT * FROM "HR"."ORDERS"');
    expect(objectKinds("sqlserver")).toEqual(["table", "view", "routine"]);
    expect(objectKinds("oracle")).toEqual(["table", "view"]);
    expect(tableGroups("sqlserver", "table")).toEqual(["field"]);
    expect(tableGroups("oracle", "view")).toEqual(["field"]);
    expect(tableDataSql("redis", "key", "0", "user:1")).toBe("GET user:1");
    expect(tableDataSql("mongodb", "collection", "twreview", "orders")).toBe("db.orders.find({})");
    expect(objectKinds("redis")).toEqual(["key"]);
    expect(objectKinds("mongodb")).toEqual(["collection"]);
    expect(objectKinds("sqlite")).toEqual(["table", "view"]);
    expect(OFFERED_ENGINES).toContain("sqlserver");
    expect(OFFERED_ENGINES).toContain("oracle");
    expect(OFFERED_ENGINES).not.toContain("clickhouse");
    expect(ENGINE_PORTS.sqlserver).toBe("1433");
    expect(ENGINE_PORTS.oracle).toBe("1521");
    expect(tableSelectSql("postgres", "routine", "public", "touch_order")).toBeNull();
    expect(tableDataSql("postgres", "table", "public", "orders")).toBe(
      'SELECT * FROM "public"."orders" LIMIT 1000',
    );
    expect(orderDatabases(["postgres", "twreview"], "twreview")).toEqual(["twreview", "postgres"]);
    expect(connectionMatchesFilter("PostgreSQL", "postgres", "post")).toBe(true);
    expect(connectionMatchesFilter("PostgreSQL", "postgres", "orders")).toBe(false);
  });

  it("filters the tree and clears query tabs when the connection changes", () => {
    const tree = buildObjectTree(
      [["public", "orders", "id", "integer", "BASE TABLE"]],
      "missing",
    );
    expect(tree).toEqual([]);
    const current = freshQueryTab("q1", "SQL 1");
    current.result = {
      columns: ["n"],
      rows: [[1]],
      truncated: false,
      connection_id: "old",
      revision: 1,
    };
    expect(current.sql).toBe("");
    expect(current.kind).toBe("query");
    const next = tabsAfterConnectionSwitch("q2");
    expect(next).toEqual([]);
    expect(nextSqlTabTitle([])).toBe("SQL 1");
    expect(nextSqlTabTitle([{ title: "SQL 1" }, { title: "notes" }])).toBe(
      "SQL 2",
    );
    expect(workspaceId("c1")).toBe("c1");
    expect(objectTabTitle("public", "firmware")).toBe("firmware");
    expect(objectTabOrigin("saad2", "public")).toBe("saad2 / public");
    expect(objectTabOrigin("saad2", "")).toBe("saad2");
    const objectTab = freshObjectTab("o1", "saad2", {
      kind: "table",
      schema: "public",
      name: "firmware",
    });
    expect(objectTab.kind).toBe("table");
    expect(objectTab.title).toBe("firmware");
    expect(objectTab.database).toBe("saad2");
    expect(objectTab.objectName).toBe("firmware");
    expect(objectTab.sql).toBe("");
    const tabs = [current, objectTab];
    expect(findObjectTab(tabs, "saad2", "table", "public", "firmware")?.id).toBe("o1");
    expect(findObjectTab(tabs, "saad2", "view", "public", "firmware")).toBeUndefined();
  });

  it("pages and filters the grid and edits a cell through sql", () => {
    const rows = [
      ["1", "alpha"],
      ["2", "beta"],
    ];
    expect(filterGridRows(rows, "bet")).toEqual([["2", "beta"]]);
    expect(pageWindow([1, 2, 3], 2, 2)).toEqual({ rows: [3], page: 2, pages: 2 });
    expect(cellUpdateSql("postgres", "public", "orders", ["id", "name"], ["1", "alpha"], 1, "beta")).toBe(
      `UPDATE "public"."orders" SET "name" = 'beta' WHERE "id" = 1 AND "name" = 'alpha'`,
    );
    expect(cellUpdateSql("redis", "0", "user:1", ["value"], ["a"], 0, "b")).toBeNull();
  });

  it("builds a paged table select and insert or delete statements", () => {
    expect(tableViewSql("postgres", "public", "orders", ["id", "name"], "name", "desc", "a'; DROP", 2)).toBe(
      `SELECT * FROM "public"."orders" WHERE "id" LIKE '%a''; DROP%' ESCAPE '\\' OR "name" LIKE '%a''; DROP%' ESCAPE '\\' ORDER BY "name" DESC LIMIT 100 OFFSET 100`,
    );
    expect(tableViewSql("mysql", "shop", "orders", ["id"], "missing", "asc", "", 1)).toBe(
      "SELECT * FROM `shop`.`orders` LIMIT 100 OFFSET 0",
    );
    expect(tableViewSql("postgres", "public", "orders", ["id"], "id", "asc", "100%", 1)).toContain("LIKE '%100\\%%'");
    const browse = tableViewSql("postgres", "public", "orders", ["id"], null, "asc", "", 1);
    expect(sqlDiffersFromTableBrowse(browse ?? "", browse)).toBe(false);
    expect(sqlDiffersFromTableBrowse(`  ${browse}  `, browse)).toBe(false);
    expect(sqlDiffersFromTableBrowse(`SELECT * FROM "public"."orders" where id =1`, browse)).toBe(true);
    expect(sqlDiffersFromTableBrowse("SELECT 1", null)).toBe(false);
    expect(rowInsertSql("postgres", "public", "orders", ["id", "name"], [1, null])).toBe(
      `INSERT INTO "public"."orders" ("id", "name") VALUES (1, NULL)`,
    );
    expect(rowDeleteSql("postgres", "public", "orders", ["id"], [1])).toBe(
      `DELETE FROM "public"."orders" WHERE "id" = 1`,
    );
    expect(rowInsertSql("redis", "0", "user:1", ["value"], ["a"])).toBeNull();
  });

  it("builds Navicat-style filter and multi-column sort clauses", () => {
    const rules: FilterRule[] = [
      { id: "1", enabled: true, column: "name", op: "contains", value: "ab%", join: "and" },
      { id: "2", enabled: true, column: "id", op: "eq", value: "1", join: "or" },
      { id: "3", enabled: false, column: "name", op: "eq", value: "x", join: "and" },
      { id: "4", enabled: true, column: "gone", op: "is_null", value: "", join: "and" },
    ];
    expect(filterRulesToWhere("postgres", ["id", "name"], rules)).toBe(
      ` WHERE "name" LIKE '%ab\\%%' ESCAPE '\\' OR "id" = 1`,
    );
    expect(filterRulesToWhere("postgres", ["id"], [{ id: "a", enabled: true, column: "id", op: "is_not_null", value: "", join: "and" }])).toBe(
      ` WHERE "id" IS NOT NULL`,
    );
    expect(filterRulesToWhere("mysql", ["n"], [{ id: "a", enabled: true, column: "n", op: "begin", value: "x", join: "and" }])).toBe(
      " WHERE `n` LIKE 'x%' ESCAPE '\\'",
    );
    const sorts: SortRule[] = [
      { id: "s1", column: "name", dir: "asc" },
      { id: "s2", column: "id", dir: "desc" },
      { id: "s3", column: "missing", dir: "asc" },
    ];
    expect(sortRulesToOrder("postgres", ["id", "name"], sorts)).toBe(` ORDER BY "name" ASC, "id" DESC`);
    expect(
      tableViewSql("postgres", "public", "orders", ["id", "name"], null, "asc", "", 1, {
        filterRules: [{ id: "1", enabled: true, column: "id", op: "gt", value: "0", join: "and" }],
        sortRules: [
          { id: "s1", column: "name", dir: "desc" },
          { id: "s2", column: "id", dir: "asc" },
        ],
      }),
    ).toBe(`SELECT * FROM "public"."orders" WHERE "id" > 0 ORDER BY "name" DESC, "id" ASC LIMIT 100 OFFSET 0`);
  });

  it("builds definition, create, drop, and truncate as one statement", () => {
    expect(definitionSql("mysql", "table", "shop", "orders")).toBe("SHOW CREATE TABLE `shop`.`orders`");
    expect(definitionSql("postgres", "view", "public", "order_view")).toBe(
      `SELECT pg_get_viewdef('"public"."order_view"'::regclass, true)`,
    );
    expect(definitionSql("sqlite", "table", "main", "orders")).toBe("SELECT sql FROM sqlite_master WHERE name = 'orders'");
    expect(
      tableDefinitionFromColumns("postgres", "public", "orders", [{ name: "id", type: "integer", key: true }]),
    ).toContain('PRIMARY KEY ("id")');
    expect(
      createTableSql("postgres", "public", "orders", [
        { name: "id", type: "integer", nullable: false, primary: true },
        { name: "label", type: "text; drop", nullable: true, primary: false },
      ]),
    ).toBeNull();
    expect(dropTableSql("postgres", "public", "orders")).toBe('DROP TABLE "public"."orders"');
    expect(truncateTableSql("mysql", "shop", "orders")).toBe("TRUNCATE TABLE `shop`.`orders`");
    expect(truncateTableSql("sqlite", "main", "orders")).toBe('DELETE FROM "main"."orders"');
  });

  it("filters object menu actions and builds maintain sql per engine", () => {
    expect(objectMenuActions("redis", "key")).toEqual(["open", "refresh"]);
    expect(objectMenuActions("mongodb", "collection")).toEqual(["open", "refresh"]);
    expect(objectMenuActions("postgres", "table")).toContain("maintain-vacuum");
    expect(objectMenuActions("postgres", "table")).toContain("truncate");
    expect(objectMenuActions("postgres", "table")).toContain("drop");
    expect(objectMenuActions("postgres", "view")).not.toContain("drop");
    expect(objectMenuActions("mysql", "table")).toContain("maintain-optimize");
    expect(objectMenuActions("mysql", "table")).not.toContain("maintain-vacuum");
    expect(objectMenuActions("sqlite", "table")).toContain("maintain-reindex");
    expect(objectMenuActions("postgres", "view")).not.toContain("truncate");
    expect(maintainSql("postgres", "vacuum", "public", "orders")).toBe('VACUUM "public"."orders"');
    expect(maintainSql("postgres", "analyze", "public", "orders")).toBe('ANALYZE "public"."orders"');
    expect(maintainSql("postgres", "reindex", "public", "orders")).toBe('REINDEX TABLE "public"."orders"');
    expect(maintainSql("mysql", "optimize", "shop", "orders")).toBe("OPTIMIZE TABLE `shop`.`orders`");
    expect(maintainSql("mysql", "analyze", "shop", "orders")).toBe("ANALYZE TABLE `shop`.`orders`");
    expect(maintainSql("sqlite", "analyze", "main", "orders")).toBe('ANALYZE "main"."orders"');
    expect(maintainSql("sqlite", "reindex", "main", "orders")).toBe('REINDEX "main"."orders"');
    expect(maintainSql("postgres", "optimize", "public", "orders")).toBeNull();
    expect(maintainSql("redis", "vacuum", "0", "k")).toBeNull();
  });

  it("builds redis ttl commands and validates mongo json", () => {
    expect(redisExpireCommand("user:1", 60)).toBe("EXPIRE user:1 60");
    expect(redisExpireCommand("user:1", 0)).toBeNull();
    expect(redisExpireCommand("bad key", 10)).toBe('EXPIRE "bad key" 10');
    expect(redisPersistCommand("user:1")).toBe("PERSIST user:1");
    expect(parseMongoJson('{"a":1}')).toEqual({ ok: true, json: '{"a":1}' });
    expect(parseMongoJson("[1]").ok).toBe(false);
    expect(parseMongoJson("{").ok).toBe(false);
  });

  it("formats compact connection-form errors from invoke payloads", () => {
    expect(formatDbFormError("password is missing")).toBe("password is missing");
    expect(formatDbFormError({ message: "could not write the secret file" })).toBe(
      "could not write the secret file",
    );
    expect(formatDbFormError({})).toBe("Save failed");
    expect(shortDbFormError("a".repeat(50), 10)).toBe(`${"a".repeat(9)}…`);
  });

  it("builds empty-table delete and rename statements", () => {
    expect(emptyTableSql("mysql", "shop", "orders")).toBe("DELETE FROM `shop`.`orders`");
    expect(emptyTableSql("postgres", "public", "orders")).toBe('DELETE FROM "public"."orders"');
    expect(renameObjectSql("postgres", "public", "orders", "orderz")).toBe(
      'ALTER TABLE "public"."orders" RENAME TO "orderz"',
    );
    expect(renameObjectSql("mysql", "shop", "orders", "orderz")).toBe(
      "RENAME TABLE `shop`.`orders` TO `shop`.`orderz`",
    );
    expect(renameObjectSql("sqlite", "main", "orders", "orderz")).toBe(
      'ALTER TABLE "main"."orders" RENAME TO "orderz"',
    );
    expect(renameObjectSql("sqlserver", "dbo", "orders", "orderz")).toBe(
      "EXEC sp_rename N'dbo.orders', N'orderz'",
    );
    expect(renameObjectSql("postgres", "public", "orders", "bad-name")).toBeNull();
    expect(
      cellUpdateSql("postgres", "public", "orders", ["id", "label"], [1, ""], 1, null),
    ).toBe(`UPDATE "public"."orders" SET "label" = NULL WHERE "id" = 1 AND "label" = ''`);
    expect(
      cellUpdateSql("postgres", "public", "orders", ["id", "label"], [1, null], 1, null),
    ).toBeNull();
  });

  it("exports csv and turns an import into one insert", () => {
    expect(rowsToCsv(["id", "name"], [[1, 'a"b']])).toBe('id,name\n1,"a""b"');
    expect(csvInsertSql("postgres", "public", "orders", ["id", "name"], "id,name\n1,alpha\n2,beta")).toBe(
      `INSERT INTO "public"."orders" ("id", "name") VALUES (1, 'alpha'), (2, 'beta')`,
    );
    expect(csvInsertSql("postgres", "public", "orders", ["id"], "")).toBeNull();
  });

  it("previews a csv import and splits mapped rows into batches", () => {
    const preview = previewCsvImport(["id", "name"], "id,name\n1,alpha\n2,beta\nbroken\n");
    expect(preview?.rowCount).toBe(2);
    expect(preview?.errors).toEqual(["4"]);
    expect(preview?.sample[0]).toEqual(["1", "alpha"]);
    expect(preview?.mapping).toEqual([
      { column: "id", source: 0 },
      { column: "name", source: 1 },
    ]);
    const skipped = preview!.mapping.map((item) => (item.column === "name" ? { ...item, source: null } : item));
    const batches = csvInsertBatches("postgres", "public", "orders", skipped, preview!.rows, 1);
    expect(batches).toEqual([
      `INSERT INTO "public"."orders" ("id") VALUES (1)`,
      `INSERT INTO "public"."orders" ("id") VALUES (2)`,
    ]);
  });

  it("keeps saved queries as name and sql for one connection", () => {
    const items = new Map<string, string>();
    const store: QueryStore = {
      getItem: (key) => items.get(key) ?? null,
      setItem: (key, value) => {
        items.set(key, value);
      },
    };
    const saved = rememberQuery(rememberQuery([], "daily", "SELECT 1"), "daily", "SELECT 2");
    expect(saved).toEqual([{ id: "saved-1", name: "daily", sql: "SELECT 2" }]);
    writeSavedQueries("db-1", saved, store);
    expect(readSavedQueries("db-1", store)).toEqual(saved);
    expect(store.getItem("tw.db.savedQueries")).not.toContain("password");
    forgetSavedQueries("db-1", store);
    expect(readSavedQueries("db-1", store)).toEqual([]);
  });

  it("builds redis and mongo writes as single commands", () => {
    expect(redisSetCommand("user:1", "alpha")).toBe('SET user:1 "alpha"');
    expect(redisSetCommand("user:1", 'say "hi"')).toBeNull();
    expect(redisDelCommand("user:1")).toBe("DEL user:1");
    expect(mongoInsertCommand("orders", '{"id":1}')).toBe('db.orders.insertOne({"id":1})');
    expect(mongoDeleteCommand("orders", '{"id":1}')).toBe('db.orders.deleteOne({"id":1})');
    expect(mongoReplaceCommand("orders", '{"id":1}', '{"id":1,"name":"a"}')).toBe(
      'db.orders.replaceOne({"id":1}, {"id":1,"name":"a"})',
    );
    expect(mongoInsertCommand("orders", "[]")).toBeNull();
  });
});
