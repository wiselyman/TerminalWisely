export type ObjectKind = "table" | "view" | "materialized_view" | "routine" | "event" | "key" | "collection";

export type RedisAuth = "none" | "password" | "user";

export const OFFERED_ENGINES = [
  "postgres",
  "mysql",
  "mariadb",
  "sqlite",
  "mongodb",
  "redis",
  "sqlserver",
  "oracle",
] as const;

export const ENGINE_PORTS: Record<(typeof OFFERED_ENGINES)[number], string> = {
  postgres: "5432",
  mysql: "3306",
  mariadb: "3306",
  sqlite: "",
  mongodb: "27017",
  redis: "6379",
  sqlserver: "1433",
  oracle: "1521",
};

export function engineFamily(engine: string): "sql" | "document" | "kv" {
  if (engine === "redis") return "kv";
  if (engine === "mongodb") return "document";
  return "sql";
}

export function objectKinds(engine: string): ObjectKind[] {
  if (engine === "redis") return ["key"];
  if (engine === "mongodb") return ["collection"];
  if (engine === "sqlite") return ["table", "view"];
  if (engine === "postgres") return ["table", "view", "materialized_view", "routine"];
  if (engine === "mysql" || engine === "mariadb") return ["table", "view", "routine", "event"];
  if (engine === "sqlserver") return ["table", "view", "routine"];
  if (engine === "oracle") return ["table", "view"];
  return ["table", "view", "routine"];
}

/** Context-menu actions for an object. Engine-specific Maintain items are included for SQL tables. */
export type ObjectMenuAction =
  | "open"
  | "definition"
  | "rename"
  | "empty"
  | "truncate"
  | "drop"
  | "refresh"
  | "maintain-analyze"
  | "maintain-vacuum"
  | "maintain-reindex"
  | "maintain-optimize";

export type MaintainAction = "analyze" | "vacuum" | "reindex" | "optimize";

export function objectMenuActions(engine: string, kind: string): ObjectMenuAction[] {
  const family = engineFamily(engine);
  const actions: ObjectMenuAction[] = ["open"];
  if (family === "sql") {
    if (kind === "table" || kind === "view" || kind === "materialized_view") {
      actions.push("definition");
    }
    if (kind === "table") {
      actions.push("rename", "empty", "truncate", "drop");
      if (engine === "postgres") {
        actions.push("maintain-analyze", "maintain-vacuum", "maintain-reindex");
      } else if (engine === "mysql" || engine === "mariadb") {
        actions.push("maintain-analyze", "maintain-optimize");
      } else if (engine === "sqlite") {
        actions.push("maintain-analyze", "maintain-reindex");
      }
    }
  }
  actions.push("refresh");
  return actions;
}

export function maintainActionFromMenu(action: ObjectMenuAction): MaintainAction | null {
  if (action === "maintain-analyze") return "analyze";
  if (action === "maintain-vacuum") return "vacuum";
  if (action === "maintain-reindex") return "reindex";
  if (action === "maintain-optimize") return "optimize";
  return null;
}

export function maintainSql(
  engine: string,
  action: MaintainAction,
  schema: string,
  table: string,
): string | null {
  if (engineFamily(engine) !== "sql" || !schema.trim() || !table.trim()) return null;
  const target = `${quoteIdent(engine, schema)}.${quoteIdent(engine, table)}`;
  if (engine === "postgres") {
    if (action === "analyze") return `ANALYZE ${target}`;
    if (action === "vacuum") return `VACUUM ${target}`;
    if (action === "reindex") return `REINDEX TABLE ${target}`;
    return null;
  }
  if (engine === "mysql" || engine === "mariadb") {
    if (action === "analyze") return `ANALYZE TABLE ${target}`;
    if (action === "optimize") return `OPTIMIZE TABLE ${target}`;
    return null;
  }
  if (engine === "sqlite") {
    if (action === "analyze") return `ANALYZE ${target}`;
    if (action === "reindex") return `REINDEX ${target}`;
    return null;
  }
  return null;
}

export function redisAuthMode(user: string, hasSecret: boolean): RedisAuth {
  if (user.trim() && user.trim() !== "default") return "user";
  return hasSecret ? "password" : "none";
}

export function mongoAuthDatabase(value: string): string {
  const trimmed = value.trim();
  return trimmed || "admin";
}

export function resultPresentation(engine: string): "grid" | "values" | "documents" {
  if (engine === "redis") return "values";
  if (engine === "mongodb") return "documents";
  return "grid";
}

export function sampleFieldNames(documents: string[]): string[] {
  const names: string[] = [];
  for (const text of documents.slice(0, 20)) {
    try {
      const value = JSON.parse(text) as unknown;
      if (!value || typeof value !== "object" || Array.isArray(value)) continue;
      for (const key of Object.keys(value)) {
        if (!names.includes(key)) names.push(key);
      }
    } catch {
      continue;
    }
  }
  return names;
}

/** PostgreSQL keeps schemas under the database. Other SQL engines use the database as that level. */
export function schemasFirst(engine: string): boolean {
  return engine === "postgres" || engine === "sqlserver" || engine === "oracle";
}

export type ObjectColumn = {
  name: string;
  type: string;
  key: boolean;
};

export type TableGroup =
  | "field"
  | "index"
  | "foreign_key"
  | "unique"
  | "check"
  | "exclusion"
  | "rule"
  | "trigger";

export type ObjectMember = {
  group: TableGroup;
  name: string;
  detail: string;
};

export type ObjectNode = {
  schema: string;
  kind: ObjectKind;
  name: string;
  columns: ObjectColumn[];
  members: ObjectMember[];
};

const POSTGRES_TABLE_GROUPS: TableGroup[] = [
  "field",
  "index",
  "foreign_key",
  "unique",
  "check",
  "exclusion",
  "rule",
  "trigger",
];

const MYSQL_TABLE_GROUPS: TableGroup[] = ["field", "index", "foreign_key", "check", "trigger"];

const STRUCTURE_GROUPS: Record<string, TableGroup> = {
  INDEX: "index",
  "FOREIGN KEY": "foreign_key",
  UNIQUE: "unique",
  CHECK: "check",
  EXCLUSION: "exclusion",
  RULE: "rule",
  TRIGGER: "trigger",
};

/** Folders under a table. Views only list fields. Redis and Mongo have none. */
export function tableGroups(engine: string, kind: ObjectKind): TableGroup[] {
  if (kind === "view" || kind === "materialized_view") return ["field"];
  if (kind !== "table") return [];
  if (engine === "postgres") return POSTGRES_TABLE_GROUPS;
  if (engine === "mysql" || engine === "mariadb") return MYSQL_TABLE_GROUPS;
  if (engine === "sqlite" || engine === "sqlserver" || engine === "oracle") return ["field"];
  return [];
}

export function hasTableStructure(engine: string): boolean {
  return engine === "postgres" || engine === "mysql" || engine === "mariadb";
}

export function groupRows(node: ObjectNode, group: TableGroup): { name: string; type: string }[] {
  if (group === "field") return node.columns.map((column) => ({ name: column.name, type: column.type }));
  return node.members.filter((member) => member.group === group).map((member) => ({ name: member.name, type: member.detail }));
}

export type WorkbenchTabKind = "query" | ObjectKind;

export type WorkbenchTab = {
  id: string;
  title: string;
  kind: WorkbenchTabKind;
  sql: string;
  result: null | {
    columns: string[];
    rows: unknown[][];
    truncated: boolean;
    connection_id: string;
    revision: number;
  };
  error: string;
  database: string | null;
  schema: string | null;
  objectName: string | null;
};

/** @deprecated Prefer WorkbenchTab — kept as alias for gradual call-site updates. */
export type QueryTab = WorkbenchTab;

export function objectKind(raw: unknown): ObjectKind {
  const value = String(raw ?? "").toUpperCase();
  if (value === "VIEW") return "view";
  if (value === "MATERIALIZED VIEW" || value === "MATERIALIZEDVIEW") return "materialized_view";
  if (value === "ROUTINE") return "routine";
  if (value === "EVENT") return "event";
  if (value === "KEY") return "key";
  if (value === "COLLECTION") return "collection";
  return "table";
}

function blankNode(schema: string, kind: ObjectKind, name: string): ObjectNode {
  return { schema, kind, name, columns: [], members: [] };
}

function nodeForMember(grouped: Map<string, ObjectNode>, schema: string, name: string): ObjectNode {
  for (const kind of ["table", "view", "materialized_view"] as const) {
    const existing = grouped.get(`${schema}\0${kind}\0${name}`);
    if (existing) return existing;
  }
  const created = blankNode(schema, "table", name);
  grouped.set(`${schema}\0table\0${name}`, created);
  return created;
}

export function buildObjectTree(rows: unknown[][], filter: string): ObjectNode[] {
  const needle = filter.trim().toLowerCase();
  const grouped = new Map<string, ObjectNode>();
  for (const row of rows) {
    const schema = String(row[0] ?? "");
    const name = String(row[1] ?? "");
    const column = String(row[2] ?? "");
    const type = String(row[3] ?? "");
    const marker = String(row[4] ?? "").toUpperCase();
    const structure = STRUCTURE_GROUPS[marker];
    if (structure) {
      const memberName = column.trim();
      if (!memberName) continue;
      const node = nodeForMember(grouped, schema, name);
      if (!node.members.some((member) => member.group === structure && member.name === memberName)) {
        node.members.push({ group: structure, name: memberName, detail: type });
      }
      continue;
    }
    const kind = objectKind(row[4]);
    const key = `${schema}\0${kind}\0${name}`;
    const node = grouped.get(key) ?? blankNode(schema, kind, name);
    const primary = String(row[5] ?? "").toUpperCase() === "PRI";
    if (column) {
      const existing = node.columns.find((item) => item.name === column);
      if (existing) {
        if (primary) existing.key = true;
      } else {
        node.columns.push({ name: column, type, key: primary });
      }
    }
    grouped.set(key, node);
  }
  return [...grouped.values()].filter((node) => {
    if (!needle) return true;
    return (
      node.schema.toLowerCase().includes(needle) ||
      node.name.toLowerCase().includes(needle) ||
      node.columns.some((column) => column.name.toLowerCase().includes(needle)) ||
      node.members.some((member) => member.name.toLowerCase().includes(needle))
    );
  });
}

export function quoteIdent(engine: string, name: string): string {
  if (engine === "mysql" || engine === "mariadb") {
    return `\`${name.replace(/`/g, "``")}\``;
  }
  if (engine === "sqlserver") {
    return `[${name.replace(/]/g, "]]")}]`;
  }
  return `"${name.replace(/"/g, '""')}"`;
}

function commandName(name: string): string | null {
  if (name.includes('"') || name.includes("\n")) return null;
  return /\s/.test(name) ? `"${name}"` : name;
}

/** Table, view, key, and collection. Routines are not a data target. */
export function tableSelectSql(engine: string, kind: ObjectKind, schema: string, table: string): string | null {
  if (kind === "routine" || kind === "event") return null;
  if (kind === "key") {
    const key = commandName(table);
    return key ? `GET ${key}` : null;
  }
  if (kind === "collection") {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) return null;
    return `db.${table}.find({})`;
  }
  return `SELECT * FROM ${quoteIdent(engine, schema)}.${quoteIdent(engine, table)}`;
}

export function tableDataSql(engine: string, kind: ObjectKind, schema: string, table: string): string | null {
  const sql = tableSelectSql(engine, kind, schema, table);
  if (!sql) return null;
  if (kind === "key" || kind === "collection") return sql;
  return `${sql} LIMIT 1000`;
}

export const OBJECT_KINDS: ObjectKind[] = ["table", "view", "routine"];

export const GRID_PAGE_SIZE = 100;
export const EXPORT_ROW_BUDGET = 500;

export type CsvColumnMap = { column: string; source: number | null };

export type CsvImportPreview = {
  headers: string[];
  mapping: CsvColumnMap[];
  rowCount: number;
  sample: string[][];
  errors: string[];
  rows: string[][];
};

/** Header row maps by name. A column can be skipped. Rows that do not match the header are errors. */
export function previewCsvImport(columns: string[], csv: string): CsvImportPreview | null {
  if (columns.length === 0) return null;
  const parsed = parseCsv(csv);
  if (parsed.length === 0) return null;
  const header = parsed[0];
  const headerMatch = header.some((cell) => columns.includes(cell));
  const headers = headerMatch ? header : columns.map((_, index) => `column ${index + 1}`);
  const data = headerMatch ? parsed.slice(1) : parsed;
  const mapping = columns.map((column) => {
    const index = headerMatch ? header.indexOf(column) : columns.indexOf(column);
    return { column, source: index >= 0 && index < headers.length ? index : null };
  });
  const errors: string[] = [];
  const rows: string[][] = [];
  data.forEach((record, index) => {
    const width = headerMatch ? header.length : columns.length;
    if (record.length !== width) {
      errors.push(String(index + (headerMatch ? 2 : 1)));
      return;
    }
    rows.push(record);
  });
  return {
    headers,
    mapping,
    rowCount: rows.length,
    sample: rows.slice(0, 5),
    errors,
    rows,
  };
}

export function csvInsertBatches(
  engine: string,
  schema: string,
  table: string,
  mapping: CsvColumnMap[],
  rows: string[][],
  batchSize = 50,
): string[] {
  const used = mapping.filter((item) => item.source != null);
  if (engineFamily(engine) !== "sql" || used.length === 0 || rows.length === 0) return [];
  const names = used.map((item) => quoteIdent(engine, item.column)).join(", ");
  const target = `${quoteIdent(engine, schema)}.${quoteIdent(engine, table)}`;
  const batches: string[] = [];
  for (let start = 0; start < rows.length; start += batchSize) {
    const tuples = rows.slice(start, start + batchSize).map((record) => {
      const values = used.map((item) => {
        const cell = record[item.source ?? -1];
        return sqlLiteral(cell === undefined || cell === "" ? null : cell);
      });
      return `(${values.join(", ")})`;
    });
    batches.push(`INSERT INTO ${target} (${names}) VALUES ${tuples.join(", ")}`);
  }
  return batches;
}

export function filterGridRows(rows: unknown[][], filter: string): unknown[][] {
  const needle = filter.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((row) => row.some((cell) => String(cell ?? "").toLowerCase().includes(needle)));
}

export function pageWindow<T>(rows: T[], page: number, size = GRID_PAGE_SIZE): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(Math.max(1, page), pages);
  const start = (current - 1) * size;
  return { rows: rows.slice(start, start + size), page: current, pages };
}

export function sqlLiteral(value: unknown): string {
  if (value == null) return "NULL";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  if (typeof value === "string" && /^-?\d+(\.\d+)?$/.test(value)) return value;
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** Pull a readable message out of Tauri invoke rejections and plain errors. */
export function formatDbFormError(err: unknown, fallback = "Save failed"): string {
  if (typeof err === "string" && err.trim()) return err.trim();
  if (err instanceof Error && err.message.trim()) return err.message.trim();
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    for (const key of ["message", "error", "msg"]) {
      const value = record[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    try {
      const text = JSON.stringify(err);
      if (text && text !== "{}" && text !== "null") return text;
    } catch {
      /* ignore */
    }
  }
  const raw = String(err ?? "").trim();
  if (raw && raw !== "[object Object]") return raw;
  return fallback;
}

/** One-line hint for the connection form status row. */
export function shortDbFormError(message: string, max = 42): string {
  const trimmed = message.trim().replace(/\s+/g, " ");
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, Math.max(1, max - 1))}…`;
}

function sameCellValue(left: unknown, right: unknown): boolean {
  if (left == null && right == null) return true;
  if (left == null || right == null) return false;
  return String(left) === String(right);
}

export function cellUpdateSql(
  engine: string,
  schema: string,
  table: string,
  columns: string[],
  original: unknown[],
  columnIndex: number,
  next: unknown,
): string | null {
  if (engineFamily(engine) !== "sql") return null;
  const column = columns[columnIndex];
  if (!column || sameCellValue(original[columnIndex], next)) return null;
  const assignments = `${quoteIdent(engine, column)} = ${sqlLiteral(next)}`;
  const where = rowWhere(engine, columns, original);
  if (!where) return null;
  return `UPDATE ${quoteIdent(engine, schema)}.${quoteIdent(engine, table)} SET ${assignments} WHERE ${where}`;
}

export type SortDir = "asc" | "desc";

/** Navicat Filter & Sort operators (SQL engines, v1). */
export type FilterOp =
  | "eq"
  | "ne"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "contains"
  | "begin"
  | "end"
  | "is_null"
  | "is_not_null";

export type FilterJoin = "and" | "or";

export type FilterRule = {
  id: string;
  enabled: boolean;
  column: string;
  op: FilterOp;
  value: string;
  /** How this rule connects to the previous enabled rule (ignored for the first). */
  join: FilterJoin;
};

export type SortRule = {
  id: string;
  column: string;
  dir: SortDir;
};

export type TableViewSqlOptions = {
  filterRules?: FilterRule[];
  sortRules?: SortRule[];
};

export const FILTER_OPS: FilterOp[] = [
  "eq",
  "ne",
  "lt",
  "lte",
  "gt",
  "gte",
  "contains",
  "begin",
  "end",
  "is_null",
  "is_not_null",
];

export type NewColumn = {
  name: string;
  type: string;
  nullable: boolean;
  primary: boolean;
};

const TYPE_PATTERN =
  /^[A-Za-z][A-Za-z0-9_-]*(?:\s+[A-Za-z][A-Za-z0-9_-]*)*(?:\s*\(\s*\d+(?:\s*,\s*\d+)?\s*\))?(?:\[\])?$/;

function rowWhere(engine: string, columns: string[], values: unknown[]): string | null {
  if (columns.length === 0 || columns.length !== values.length) return null;
  return columns
    .map((name, index) => {
      const value = values[index];
      return value == null
        ? `${quoteIdent(engine, name)} IS NULL`
        : `${quoteIdent(engine, name)} = ${sqlLiteral(value)}`;
    })
    .join(" AND ");
}

function escapeLikeBody(needle: string): string {
  return needle.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_").replace(/'/g, "''");
}

function likeLiteral(needle: string): string {
  return `'%${escapeLikeBody(needle)}%' ESCAPE '\\'`;
}

function likePrefixLiteral(needle: string): string {
  return `'${escapeLikeBody(needle)}%' ESCAPE '\\'`;
}

function likeSuffixLiteral(needle: string): string {
  return `'%${escapeLikeBody(needle)}' ESCAPE '\\'`;
}

function filterWhere(engine: string, columns: string[], filter: string): string {
  const needle = filter.trim();
  const names = columns.filter((name) => name.trim());
  if (!needle || names.length === 0) return "";
  const pattern = likeLiteral(needle);
  return ` WHERE ${names.map((name) => `${quoteIdent(engine, name)} LIKE ${pattern}`).join(" OR ")}`;
}

function filterRulePredicate(engine: string, column: string, op: FilterOp, value: string): string | null {
  const ident = quoteIdent(engine, column);
  switch (op) {
    case "eq":
      return `${ident} = ${sqlLiteral(value)}`;
    case "ne":
      return `${ident} <> ${sqlLiteral(value)}`;
    case "lt":
      return `${ident} < ${sqlLiteral(value)}`;
    case "lte":
      return `${ident} <= ${sqlLiteral(value)}`;
    case "gt":
      return `${ident} > ${sqlLiteral(value)}`;
    case "gte":
      return `${ident} >= ${sqlLiteral(value)}`;
    case "contains":
      return `${ident} LIKE ${likeLiteral(value)}`;
    case "begin":
      return `${ident} LIKE ${likePrefixLiteral(value)}`;
    case "end":
      return `${ident} LIKE ${likeSuffixLiteral(value)}`;
    case "is_null":
      return `${ident} IS NULL`;
    case "is_not_null":
      return `${ident} IS NOT NULL`;
    default:
      return null;
  }
}

/** Build WHERE from Navicat-style filter rules. `join` on a rule links it to the previous enabled rule. */
export function filterRulesToWhere(engine: string, columns: string[], rules: FilterRule[]): string {
  const allowed = new Set(columns.filter((name) => name.trim()));
  const parts: string[] = [];
  for (const rule of rules) {
    if (!rule.enabled || !allowed.has(rule.column)) continue;
    const predicate = filterRulePredicate(engine, rule.column, rule.op, rule.value);
    if (!predicate) continue;
    if (parts.length === 0) {
      parts.push(predicate);
      continue;
    }
    parts.push(`${rule.join === "or" ? "OR" : "AND"} ${predicate}`);
  }
  if (parts.length === 0) return "";
  return ` WHERE ${parts.join(" ")}`;
}

/** Build ORDER BY from one or more sort rules (unknown columns skipped). */
export function sortRulesToOrder(engine: string, columns: string[], rules: SortRule[]): string {
  const allowed = new Set(columns);
  const pieces = rules
    .filter((rule) => allowed.has(rule.column))
    .map((rule) => `${quoteIdent(engine, rule.column)} ${rule.dir === "desc" ? "DESC" : "ASC"}`);
  if (pieces.length === 0) return "";
  return ` ORDER BY ${pieces.join(", ")}`;
}

/** One SELECT for the open table: sort, filter, and page are part of the statement. */
export function tableViewSql(
  engine: string,
  schema: string,
  table: string,
  columns: string[],
  sortColumn: string | null,
  sortDir: SortDir,
  filter: string,
  page: number,
  options?: TableViewSqlOptions,
): string | null {
  const base = tableSelectSql(engine, "table", schema, table);
  if (!base) return null;
  const where =
    options?.filterRules !== undefined
      ? filterRulesToWhere(engine, columns, options.filterRules)
      : filterWhere(engine, columns, filter);
  const order =
    options?.sortRules !== undefined
      ? sortRulesToOrder(engine, columns, options.sortRules)
      : sortColumn && columns.includes(sortColumn)
        ? ` ORDER BY ${quoteIdent(engine, sortColumn)} ${sortDir === "desc" ? "DESC" : "ASC"}`
        : "";
  const offset = (Math.max(1, page) - 1) * GRID_PAGE_SIZE;
  return `${base}${where}${order} LIMIT ${GRID_PAGE_SIZE} OFFSET ${offset}`;
}

export function rowInsertSql(
  engine: string,
  schema: string,
  table: string,
  columns: string[],
  values: unknown[],
): string | null {
  if (engineFamily(engine) !== "sql" || columns.length === 0 || columns.length !== values.length) return null;
  const names = columns.map((name) => quoteIdent(engine, name)).join(", ");
  const literals = values.map((value) => sqlLiteral(value)).join(", ");
  return `INSERT INTO ${quoteIdent(engine, schema)}.${quoteIdent(engine, table)} (${names}) VALUES (${literals})`;
}

export function rowDeleteSql(engine: string, schema: string, table: string, columns: string[], values: unknown[]): string | null {
  if (engineFamily(engine) !== "sql") return null;
  const where = rowWhere(engine, columns, values);
  if (!where) return null;
  return `DELETE FROM ${quoteIdent(engine, schema)}.${quoteIdent(engine, table)} WHERE ${where}`;
}

export function createTableSql(engine: string, schema: string, table: string, columns: NewColumn[]): string | null {
  if (engineFamily(engine) !== "sql" || !schema.trim() || !table.trim() || columns.length === 0) return null;
  const lines = columns.map((column) => {
    const type = column.type.trim();
    if (!column.name.trim() || !TYPE_PATTERN.test(type)) return null;
    return `${quoteIdent(engine, column.name)} ${type}${column.nullable ? "" : " NOT NULL"}`;
  });
  if (lines.some((line) => line == null)) return null;
  const keys = columns.filter((column) => column.primary).map((column) => quoteIdent(engine, column.name));
  const keySql = keys.length > 0 ? `,\n  PRIMARY KEY (${keys.join(", ")})` : "";
  return `CREATE TABLE ${quoteIdent(engine, schema)}.${quoteIdent(engine, table)} (\n  ${(lines as string[]).join(",\n  ")}${keySql}\n)`;
}

export function dropTableSql(engine: string, schema: string, table: string): string | null {
  if (engineFamily(engine) !== "sql" || !schema.trim() || !table.trim()) return null;
  return `DROP TABLE ${quoteIdent(engine, schema)}.${quoteIdent(engine, table)}`;
}

export function truncateTableSql(engine: string, schema: string, table: string): string | null {
  if (engineFamily(engine) !== "sql" || !schema.trim() || !table.trim()) return null;
  if (engine === "sqlite") return `DELETE FROM ${quoteIdent(engine, schema)}.${quoteIdent(engine, table)}`;
  return `TRUNCATE TABLE ${quoteIdent(engine, schema)}.${quoteIdent(engine, table)}`;
}

/** Clear all rows without truncating identity (Navicat Empty Table). */
export function emptyTableSql(engine: string, schema: string, table: string): string | null {
  if (engineFamily(engine) !== "sql" || !schema.trim() || !table.trim()) return null;
  return `DELETE FROM ${quoteIdent(engine, schema)}.${quoteIdent(engine, table)}`;
}

/** Rename a table. Views are out of scope for this helper. */
export function renameObjectSql(
  engine: string,
  schema: string,
  from: string,
  to: string,
): string | null {
  if (engineFamily(engine) !== "sql" || !schema.trim() || !from.trim() || !to.trim()) return null;
  if (from === to) return null;
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(to)) return null;
  if (engine === "mysql" || engine === "mariadb") {
    return `RENAME TABLE ${quoteIdent(engine, schema)}.${quoteIdent(engine, from)} TO ${quoteIdent(engine, schema)}.${quoteIdent(engine, to)}`;
  }
  if (engine === "sqlserver") {
    return `EXEC sp_rename N'${schema.replace(/'/g, "''")}.${from.replace(/'/g, "''")}', N'${to.replace(/'/g, "''")}'`;
  }
  return `ALTER TABLE ${quoteIdent(engine, schema)}.${quoteIdent(engine, from)} RENAME TO ${quoteIdent(engine, to)}`;
}

/** A single read that asks the server for a view or table definition. Tables without that read are built locally. */
export function definitionSql(engine: string, kind: ObjectKind, schema: string, name: string): string | null {
  if (kind !== "table" && kind !== "view" && kind !== "materialized_view") return null;
  if (!schema.trim() || !name.trim()) return null;
  if (engine === "mysql" || engine === "mariadb") {
    return `SHOW CREATE TABLE ${quoteIdent(engine, schema)}.${quoteIdent(engine, name)}`;
  }
  if (engine === "postgres" && (kind === "view" || kind === "materialized_view")) {
    const regclass = `${quoteIdent(engine, schema)}.${quoteIdent(engine, name)}`;
    return `SELECT pg_get_viewdef(${sqlLiteral(regclass)}::regclass, true)`;
  }
  if (engine === "sqlite") return `SELECT sql FROM sqlite_master WHERE name = ${sqlLiteral(name)}`;
  return null;
}

export function tableDefinitionFromColumns(
  engine: string,
  schema: string,
  table: string,
  columns: ObjectColumn[],
): string | null {
  if (columns.length === 0) return null;
  return createTableSql(
    engine,
    schema,
    table,
    columns.map((column) => ({
      name: column.name,
      type: column.type.trim() || "text",
      nullable: !column.key,
      primary: column.key,
    })),
  );
}

export function rowsToCsv(columns: string[], rows: unknown[][]): string {
  const lines = [columns, ...rows].map((row) => row.map((cell) => csvCell(cell)).join(","));
  return lines.join("\n");
}

function csvCell(value: unknown): string {
  if (value == null) return "";
  const text = String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const ch = text[index];
    if (quoted) {
      if (ch === '"') {
        if (text[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }
    if (ch === '"') {
      quoted = true;
      continue;
    }
    if (ch === ",") {
      row.push(cell);
      cell = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((item) => item.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    cell += ch;
  }
  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    if (row.some((item) => item.length > 0)) rows.push(row);
  }
  return rows;
}

/** One INSERT for every data row. A header that matches the table columns is skipped. */
export function csvInsertSql(
  engine: string,
  schema: string,
  table: string,
  columns: string[],
  csv: string,
): string | null {
  if (engineFamily(engine) !== "sql" || columns.length === 0) return null;
  const parsed = parseCsv(csv);
  if (parsed.length === 0) return null;
  const header = parsed[0];
  const headerMatch = header.length === columns.length && header.every((cell, index) => cell === columns[index]);
  const data = headerMatch ? parsed.slice(1) : parsed;
  if (data.length === 0) return null;
  const names = columns.map((name) => quoteIdent(engine, name)).join(", ");
  const tuples = data.map((record) => {
    const values = columns.map((_, index) => sqlLiteral(record[index] === undefined || record[index] === "" ? null : record[index]));
    return `(${values.join(", ")})`;
  });
  return `INSERT INTO ${quoteIdent(engine, schema)}.${quoteIdent(engine, table)} (${names}) VALUES ${tuples.join(", ")}`;
}

export function redisSetCommand(key: string, value: string): string | null {
  const name = commandName(key);
  if (!name || value.includes('"') || value.includes("\n") || value.includes("\r")) return null;
  return `SET ${name} "${value}"`;
}

export function redisDelCommand(key: string): string | null {
  const name = commandName(key);
  return name ? `DEL ${name}` : null;
}

export function redisExpireCommand(key: string, seconds: number): string | null {
  const name = commandName(key);
  if (!name || !Number.isInteger(seconds) || seconds <= 0) return null;
  return `EXPIRE ${name} ${seconds}`;
}

export function redisPersistCommand(key: string): string | null {
  const name = commandName(key);
  return name ? `PERSIST ${name}` : null;
}

function mongoCollectionName(name: string): string | null {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : null;
}

/** Validate a MongoDB document / filter JSON object for insert/replace/delete. */
export function parseMongoJson(text: string): { ok: true; json: string } | { ok: false; error: string } {
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return { ok: false, error: "JSON object required" };
    }
    return { ok: true, json: JSON.stringify(value) };
  } catch {
    return { ok: false, error: "Invalid JSON" };
  }
}

function mongoDocument(text: string): string | null {
  const parsed = parseMongoJson(text);
  return parsed.ok ? parsed.json : null;
}

export function mongoInsertCommand(collection: string, document: string): string | null {
  const name = mongoCollectionName(collection);
  const body = mongoDocument(document);
  if (!name || !body) return null;
  return `db.${name}.insertOne(${body})`;
}

export function mongoDeleteCommand(collection: string, filter: string): string | null {
  const name = mongoCollectionName(collection);
  const body = mongoDocument(filter);
  if (!name || !body) return null;
  return `db.${name}.deleteOne(${body})`;
}

export function mongoReplaceCommand(collection: string, filter: string, document: string): string | null {
  const name = mongoCollectionName(collection);
  const left = mongoDocument(filter);
  const right = mongoDocument(document);
  if (!name || !left || !right) return null;
  return `db.${name}.replaceOne(${left}, ${right})`;
}

export type SavedQuery = { id: string; name: string; sql: string };

export type QueryStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

const SAVED_QUERY_KEY = "tw.db.savedQueries";

function savedMap(store: QueryStore): Record<string, SavedQuery[]> {
  try {
    const parsed = JSON.parse(store.getItem(SAVED_QUERY_KEY) ?? "{}") as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return parsed as Record<string, SavedQuery[]>;
  } catch {
    return {};
  }
}

export function readSavedQueries(connectionId: string, store: QueryStore): SavedQuery[] {
  const list = savedMap(store)[connectionId];
  if (!Array.isArray(list)) return [];
  return list.filter(
    (item) => item && typeof item.id === "string" && typeof item.name === "string" && typeof item.sql === "string",
  );
}

export function writeSavedQueries(connectionId: string, queries: SavedQuery[], store: QueryStore) {
  const all = savedMap(store);
  all[connectionId] = queries.map((item) => ({ id: item.id, name: item.name, sql: item.sql }));
  store.setItem(SAVED_QUERY_KEY, JSON.stringify(all));
}

export function forgetSavedQueries(connectionId: string, store: QueryStore) {
  const all = savedMap(store);
  delete all[connectionId];
  store.setItem(SAVED_QUERY_KEY, JSON.stringify(all));
}

export function rememberQuery(list: SavedQuery[], name: string, sql: string): SavedQuery[] {
  const title = name.trim();
  if (!title) return list;
  const existing = list.find((item) => item.name === title);
  if (existing) return list.map((item) => (item.id === existing.id ? { ...item, sql } : item));
  let seq = list.length + 1;
  while (list.some((item) => item.id === `saved-${seq}`)) seq += 1;
  return [...list, { id: `saved-${seq}`, name: title, sql }];
}

export function orderDatabases(names: string[], current: string): string[] {
  const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
  unique.sort((left, right) => left.localeCompare(right));
  if (!current) return unique;
  return [current, ...unique.filter((name) => name !== current)];
}

export function kindSchemas(nodes: ObjectNode[], kind: ObjectKind): string[] {
  return [...new Set(nodes.filter((node) => node.kind === kind).map((node) => node.schema))].sort((left, right) =>
    left.localeCompare(right),
  );
}

export function schemaNames(nodes: ObjectNode[]): string[] {
  return [...new Set(nodes.map((node) => node.schema).filter(Boolean))].sort((left, right) => left.localeCompare(right));
}

export function objectsIn(nodes: ObjectNode[], kind: ObjectKind | null, schema: string | null): ObjectNode[] {
  return nodes.filter((node) => (kind == null || node.kind === kind) && (schema == null || node.schema === schema));
}

/**
 * Navicat Object Pane scope. Connection → database list; database (schemas-first) →
 * schema list; schema / kind folder → one object type (default Tables).
 */
export type ObjectPaneLevel = "connection" | "database" | "kind" | "group";

export type ObjectBrowseState = {
  level: ObjectPaneLevel;
  database: string | null;
  kind: ObjectKind | null;
  schema: string | null;
  table: string | null;
  group: TableGroup | null;
};

export type ObjectPaneListRow = {
  name: string;
  schema: string;
  typeKey: "database" | "schema" | ObjectKind;
  action: "open-database" | "open-schema" | "open-object";
};

export function browseConnection(): ObjectBrowseState {
  return { level: "connection", database: null, kind: null, schema: null, table: null, group: null };
}

export function browseDatabase(engine: string, database: string): ObjectBrowseState {
  if (schemasFirst(engine)) {
    return { level: "database", database, kind: null, schema: null, table: null, group: null };
  }
  return {
    level: "kind",
    database,
    kind: objectKinds(engine)[0] ?? "table",
    schema: null,
    table: null,
    group: null,
  };
}

export function browseSchema(engine: string, database: string, schema: string): ObjectBrowseState {
  return {
    level: "kind",
    database,
    kind: objectKinds(engine)[0] ?? "table",
    schema,
    table: null,
    group: null,
  };
}

export function browseKind(
  database: string,
  kind: ObjectKind,
  schema: string | null,
): ObjectBrowseState {
  return { level: "kind", database, kind, schema, table: null, group: null };
}

export function browseGroup(
  database: string,
  kind: ObjectKind,
  schema: string,
  table: string,
  group: TableGroup,
): ObjectBrowseState {
  return { level: "group", database, kind, schema, table, group };
}

/** Breadcrumb crumbs: engine → database → schema → (table for groups). No stale schema. */
export function objectPaneCrumbs(engine: string, browse: ObjectBrowseState): string[] {
  const crumbs = [engine];
  if (browse.database) crumbs.push(browse.database);
  if (browse.schema) crumbs.push(browse.schema);
  if (browse.level === "group" && browse.table) crumbs.push(browse.table);
  return crumbs;
}

export function objectPaneRows(
  browse: ObjectBrowseState,
  databases: string[],
  nodes: ObjectNode[],
): ObjectPaneListRow[] {
  if (browse.level === "connection") {
    return databases.map((name) => ({
      name,
      schema: "",
      typeKey: "database",
      action: "open-database",
    }));
  }
  if (browse.level === "database" && browse.database) {
    return schemaNames(nodes).map((name) => ({
      name,
      schema: "",
      typeKey: "schema",
      action: "open-schema",
    }));
  }
  if (browse.level === "kind" && browse.database) {
    return objectsIn(nodes, browse.kind, browse.schema).map((node) => ({
      name: node.name,
      schema: node.schema,
      typeKey: node.kind,
      action: "open-object",
    }));
  }
  return [];
}

/** Count summary for the Object Pane footer (schemas / tables / …). */
export function objectPaneSummary(
  browse: ObjectBrowseState,
  databases: string[],
  nodes: ObjectNode[],
): { count: number; typeKey: string } | null {
  const rows = objectPaneRows(browse, databases, nodes);
  if (rows.length === 0 && browse.level === "connection") {
    return { count: 0, typeKey: "database" };
  }
  if (browse.level === "connection") return { count: rows.length, typeKey: "database" };
  if (browse.level === "database") return { count: rows.length, typeKey: "schema" };
  if (browse.level === "kind") return { count: rows.length, typeKey: browse.kind ?? "table" };
  return null;
}

export type CellEditorKind = "text" | "time" | "date" | "datetime" | "boolean" | "number";

/** Map SQL type name to a typed editor control (Navicat-aligned). */
export function cellEditorKind(sqlType: string | undefined | null): CellEditorKind {
  const t = (sqlType ?? "").trim().toLowerCase();
  if (!t) return "text";
  // Match `time`, `time(6)`, `timetz`, `time with/without time zone` — but not `timestamp…`.
  if (
    (t === "time" ||
      t.startsWith("time(") ||
      t === "timetz" ||
      t.startsWith("time ") ||
      t.startsWith("time with") ||
      t.startsWith("time without")) &&
    !t.includes("timestamp")
  ) {
    return "time";
  }
  if (t === "date") return "date";
  if (
    t === "timestamp" ||
    t.startsWith("timestamp(") ||
    t.includes("timestamp with") ||
    t === "timestamptz" ||
    t === "datetime" ||
    t.startsWith("datetime")
  ) {
    return "datetime";
  }
  if (t === "boolean" || t === "bool" || t === "bit") return "boolean";
  if (
    t === "int" ||
    t === "integer" ||
    t === "int2" ||
    t === "int4" ||
    t === "int8" ||
    t === "smallint" ||
    t === "bigint" ||
    t === "serial" ||
    t === "bigserial" ||
    t === "float" ||
    t === "float4" ||
    t === "float8" ||
    t === "real" ||
    t === "double" ||
    t === "double precision" ||
    t === "numeric" ||
    t.startsWith("numeric(") ||
    t === "decimal" ||
    t.startsWith("decimal(") ||
    t === "number" ||
    t.startsWith("number(")
  ) {
    return "number";
  }
  return "text";
}

/** Normalize a cell string for `<input type="time|date|datetime-local">`. */
export function cellEditorValue(kind: CellEditorKind, raw: unknown): string {
  if (raw == null) return "";
  const text = String(raw).trim();
  if (!text) return "";
  if (kind === "time") {
    // 20:15:00.000000 → 20:15:00
    const match = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (!match) return text;
    return `${match[1].padStart(2, "0")}:${match[2]}:${match[3] ?? "00"}`;
  }
  if (kind === "date") {
    const match = text.match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : text;
  }
  if (kind === "datetime") {
    // 2024-01-02 03:04:05.6 → 2024-01-02T03:04:05
    const normalized = text.replace(" ", "T");
    const match = normalized.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?)/);
    return match ? match[1] : normalized;
  }
  return text;
}

export function cellEditorInputType(kind: CellEditorKind): string {
  if (kind === "time") return "time";
  if (kind === "date") return "date";
  if (kind === "datetime") return "datetime-local";
  if (kind === "number") return "number";
  if (kind === "boolean") return "checkbox";
  return "text";
}

/** Whether the cell opens the Navicat-style date/time popup instead of a bare input. */
export function cellUsesDateTimePicker(kind: CellEditorKind): boolean {
  return kind === "time" || kind === "date" || kind === "datetime";
}

/**
 * When catalog column types are missing, infer a picker kind from the displayed value
 * (real PG grids often show `20:15:00.000000` without a joined type on the node).
 */
export function cellEditorKindFromValue(raw: unknown): CellEditorKind | null {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;
  if (/^\d{1,2}:\d{2}(?::\d{2})?(?:\.\d+)?$/.test(text)) return "time";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return "date";
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{1,2}:\d{2}/.test(text)) return "datetime";
  return null;
}

/** Prefer SQL type; fall back to value shape so time/date cells still get a picker. */
export function resolveCellEditorKind(sqlType: string | undefined | null, raw: unknown): CellEditorKind {
  const fromType = cellEditorKind(sqlType);
  if (fromType !== "text") return fromType;
  return cellEditorKindFromValue(raw) ?? "text";
}

export function connectionMatchesFilter(name: string, engine: string, filter: string): boolean {
  const needle = filter.trim().toLowerCase();
  if (!needle) return true;
  return name.toLowerCase().includes(needle) || engine.toLowerCase().includes(needle);
}

export function workspaceId(connectionId: string, database: string): string {
  return `${connectionId}::${database}`;
}

export function objectTabTitle(_schema: string, name: string): string {
  return name;
}

export function freshQueryTab(id: string, title: string): WorkbenchTab {
  return {
    id,
    title,
    kind: "query",
    sql: "",
    result: null,
    error: "",
    database: null,
    schema: null,
    objectName: null,
  };
}

export function freshObjectTab(
  id: string,
  database: string,
  node: Pick<ObjectNode, "kind" | "schema" | "name">,
): WorkbenchTab {
  return {
    id,
    title: objectTabTitle(node.schema, node.name),
    kind: node.kind,
    sql: "",
    result: null,
    error: "",
    database,
    schema: node.schema,
    objectName: node.name,
  };
}

export function findObjectTab(
  tabs: WorkbenchTab[],
  database: string,
  kind: ObjectKind,
  schema: string,
  name: string,
): WorkbenchTab | undefined {
  return tabs.find(
    (tab) =>
      tab.kind === kind &&
      tab.database === database &&
      (tab.schema ?? "") === (schema ?? "") &&
      tab.objectName === name,
  );
}

/** Next visible title for a new query tab: SQL 1, SQL 2, … */
export function nextSqlTabTitle(tabs: Array<{ title: string }>): string {
  let max = 0;
  for (const tab of tabs) {
    const match = /^SQL\s+(\d+)$/i.exec(tab.title.trim());
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `SQL ${max + 1}`;
}

/**
 * Switching connections drops query tabs (and their results) that belonged to
 * the previous revision. Object Pane is the default — no forced SQL 1.
 */
export function tabsAfterConnectionSwitch(_id?: string): WorkbenchTab[] {
  return [];
}
