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
  filterGridRows,
  forgetSavedQueries,
  freshQueryTab,
  kindSchemas,
  mongoDeleteCommand,
  mongoInsertCommand,
  mongoReplaceCommand,
  objectKinds,
  objectsIn,
  mongoAuthDatabase,
  readSavedQueries,
  redisAuthMode,
  redisDelCommand,
  redisSetCommand,
  rememberQuery,
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
  truncateTableSql,
  orderDatabases,
  pageWindow,
  previewCsvImport,
  tableDataSql,
  tableSelectSql,
  tabsAfterConnectionSwitch,
  writeSavedQueries,
  type QueryStore,
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

  it("filters the tree and resets tabs when the connection changes", () => {
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
    const next = tabsAfterConnectionSwitch("q2");
    expect(next).toHaveLength(1);
    expect(next[0].result).toBeNull();
    expect(next[0].id).not.toBe(current.id);
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
    expect(rowInsertSql("postgres", "public", "orders", ["id", "name"], [1, null])).toBe(
      `INSERT INTO "public"."orders" ("id", "name") VALUES (1, NULL)`,
    );
    expect(rowDeleteSql("postgres", "public", "orders", ["id"], [1])).toBe(
      `DELETE FROM "public"."orders" WHERE "id" = 1`,
    );
    expect(rowInsertSql("redis", "0", "user:1", ["value"], ["a"])).toBeNull();
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
