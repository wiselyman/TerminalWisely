import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { DatabaseIcon } from "../WorkspaceToolIcons";
import { ColumnMark, EngineMark, GroupMark, ObjectMark } from "./DbIcons";
import { EngineSelect } from "./EngineSelect";
import {
  approvalStillMatches,
  dbCancelQuery,
  dbDeleteConnection,
  dbExplain,
  dbListConnections,
  dbListDatabases,
  dbListSavedQueries,
  dbQuery,
  dbRegisterLease,
  dbSaveConnection,
  dbSearchObjects,
  dbSearchStructure,
  dbStatus,
  dbTestConnection,
  dbWriteSavedQueries,
  type DbConnection,
  type DbQueryResponse,
} from "../../lib/db/api";
import { useAiEngineerStore } from "../../stores/aiEngineerStore";
import { useSessionStore } from "../../stores/sessionStore";
import {
  ENGINE_PORTS,
  EXPORT_ROW_BUDGET,
  GRID_PAGE_SIZE,
  OFFERED_ENGINES,
  buildObjectTree,
  cellUpdateSql,
  connectionMatchesFilter,
  createTableSql,
  csvInsertBatches,
  definitionSql,
  dropTableSql,
  engineFamily,
  filterGridRows,
  forgetSavedQueries,
  freshQueryTab,
  groupRows,
  hasTableStructure,
  mongoAuthDatabase,
  mongoDeleteCommand,
  mongoInsertCommand,
  mongoReplaceCommand,
  objectKinds,
  objectsIn,
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
  tableSelectSql,
  tableViewSql,
  tabsAfterConnectionSwitch,
  truncateTableSql,
  orderDatabases,
  pageWindow,
  previewCsvImport,
  type CsvColumnMap,
  type CsvImportPreview,
  type NewColumn,
  type ObjectColumn,
  type ObjectKind,
  type ObjectNode,
  type QueryTab,
  type SavedQuery,
  type SortDir,
  type TableGroup,
} from "./workbenchModel";

type FormState = {
  name: string;
  engine: string;
  host: string;
  port: string;
  database: string;
  user: string;
  password: string;
  redisAuth: "none" | "password" | "user";
  authDatabase: string;
  tls: string;
  tunnel: boolean;
  sshSessionId: string;
};

type ResultPane = "grid" | "summary" | "plan";

const EMPTY_FORM: FormState = {
  name: "",
  engine: "postgres",
  host: "",
  port: "5432",
  database: "",
  user: "",
  password: "",
  redisAuth: "password",
  authDatabase: "admin",
  tls: "disabled",
  tunnel: false,
  sshSessionId: "",
};

const KIND_LABEL: Record<ObjectKind, "dbTables" | "dbViews" | "dbMaterializedViews" | "dbRoutines" | "dbEvents" | "dbKeys" | "dbCollections"> = {
  table: "dbTables",
  view: "dbViews",
  materialized_view: "dbMaterializedViews",
  routine: "dbRoutines",
  event: "dbEvents",
  key: "dbKeys",
  collection: "dbCollections",
};

const GROUP_LABEL: Record<TableGroup, "dbFields" | "dbIndexes" | "dbForeignKeys" | "dbUniques" | "dbChecks" | "dbExclusions" | "dbRules" | "dbTriggers"> = {
  field: "dbFields",
  index: "dbIndexes",
  foreign_key: "dbForeignKeys",
  unique: "dbUniques",
  check: "dbChecks",
  exclusion: "dbExclusions",
  rule: "dbRules",
  trigger: "dbTriggers",
};

type ObjectBrowse = {
  database: string;
  kind: ObjectKind | null;
  schema: string | null;
  table: string | null;
  group: TableGroup | null;
};

type ObjectCacheEntry = { rows: unknown[][]; error: string; structureError: string };

type KeyspaceStat = { keys: number; expires: number; avgTtl: number };
type KeyView = { name: string; type: string; ttl: string; value: string; error: string };
type TableView = {
  schema: string;
  table: string;
  kind: "table" | "view" | "materialized_view";
  columns: ObjectColumn[];
  sortColumn: string | null;
  sortDir: SortDir;
  filter: string;
  page: number;
};
type RunStatus = "rows" | "approval" | "error" | "idle";

export function DbWorkbench() {
  const { t } = useTranslation(["shell", "common"]);
  const bindDbContext = useAiEngineerStore((s) => s.bindDbContext);
  const setDbSqlSink = useAiEngineerStore((s) => s.setDbSqlSink);
  const sessions = useSessionStore((s) => s.tabs);
  const liveSessions = sessions.filter(
    (tab) => tab.kind === "ssh" && tab.connectionStatus === "ready",
  );
  const [connections, setConnections] = useState<DbConnection[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [connectAttempt, setConnectAttempt] = useState(0);
  const [connectRequestId, setConnectRequestId] = useState<string | null>(null);
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const [connectFailure, setConnectFailure] = useState<{ id: string; message: string } | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [testOk, setTestOk] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [keyspace, setKeyspace] = useState<Record<string, KeyspaceStat>>({});
  const [keyView, setKeyView] = useState<KeyView | null>(null);
  const [contextOpen, setContextOpen] = useState(true);
  const [openDbs, setOpenDbs] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [tabs, setTabs] = useState<QueryTab[]>(() => [freshQueryTab("q1", "SQL 1")]);
  const [activeTabId, setActiveTabId] = useState("q1");
  const [databases, setDatabases] = useState<string[]>([]);
  const [objectCache, setObjectCache] = useState<Record<string, ObjectCacheEntry>>({});
  const [browse, setBrowse] = useState<ObjectBrowse | null>(null);
  const [gridFilter, setGridFilter] = useState("");
  const [gridPage, setGridPage] = useState(1);
  const [dataTarget, setDataTarget] = useState<{ schema: string; table: string } | null>(null);
  const [tableView, setTableView] = useState<TableView | null>(null);
  const [mongoCollection, setMongoCollection] = useState<string | null>(null);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [queryName, setQueryName] = useState("");
  const [redisDraft, setRedisDraft] = useState("");
  const [mongoDraft, setMongoDraft] = useState("{}");
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertValues, setInsertValues] = useState<string[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [createSchema, setCreateSchema] = useState("");
  const [createName, setCreateName] = useState("");
  const [createColumns, setCreateColumns] = useState<NewColumn[]>([
    { name: "id", type: "integer", nullable: false, primary: true },
  ]);
  const [exportNote, setExportNote] = useState("");
  const [importPreview, setImportPreview] = useState<CsvImportPreview | null>(null);
  const [importMapping, setImportMapping] = useState<CsvColumnMap[]>([]);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(null);
  const [filter, setFilter] = useState("");
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});
  const [activeSchema, setActiveSchema] = useState<string | null>(null);
  const [pane, setPane] = useState<ResultPane>("grid");
  const [planText, setPlanText] = useState("");
  const [pending, setPending] = useState<DbQueryResponse | null>(null);
  const [submittedSql, setSubmittedSql] = useState("SELECT 1");
  const [busy, setBusy] = useState(false);
  const sqlRef = useRef<HTMLTextAreaElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(36);
  const activeDatabase = useRef<string | null>(null);
  const operationId = useRef("");
  const importQueue = useRef<string[]>([]);
  const catalogSeq = useRef(0);
  const gutterRef = useRef<HTMLPreElement>(null);
  const chosenSql = useRef<string | null>(null);
  const requestSeq = useRef(0);
  const tableViewRef = useRef<TableView | null>(null);
  const mongoRef = useRef<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  tableViewRef.current = tableView;
  mongoRef.current = mongoCollection;
  const tabSeq = useRef(1);
  const [sidebarSlot, setSidebarSlot] = useState<HTMLElement | null>(null);
  const active = tabs.find((tab) => tab.id === activeTabId) ?? tabs[0];

  useLayoutEffect(() => {
    setSidebarSlot(document.getElementById("tw-db-sidebar-host"));
  }, []);

  const selected = connections.find((item) => item.id === selectedId) ?? null;

  function replaceActive(patch: Partial<QueryTab>) {
    setTabs((current) =>
      current.map((tab) => (tab.id === activeTabId ? { ...tab, ...patch } : tab)),
    );
  }

  function clearWork() {
    requestSeq.current += 1;
    const id = `q${(tabSeq.current += 1)}`;
    setTabs(tabsAfterConnectionSwitch(id));
    setActiveTabId(id);
    setDatabases([]);
    setObjectCache({});
    setKeyspace({});
    setKeyView(null);
    setBrowse(null);
    setPending(null);
    setDataTarget(null);
    setTableView(null);
    setMongoCollection(null);
    setInsertOpen(false);
    setPlanText("");
    setPane("grid");
    setBusy(false);
  }

  async function refresh(preferId?: string | null) {
    const listed = await dbListConnections();
    setConnections(listed);
    setSelectedId((current) => {
      const keep = preferId === undefined ? current : preferId;
      if (keep && listed.some((item) => item.id === keep)) return keep;
      return null;
    });
  }

  async function removeConnection(id: string) {
    try {
      await dbDeleteConnection(id);
      forgetSavedQueries(id, localStorage);
      await dbWriteSavedQueries(id, []).catch(() => undefined);
      if (selectedId === id) clearWork();
      await refresh(selectedId === id ? null : selectedId);
    } catch (err) {
      replaceActive({ error: String(err) });
    }
  }

  useEffect(() => {
    void refresh().catch((err: unknown) => replaceActive({ error: String(err) }));
  }, []);

  useEffect(() => {
    setDbSqlSink((sql) => {
      setTabs((current) =>
        current.map((tab) => {
          if (tab.id !== activeTabId) return tab;
          const base = tab.sql.trim();
          return { ...tab, sql: base ? `${base}\n${sql}` : sql };
        }),
      );
    });
    return () => setDbSqlSink(null);
  }, [activeTabId, setDbSqlSink]);

  function rememberDatabase(name: string) {
    activeDatabase.current = name;
  }

  function loadObjects(connectionId: string, revision: number, database: string, seq: number, engine: string) {
    const search = dbSearchObjects(connectionId, undefined, database);
    const structure = hasTableStructure(engine)
      ? dbSearchStructure(connectionId, undefined, database)
      : Promise.resolve(null);
    void Promise.allSettled([search, structure]).then(([searchResult, structureResult]) => {
      if (catalogSeq.current !== seq) return;
      if (searchResult.status === "rejected") {
        setObjectCache((current) => ({
          ...current,
          [database]: { rows: [], error: String(searchResult.reason), structureError: "" },
        }));
        return;
      }
      const rows = searchResult.value;
      if (rows.connection_id !== connectionId || rows.revision !== revision) return;
      let merged = rows.rows;
      let structureError = "";
      if (structureResult.status === "rejected") {
        structureError = String(structureResult.reason);
      } else if (structureResult.value) {
        const extra = structureResult.value;
        if (extra.connection_id === connectionId && extra.revision === revision) {
          merged = merged.concat(extra.rows);
        }
      }
      setObjectCache((current) => ({ ...current, [database]: { rows: merged, error: "", structureError } }));
    });
  }

  useEffect(() => {
    if (!selected || connectRequestId !== selected.id) return;
    const seq = (catalogSeq.current += 1);
    const connectionId = selected.id;
    const revision = selected.revision;
    const home = selected.engine === "sqlite" ? "main" : selected.database;
    rememberDatabase(home);
    setDatabases([]);
    setObjectCache({});
    setOpenDbs({});
    setConnectFailure((current) => (current?.id === connectionId ? null : current));
    setConnectingId(connectionId);
    setBrowse(null);
    setKeyView(null);
    setDataTarget(null);
    setTableView(null);
    setMongoCollection(null);
    setInsertOpen(false);
    setSavedQueries([]);
    void dbListSavedQueries(selected.id)
      .then(async (stored) => {
        if (stored.length > 0) {
          setSavedQueries(stored);
          return;
        }
        const local = readSavedQueries(selected.id, localStorage);
        if (local.length === 0) return;
        await dbWriteSavedQueries(selected.id, local);
        forgetSavedQueries(selected.id, localStorage);
        setSavedQueries(local);
      })
      .catch(() => setSavedQueries(readSavedQueries(selected.id, localStorage)));
    setKeyspace({});
    setEditorHeight(36);
    void dbListDatabases(connectionId)
      .then((rows) => {
        if (catalogSeq.current !== seq) return;
        if (rows.connection_id !== connectionId || rows.revision !== revision) return;
        const names = rows.rows.map((row) => String(row[0] ?? ""));
        setConnectingId((current) => (current === connectionId ? null : current));
        setDatabases(orderDatabases(names, home));
        setConnectFailure((current) => (current?.id === connectionId ? null : current));
        setOpenIds((current) => ({ ...current, [connectionId]: true }));
        setOpenDbs({ [home]: true });
        setBrowse({ database: home, kind: objectKinds(selected.engine)[0], schema: null, table: null, group: null });
        if (selected.engine === "redis") {
          const stats: Record<string, KeyspaceStat> = {};
          for (const row of rows.rows) {
            stats[String(row[0] ?? "")] = {
              keys: Number(row[1] ?? 0) || 0,
              expires: Number(row[2] ?? 0) || 0,
              avgTtl: Number(row[3] ?? 0) || 0,
            };
          }
          setKeyspace(stats);
        } else {
          setKeyspace({});
        }
        loadObjects(connectionId, revision, home, seq, selected.engine);
      })
      .catch((err: unknown) => {
        if (catalogSeq.current !== seq) return;
        setConnectingId((current) => (current === connectionId ? null : current));
        setDatabases([]);
        setOpenDbs({});
        setBrowse(null);
        setConnectFailure({ id: connectionId, message: String(err) });
        setOpenIds((current) => ({ ...current, [connectionId]: false }));
      });
  }, [selected, connectRequestId, connectAttempt]);

  useEffect(() => {
    setRedisDraft(keyView?.value ?? "");
  }, [keyView]);

  useEffect(() => {
    if (!selected || !active) return;
    bindDbContext({
      id: selected.id,
      name: selected.name,
      engine: selected.engine,
      revision: selected.revision,
      sshSessionId: selected.ssh_session_id || null,
      database: activeDatabase.current || selected.database,
      schema: activeSchema,
      selectedSql: active.sql,
    });
  }, [selected, activeSchema, active?.sql, browse, bindDbContext]);

  function nodesFor(database: string) {
    const rows = objectCache[database]?.rows ?? [];
    const showAll =
      !filter.trim() ||
      (selected != null && connectionMatchesFilter(selected.name, selected.engine, filter)) ||
      database.toLowerCase().includes(filter.trim().toLowerCase());
    return buildObjectTree(rows, showAll ? "" : filter);
  }

  const visibleConnections = connections.filter((item) => {
    if (connectionMatchesFilter(item.name, item.engine, filter)) return true;
    if (item.id !== selectedId) return false;
    const needle = filter.trim().toLowerCase();
    return databases.some(
      (name) =>
        name.toLowerCase().includes(needle) ||
        buildObjectTree(objectCache[name]?.rows ?? [], filter).length > 0,
    );
  });
  const listed = browse ? objectsIn(nodesFor(browse.database), browse.kind, browse.schema) : [];
  const groupNode =
    browse?.group && browse.table
      ? nodesFor(browse.database).find(
          (node) => node.name === browse.table && node.schema === browse.schema && node.kind === browse.kind,
        ) ?? null
      : null;
  const groupListing = browse?.group && groupNode ? groupRows(groupNode, browse.group) : null;
  const listingGroup = groupListing && browse?.group ? browse.group : null;

  function statementToRun(): string {
    const sql = active?.sql ?? "";
    if (chosenSql.current) return chosenSql.current;
    const field = sqlRef.current;
    if (field && field.selectionStart !== field.selectionEnd) {
      return sql.slice(field.selectionStart, field.selectionEnd);
    }
    return sql;
  }

  function openCreateForm() {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setFormError("");
    setTestOk(false);
    setFormOpen(true);
  }

  function connectionRequest() {
    const redis = form.engine === "redis";
    const mongo = form.engine === "mongodb";
    return {
      id: editingId,
      name: form.name,
      engine: form.engine,
      host: form.host,
      port: Number(form.port) || null,
      database: redis ? form.database || "0" : form.database,
      user: redis && form.redisAuth !== "user" ? "" : form.user,
      password: redis && form.redisAuth === "none" ? "" : form.password,
      tls: form.tls,
      ssh_session_id: form.tunnel ? form.sshSessionId : null,
      auth_database: mongo ? mongoAuthDatabase(form.authDatabase) : "",
      clear_secret: redis && form.redisAuth === "none",
    };
  }

  function openPasswordForm(item: DbConnection) {
    setForm({
      name: item.name,
      engine: item.engine,
      host: item.host,
      port: String(item.port),
      database: item.database,
      user: item.user,
      password: "",
      redisAuth: item.engine === "redis" ? redisAuthMode(item.user, Boolean(item.secret_id)) : "password",
      authDatabase: mongoAuthDatabase(item.auth_database ?? ""),
      tls: item.tls,
      tunnel: Boolean(item.ssh_session_id),
      sshSessionId: item.ssh_session_id ?? "",
    });
    setEditingId(item.id);
    setFormError("");
    setTestOk(false);
    setFormOpen(true);
  }

  async function save() {
    if (form.tunnel && !liveSessions.some((tab) => tab.id === form.sshSessionId)) {
      const message = t("dbTunnelRequired");
      setFormError(message);
      replaceActive({ error: message });
      return;
    }
    setFormError("");
    replaceActive({ error: "" });
    setBusy(true);
    try {
      const saved = await dbSaveConnection(connectionRequest());
      setForm(EMPTY_FORM);
      setEditingId(null);
      setFormError("");
      setTestOk(false);
      setFormOpen(false);
      await refresh(saved.id);
    } catch (err) {
      const message = String(err);
      setFormError(message);
      replaceActive({ error: message });
    } finally {
      setBusy(false);
    }
  }

  async function testConnection() {
    setFormError("");
    setTestOk(false);
    setBusy(true);
    try {
      await dbTestConnection(connectionRequest());
      setTestOk(true);
    } catch (err) {
      setFormError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function run(leaseId?: string, sqlOverride?: string, keepTarget = false): Promise<RunStatus> {
    if (!selected || !active) return "idle";
    if (!keepTarget) {
      tableViewRef.current = null;
      setDataTarget(null);
      setTableView(null);
      setMongoCollection(null);
      setKeyView(null);
      setInsertOpen(false);
      setGridFilter("");
      setGridPage(1);
    }
    const statement = sqlOverride ?? statementToRun();
    chosenSql.current = null;
    setSubmittedSql(statement);
    if (pending && !approvalStillMatches(pending.sql, statement)) {
      setPending(null);
    }
    const seq = requestSeq.current;
    const op = crypto.randomUUID();
    operationId.current = op;
    const connectionId = selected.id;
    const revision = selected.revision;
    const tabId = active.id;
    replaceActive({ error: "" });
    setBusy(true);
    try {
      const response = await dbQuery({
        connectionId,
        sql: statement,
        leaseId,
        database: activeDatabase.current,
        operationId: op,
      });
      if (requestSeq.current !== seq) return "idle";
      if (response.connection_id !== connectionId || response.revision !== revision) return "idle";
      if (response.kind === "needs_approval") {
        setPending(response);
        setTabs((current) =>
          current.map((tab) => (tab.id === tabId ? { ...tab, result: null } : tab)),
        );
        return "approval";
      }
      setPending(null);
      setPane("grid");
      setTabs((current) =>
        current.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                result: {
                  columns: response.columns,
                  rows: response.rows,
                  truncated: response.truncated,
                  connection_id: response.connection_id,
                  revision: response.revision,
                },
                error: "",
              }
            : tab,
        ),
      );
      return "rows";
    } catch (err) {
      if (requestSeq.current !== seq) return "idle";
      setPending(null);
      setTabs((current) =>
        current.map((tab) =>
          tab.id === tabId ? { ...tab, result: null, error: String(err) } : tab,
        ),
      );
      return "error";
    } finally {
      if (requestSeq.current === seq) setBusy(false);
    }
  }

  function columnNames(view: TableView, extra: string[] = []): string[] {
    return [...new Set([...view.columns.map((column) => column.name), ...extra])];
  }

  async function loadTable(view: TableView) {
    if (!selected) return;
    tableViewRef.current = view;
    const sql = tableViewSql(
      selected.engine,
      view.schema,
      view.table,
      columnNames(view, active?.result?.columns ?? []),
      view.sortColumn,
      view.sortDir,
      view.filter,
      view.page,
    );
    if (!sql) return;
    setTableView(view);
    setDataTarget(view.kind === "table" ? { schema: view.schema, table: view.table } : null);
    setGridFilter(view.filter);
    setGridPage(1);
    setInsertOpen(false);
    replaceActive({ sql, error: "" });
    await run(undefined, sql, true);
  }

  async function refreshOpenTarget() {
    const view = tableViewRef.current;
    if (view) {
      await loadTable(view);
      return;
    }
    if (keyView && selected) {
      await openRedisKey(activeDatabase.current || selected.database, keyView.name);
      return;
    }
    const collection = mongoRef.current;
    if (collection && selected) {
      const sql = tableSelectSql(selected.engine, "collection", "", collection);
      if (sql) {
        replaceActive({ sql, error: "" });
        await run(undefined, sql, true);
      }
    }
  }

  async function mutate(sql: string) {
    const status = await run(undefined, sql, true);
    if (status === "rows") await refreshOpenTarget();
  }

  async function approve() {
    if (!selected || !pending || !active) return;
    if (!approvalStillMatches(pending.sql, submittedSql)) {
      setPending(null);
      return;
    }
    const leaseId = await dbRegisterLease({
      connectionId: pending.connection_id,
      revision: pending.revision,
      operation: pending.operation,
      sql: pending.sql,
    });
    const status = await run(leaseId, pending.sql, true);
    if (status === "rows") {
      await refreshOpenTarget();
      const next = importQueue.current.shift();
      if (next) {
        setImportProgress((current) =>
          current ? { done: current.total - importQueue.current.length, total: current.total } : current,
        );
        await mutate(next);
      } else {
        setImportProgress(null);
      }
    } else if (status !== "approval") {
      importQueue.current = [];
      setImportProgress(null);
    }
  }

  async function openStatus(page: string) {
    if (!selected || !active) return;
    const seq = requestSeq.current;
    const connectionId = selected.id;
    const revision = selected.revision;
    const tabId = active.id;
    try {
      const response = await dbStatus(selected.id, page);
      if (requestSeq.current !== seq) return;
      if (response.connection_id !== connectionId || response.revision !== revision) return;
      setPending(null);
      setPane("grid");
      setTabs((current) =>
        current.map((tab) =>
          tab.id === tabId
            ? {
                ...tab,
                result: {
                  columns: response.columns,
                  rows: response.rows,
                  truncated: response.truncated,
                  connection_id: response.connection_id,
                  revision: response.revision,
                },
              }
            : tab,
        ),
      );
    } catch (err) {
      if (requestSeq.current !== seq) return;
      replaceActive({ error: String(err) });
    }
  }

  async function explain() {
    if (!selected || !active) return;
    const statement = statementToRun();
    const seq = requestSeq.current;
    const op = crypto.randomUUID();
    operationId.current = op;
    const connectionId = selected.id;
    const revision = selected.revision;
    setBusy(true);
    try {
      const response = await dbExplain({
        connectionId,
        sql: statement,
        database: activeDatabase.current,
        operationId: op,
      });
      if (requestSeq.current !== seq) return;
      if (response.connection_id !== connectionId || response.revision !== revision) return;
      if (response.kind === "needs_approval") {
        setPending(response);
        setSubmittedSql(response.sql);
        return;
      }
      setPlanText(response.rows.map((row) => row.map((cell) => String(cell ?? "")).join("\t")).join("\n"));
      setPane("plan");
    } catch (err) {
      if (requestSeq.current !== seq) return;
      replaceActive({ error: String(err) });
    } finally {
      if (requestSeq.current === seq) setBusy(false);
    }
  }

  function openAi() {
    if (!selected) return;
    useAiEngineerStore.setState({ open: true });
    void useAiEngineerStore.getState().ensureReady();
  }

  function addQueryTab() {
    const id = `q${(tabSeq.current += 1)}`;
    const title = `SQL ${tabs.length + 1}`;
    setTabs((current) => [...current, freshQueryTab(id, title)]);
    setActiveTabId(id);
    setPending(null);
    setBrowse(null);
    setEditorHeight(220);
  }

  function showObjects(database: string, kind: ObjectKind | null, schema: string | null) {
    rememberDatabase(database);
    if (schema) setActiveSchema(schema);
    setBrowse({ database, kind, schema, table: null, group: null });
    setKeyView(null);
    replaceActive({ result: null, error: "" });
    setPending(null);
    setPane("grid");
  }

  function showGroup(database: string, node: ObjectNode, group: TableGroup) {
    rememberDatabase(database);
    if (node.schema) setActiveSchema(node.schema);
    setBrowse({ database, kind: node.kind, schema: node.schema, table: node.name, group });
    setKeyView(null);
    replaceActive({ result: null, error: "" });
    setPending(null);
    setPane("grid");
  }

  async function openRedisKey(database: string, name: string) {
    if (!selected) return;
    rememberDatabase(database);
    setDataTarget(null);
    setBrowse(null);
    setKeyView(null);
    setEditorHeight(36);
    replaceActive({ sql: `GET ${name}`, result: null, error: "" });
    const seq = requestSeq.current;
    const connectionId = selected.id;
    setBusy(true);
    try {
      const settled = await Promise.allSettled([
        dbQuery({ connectionId, sql: `TYPE ${name}`, database }),
        dbQuery({ connectionId, sql: `TTL ${name}`, database }),
        dbQuery({ connectionId, sql: `GET ${name}`, database }),
      ]);
      if (requestSeq.current !== seq) return;
      const cell = (result: PromiseSettledResult<Awaited<ReturnType<typeof dbQuery>>>) => {
        if (result.status === "rejected") return { text: "", error: String(result.reason) };
        if (result.value.kind !== "rows") return { text: "", error: "" };
        return { text: String(result.value.rows[0]?.[0] ?? ""), error: "" };
      };
      const typeCell = cell(settled[0]);
      const ttlCell = cell(settled[1]);
      const valueCell = cell(settled[2]);
      const error = [typeCell.error, ttlCell.error, valueCell.error].filter(Boolean).join("\n");
      if (error && !typeCell.text && !ttlCell.text && !valueCell.text) {
        replaceActive({ error });
        return;
      }
      setKeyView({ name, type: typeCell.text, ttl: ttlCell.text, value: valueCell.text, error: valueCell.error });
      if (typeCell.error || ttlCell.error) replaceActive({ error: [typeCell.error, ttlCell.error].filter(Boolean).join("\n") });
    } finally {
      if (requestSeq.current === seq) setBusy(false);
    }
  }

  function openTable(engine: string, database: string, node: ObjectNode) {
    if (engine === "redis" && node.kind === "key") {
      setTableView(null);
      setMongoCollection(null);
      void openRedisKey(database, node.name);
      return;
    }
    rememberDatabase(database);
    setActiveSchema(node.schema);
    setEditorHeight(36);
    setBrowse(null);
    if (node.kind === "collection") {
      const sql = tableSelectSql(engine, node.kind, node.schema, node.name);
      if (!sql) return;
      setTableView(null);
      setDataTarget(null);
      setMongoCollection(node.name);
      setMongoDraft("{}");
      replaceActive({ sql, result: null, error: "" });
      void run(undefined, sql, true);
      return;
    }
    if (node.kind === "table" || node.kind === "view" || node.kind === "materialized_view") {
      setMongoCollection(null);
      void loadTable({
        schema: node.schema,
        table: node.name,
        kind: node.kind,
        columns: node.columns,
        sortColumn: null,
        sortDir: "asc",
        filter: "",
        page: 1,
      });
      return;
    }
    const sql = tableSelectSql(engine, node.kind, node.schema, node.name);
    if (!sql) return;
    setTableView(null);
    setDataTarget(null);
    setMongoCollection(null);
    replaceActive({ sql, result: null, error: "" });
    void run(undefined, sql, false);
  }

  function sortBy(column: string) {
    if (!tableView) return;
    const next: TableView = {
      ...tableView,
      sortColumn: column,
      sortDir: tableView.sortColumn === column && tableView.sortDir === "asc" ? "desc" : "asc",
      page: 1,
    };
    void loadTable(next);
  }

  function applyTableFilter(filter: string) {
    if (!tableView) return;
    void loadTable({ ...tableView, filter, page: 1 });
  }

  function turnPage(delta: number) {
    if (!tableView) {
      setGridPage((page) => Math.max(1, page + delta));
      return;
    }
    void loadTable({ ...tableView, page: Math.max(1, tableView.page + delta) });
  }

  function showDefinition() {
    if (!selected || !tableView) return;
    const read = definitionSql(selected.engine, tableView.kind, tableView.schema, tableView.table);
    if (read) {
      setTableView(null);
      setDataTarget(null);
      replaceActive({ sql: read, result: null, error: "" });
      void run(undefined, read, false);
      return;
    }
    const local = tableDefinitionFromColumns(selected.engine, tableView.schema, tableView.table, tableView.columns);
    if (!local) return;
    setTableView(null);
    setDataTarget(null);
    replaceActive({ sql: local, result: null, error: "" });
  }

  function openCreateTable() {
    if (!selected) return;
    setCreateSchema(activeSchema || tableView?.schema || selected.database || "main");
    setCreateName("");
    setCreateColumns([{ name: "id", type: "integer", nullable: false, primary: true }]);
    setCreateOpen(true);
  }

  function submitCreateTable() {
    if (!selected) return;
    const sql = createTableSql(selected.engine, createSchema, createName, createColumns);
    if (!sql) {
      replaceActive({ error: t("dbCommandFailed") });
      return;
    }
    setCreateOpen(false);
    replaceActive({ sql, error: "" });
    void run(undefined, sql, false);
  }

  function downloadCsv(name: string, columns: string[], rows: unknown[][]) {
    const text = rowsToCsv(columns, rows);
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name || "result"}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportPage() {
    const current = active?.result;
    if (!current) return;
    const visible = tableView ? current.rows : pageWindow(filterGridRows(current.rows, gridFilter), gridPage).rows;
    downloadCsv(tableView?.table || "result", current.columns, visible);
    setExportNote(t("dbExportPageNote"));
  }

  async function exportFiltered() {
    const current = active?.result;
    if (!current || !selected) return;
    if (!tableView) {
      downloadCsv("result", current.columns, filterGridRows(current.rows, gridFilter));
      setExportNote(current.truncated ? t("dbExportTruncated") : t("dbExportFilteredNote"));
      return;
    }
    const seq = requestSeq.current;
    const collected: unknown[][] = [];
    let truncated = false;
    let page = 1;
    while (collected.length < EXPORT_ROW_BUDGET) {
      const sql = tableViewSql(
        selected.engine,
        tableView.schema,
        tableView.table,
        tableView.columns.map((column) => column.name),
        tableView.sortColumn,
        tableView.sortDir,
        tableView.filter,
        page,
      );
      if (!sql) break;
      const op = crypto.randomUUID();
      operationId.current = op;
      setBusy(true);
      const response = await dbQuery({
        connectionId: selected.id,
        sql,
        rowLimit: GRID_PAGE_SIZE,
        database: activeDatabase.current,
        operationId: op,
      });
      if (requestSeq.current !== seq) {
        setBusy(false);
        return;
      }
      setBusy(false);
      if (response.kind !== "rows") break;
      collected.push(...response.rows);
      truncated = response.truncated;
      if (response.truncated || response.rows.length < GRID_PAGE_SIZE) break;
      page += 1;
    }
    if (requestSeq.current !== seq) return;
    const rows = collected.slice(0, EXPORT_ROW_BUDGET);
    if (collected.length > EXPORT_ROW_BUDGET) truncated = true;
    downloadCsv(tableView.table, current.columns, rows);
    setExportNote(truncated ? t("dbExportTruncated") : t("dbExportFilteredNote"));
  }

  async function importCsv(file: File) {
    if (!selected || !tableView || tableView.kind !== "table") return;
    const columns = tableView.columns.map((column) => column.name);
    const preview = previewCsvImport(columns, await file.text());
    if (!preview || preview.rowCount + preview.errors.length === 0) {
      replaceActive({ error: t("dbImportFailed") });
      return;
    }
    setImportMapping(preview.mapping);
    setImportPreview(preview);
  }

  async function confirmImport() {
    if (!selected || !tableView || !importPreview) return;
    const batches = csvInsertBatches(
      selected.engine,
      tableView.schema,
      tableView.table,
      importMapping,
      importPreview.rows,
    );
    if (batches.length === 0) {
      replaceActive({ error: t("dbImportFailed") });
      return;
    }
    importQueue.current = batches.slice(1);
    setImportProgress({ done: 0, total: batches.length });
    setImportPreview(null);
    await mutate(batches[0]);
  }

  function persistQueries(next: SavedQuery[]) {
    if (!selected) return;
    setSavedQueries(next);
    void dbWriteSavedQueries(selected.id, next).catch((err: unknown) => replaceActive({ error: String(err) }));
  }

  function saveCurrentQuery() {
    if (!selected || !active) return;
    persistQueries(rememberQuery(savedQueries, queryName || active.title, active.sql));
  }

  function deleteSavedQuery(id: string) {
    persistQueries(savedQueries.filter((query) => query.id !== id));
  }

  function submitInsert() {
    if (!selected || !tableView || tableView.kind !== "table") return;
    const names = tableView.columns.map((column) => column.name);
    const values = names.map((_, index) => {
      const text = insertValues[index] ?? "";
      return text === "" ? null : text;
    });
    const sql = rowInsertSql(selected.engine, tableView.schema, tableView.table, names, values);
    if (!sql) return;
    setInsertOpen(false);
    void mutate(sql);
  }

  function closeQueryTab(id: string) {
    setPending(null);
    setTabs((current) => {
      const next = current.filter((tab) => tab.id !== id);
      if (next.length === 0) {
        const freshId = `q${(tabSeq.current += 1)}`;
        setActiveTabId(freshId);
        return [freshQueryTab(freshId, "SQL 1")];
      }
      if (id === activeTabId) setActiveTabId(next[next.length - 1].id);
      return next;
    });
  }

  function toggleNode(key: string, defaultOpen: boolean) {
    setOpenNodes((current) => ({
      ...current,
      [key]: !(current[key] ?? defaultOpen),
    }));
  }

  const approvalMatches = pending
    ? approvalStillMatches(pending.sql, submittedSql)
    : false;
  const result = active?.result ?? null;

  const sqlText = active?.sql ?? "";
  const lineCount = Math.max(1, sqlText.split("\n").length);

  function renderObjectNode(databaseName: string, node: ObjectNode, nodeKey: string, engine: string, structureFailed: boolean) {
    const nodeOpen = openNodes[nodeKey] ?? false;
    const groups = tableGroups(engine, node.kind).filter((group) => !structureFailed || group === "field");
    return (
      <div key={node.name} className="k8s-tree-group">
        <button
          type="button"
          className="k8s-tree-group-label db-tree-object"
          onClick={() => toggleNode(nodeKey, false)}
          onDoubleClick={(event) => {
            event.preventDefault();
            if (selected) openTable(selected.engine, databaseName, node);
          }}
        >
          {nodeOpen ? <ChevronDown size={12} className="k8s-tree-chevron" /> : <ChevronRight size={12} className="k8s-tree-chevron" />}
          <span className="k8s-tree-icon">
            <ObjectMark kind={node.kind} />
          </span>
          <span>{node.name}</span>
        </button>
        {nodeOpen
          ? groups.map((group) => {
              const groupKey = `${nodeKey}:${group}`;
              const groupOpen = openNodes[groupKey] ?? false;
              const rows = groupRows(node, group);
              return (
                <div key={group} className="k8s-tree-group">
                  <button
                    type="button"
                    className="k8s-tree-group-label db-tree-member"
                    onClick={() => {
                      toggleNode(groupKey, false);
                      showGroup(databaseName, node, group);
                    }}
                  >
                    {groupOpen ? <ChevronDown size={12} className="k8s-tree-chevron" /> : <ChevronRight size={12} className="k8s-tree-chevron" />}
                    <span className="k8s-tree-icon">
                      <GroupMark group={group} />
                    </span>
                    <span>{t(GROUP_LABEL[group])}</span>
                  </button>
                  {groupOpen
                    ? rows.map((row) => (
                        <div key={row.name} className="k8s-tree-item db-tree-column">
                          <span className="k8s-tree-icon">
                            {group === "field" ? <ColumnMark primary={node.columns.some((column) => column.name === row.name && column.key)} /> : <GroupMark group={group} />}
                          </span>
                          <span>{row.name}</span>
                          {row.type ? <span className="db-column-type">{row.type}</span> : null}
                        </div>
                      ))
                    : null}
                </div>
              );
            })
          : null}
      </div>
    );
  }

  function renderKindBranch(databaseName: string, schemaName: string | null, kind: ObjectKind, keyPrefix: string, nodes: ObjectNode[], deeper = false) {
    const kindKey = `${keyPrefix}:${kind}`;
    const kindOpen = openNodes[kindKey] ?? true;
    const schemaNodes = nodes.filter((node) => node.kind === kind && (schemaName == null || node.schema === schemaName));
    return (
      <div key={kind} className="k8s-tree-group">
        <button
          type="button"
          className={`k8s-tree-group-label ${deeper ? "db-tree-under-schema" : "db-tree-deeper"}`}
          onClick={() => {
            toggleNode(kindKey, true);
            showObjects(databaseName, kind, schemaName);
          }}
        >
          {kindOpen ? <ChevronDown size={12} className="k8s-tree-chevron" /> : <ChevronRight size={12} className="k8s-tree-chevron" />}
          <span className="k8s-tree-icon">
            <ObjectMark kind={kind} />
          </span>
          <span>{t(KIND_LABEL[kind])}</span>
        </button>
        {kindOpen
          ? schemaNodes.map((node) =>
              renderObjectNode(
                databaseName,
                node,
                `${kindKey}:${node.name}`,
                selected?.engine ?? "",
                Boolean(objectCache[databaseName]?.structureError),
              ),
            )
          : null}
      </div>
    );
  }

  const nav = (
    <aside className="db-workbench-nav">
      <div className="entity-list-toolbar">
        <button
          type="button"
          className="entity-list-icon-btn entity-list-icon-btn--add"
          data-testid="db-connection-new"
          title={t("dbNewConnection")}
          aria-label={t("dbNewConnection")}
          onClick={openCreateForm}
        >
          <DatabaseIcon />
          <span className="entity-add-badge" aria-hidden />
        </button>
      </div>
      {connections.length === 0 ? (
        <p data-testid="db-nav-empty">{t("dbNavEmpty")}</p>
      ) : (
        <div className="k8s-tree db-object-tree" data-testid="db-connection-list">
          {visibleConnections.map((item) => {
            const open = openIds[item.id] ?? false;
            return (
              <div key={item.id} className="k8s-tree-group">
                <div className="db-connection-row">
                <button
                  type="button"
                  className={`k8s-tree-group-label${item.id === selectedId ? " active" : ""}`}
                  data-testid={`db-connection-${item.id}`}
                  aria-pressed={item.id === selectedId}
                  aria-busy={connectingId === item.id}
                  onClick={() => {
                    if (item.id !== selectedId) {
                      clearWork();
                      setSelectedId(item.id);
                      setConnectRequestId(item.id);
                      setConnectAttempt((attempt) => attempt + 1);
                      return;
                    }
                    if (open) {
                      setOpenIds((current) => ({ ...current, [item.id]: false }));
                      return;
                    }
                    setConnectRequestId(item.id);
                    setConnectAttempt((attempt) => attempt + 1);
                  }}
                >
                  {connectingId === item.id ? (
                    <span className="db-connect-spinner" data-testid="db-connect-loading" aria-hidden />
                  ) : open ? (
                    <ChevronDown size={12} className="k8s-tree-chevron" />
                  ) : (
                    <ChevronRight size={12} className="k8s-tree-chevron" />
                  )}
                  <span className="k8s-tree-icon">
                    <EngineMark engine={item.engine} />
                  </span>
                  <span>{item.name}</span>
                  <span className="db-engine-label">{item.engine}</span>
                  {connectFailure?.id === item.id ? (
                    <span className="db-connect-hint" data-testid="db-connect-hint" title={connectFailure.message}>
                      {t("dbConnectFailed")}
                    </span>
                  ) : null}
                </button>
                <div className="saved-item-actions">
                  <button
                    type="button"
                    className="saved-item-action"
                    data-testid={`db-connection-edit-${item.id}`}
                    aria-label={t("common:edit")}
                    title={t("common:edit")}
                    onClick={() => openPasswordForm(item)}
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.2" aria-hidden>
                      <path d="M11.5 2.5 13.5 4.5 5.5 12.5 3 13l.5-2.5 8-8Z" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    className="saved-item-action saved-item-delete"
                    data-testid={`db-connection-delete-${item.id}`}
                    aria-label={t("common:delete")}
                    title={t("common:delete")}
                    onClick={() => void removeConnection(item.id)}
                  >
                    <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                      <path
                        fill="currentColor"
                        d="M6.5 1h3a.5.5 0 0 1 .5.5v1H6v-1a.5.5 0 0 1 .5-.5ZM11 2.5v-1A1.5 1.5 0 0 0 9.5 0h-3A1.5 1.5 0 0 0 5 1.5v1H2.506a.58.58 0 0 0-.01 0H1.5a.5.5 0 0 0 0 1h.538l.853 10.66A2 2 0 0 0 4.885 16h6.23a2 2 0 0 0 1.994-1.84l.853-10.66h.538a.5.5 0 0 0 0-1h-.997a.58.58 0 0 0-.01 0H11Zm1.958 1H3.042l.853 10.66A1 1 0 0 0 4.885 15h6.23a1 1 0 0 0 .99-1.84l.853-10.66Z"
                      />
                    </svg>
                  </button>
                </div>
                </div>
                {open && item.id === selectedId ? (
                  <div className="k8s-tree-children db-schema" data-testid="db-schema">
                    {databases.filter((databaseName) => {
                      if (!filter.trim() || connectionMatchesFilter(item.name, item.engine, filter)) return true;
                      if (databaseName.toLowerCase().includes(filter.trim().toLowerCase())) return true;
                      return nodesFor(databaseName).length > 0;
                    }).map((databaseName) => {
                      const dbKey = `${item.id}:${databaseName}`;
                      const dbOpen = openDbs[databaseName] ?? false;
                      const entry = objectCache[databaseName];
                      const nodes = nodesFor(databaseName);
                      return (
                        <div key={databaseName} className="k8s-tree-group">
                          <button
                            type="button"
                            className="k8s-tree-group-label db-tree-nested"
                            onClick={() => {
                              const willOpen = !dbOpen;
                              setOpenDbs((current) => ({ ...current, [databaseName]: willOpen }));
                              showObjects(databaseName, objectKinds(item.engine)[0], null);
                              if (willOpen && !entry) {
                                loadObjects(item.id, item.revision, databaseName, catalogSeq.current, item.engine);
                              }
                            }}
                          >
                            {dbOpen ? (
                              <ChevronDown size={12} className="k8s-tree-chevron" />
                            ) : (
                              <ChevronRight size={12} className="k8s-tree-chevron" />
                            )}
                            <span className="k8s-tree-icon">
                              <ObjectMark kind="database" />
                            </span>
                            <span>{databaseName}</span>
                          </button>
                          {dbOpen ? (
                            <>
                              {entry?.error ? (
                                <div className="db-schema-error">
                                  <p>
                                    {entry.error.includes("password is missing")
                                      ? t("dbPasswordMissing")
                                      : entry.error}
                                  </p>
                                  {entry.error.includes("password is missing") ? (
                                    <button type="button" onClick={() => openPasswordForm(item)}>
                                      {t("dbRetypePassword")}
                                    </button>
                                  ) : null}
                                </div>
                              ) : (
                                <>
                                {entry?.structureError ? <p className="db-schema-error">{entry.structureError}</p> : null}
                                {schemasFirst(item.engine) ? (
                                  schemaNames(nodes).map((schemaName) => {
                                    const schemaKey = `${dbKey}:${schemaName}`;
                                    const schemaOpen = openNodes[schemaKey] ?? true;
                                    return (
                                      <div key={schemaName} className="k8s-tree-group">
                                        <button
                                          type="button"
                                          className="k8s-tree-group-label db-tree-schema"
                                          onClick={() => {
                                            toggleNode(schemaKey, true);
                                            showObjects(databaseName, null, schemaName);
                                          }}
                                        >
                                          {schemaOpen ? (
                                            <ChevronDown size={12} className="k8s-tree-chevron" />
                                          ) : (
                                            <ChevronRight size={12} className="k8s-tree-chevron" />
                                          )}
                                          <span className="k8s-tree-icon">
                                            <ObjectMark kind="schema" />
                                          </span>
                                          <span>{schemaName}</span>
                                        </button>
                                        {schemaOpen
                                          ? objectKinds(item.engine).map((kind) => renderKindBranch(databaseName, schemaName, kind, schemaKey, nodes, true))
                                          : null}
                                      </div>
                                    );
                                  })
                                ) : (
                                  objectKinds(item.engine).map((kind) => renderKindBranch(databaseName, null, kind, dbKey, nodes, false))
                                )}
                                </>
                              )}
                            </>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
      <input
        className="db-object-search"
        data-testid="db-object-search"
        placeholder={t("dbSearchObjects")}
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
    </aside>
  );

  return (
    <section className="db-workbench" data-testid="db-workbench">
      {sidebarSlot ? createPortal(nav, sidebarSlot) : nav}
      <div className="db-workbench-main" ref={mainRef}>
        <div className="db-query-tabs" data-testid="db-query-tabs">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab${tab.id === activeTabId ? " active" : ""}`}
              data-testid="db-query-tab"
              aria-pressed={tab.id === activeTabId}
              onClick={() => {
                setActiveTabId(tab.id);
                setPending(null);
              }}
            >
              <span className="tab-title">{tab.title}</span>
              <button
                type="button"
                className="tab-close"
                aria-label={t("dbClose")}
                onClick={(event) => {
                  event.stopPropagation();
                  closeQueryTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="tab"
            data-testid="db-new-query"
            title={t("dbNewQuery")}
            aria-label={t("dbNewQuery")}
            onClick={addQueryTab}
          >
            +
          </button>
        </div>
        {selected ? (
          <div className="db-context-bar">
            <button
              type="button"
              data-testid="db-context-toggle"
              aria-expanded={contextOpen}
              onClick={() => setContextOpen((open) => !open)}
            >
              {contextOpen ? "▾" : "▸"}
            </button>
            {contextOpen ? (
              <p data-testid="db-context">
                {[
                  selected.engine,
                  browse?.database || selected.database,
                  browse?.schema || activeSchema || "",
                  keyView?.name || dataTarget?.table || "",
                ]
                  .filter((crumb) => crumb.trim())
                  .map((crumb, index) => (
                    <span key={`${index}:${crumb}`}>
                      {index > 0 ? <span className="db-context-sep"> → </span> : null}
                      {crumb}
                    </span>
                  ))}
                {selected.engine === "redis" ? (
                  <span>
                    {t("dbKeyCount")} {keyspace[browse?.database || selected.database]?.keys ?? 0} {t("dbKeyExpires")}{" "}
                    {keyspace[browse?.database || selected.database]?.expires ?? 0} {t("dbKeyAvgTtl")}{" "}
                    {keyspace[browse?.database || selected.database]?.avgTtl ?? 0}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="db-result">
        {active?.error ? (
          <p className="db-error" data-testid="db-error">
            {active.error}
          </p>
        ) : null}
        {pending && approvalMatches ? (
          <div
            className="ai-engineer-exec-card is-expanded is-approval"
            data-testid="ai-engineer-approval-card"
            data-ai-approval="1"
          >
            <p data-testid="db-approval-name">{selected?.name}</p>
            <p>{pending.sql}</p>
            <div className="ai-engineer-approval-actions">
              <button type="button" data-testid="ai-engineer-approval-reject" onClick={() => {
                importQueue.current = [];
                setImportProgress(null);
                setPending(null);
              }}>
                {t("dbReject")}
              </button>
              <button
                type="button"
                className="find-panel-run is-primary"
                data-testid="ai-engineer-approval-once"
                onClick={() => void approve()}
              >
                {t("dbApprove")}
              </button>
            </div>
          </div>
        ) : null}
        {browse && !active?.error && !result && !keyView && objectCache[browse.database]?.error ? (
          <p className="db-error" data-testid="db-error">
            {objectCache[browse.database]?.error}
          </p>
        ) : browse && !active?.error && !result && !keyView && !(pending && approvalMatches) ? (
          <div className="db-object-list" data-testid="db-object-list">
            <table className="k8s-table">
              <thead>
                <tr>
                  <th>{t("dbName")}</th>
                  <th>{t("dbSchema")}</th>
                  <th>{t("dbKind")}</th>
                </tr>
              </thead>
              <tbody>
                {groupListing && listingGroup ? (
                  groupListing.map((row) => (
                    <tr key={row.name}>
                      <td>{row.name}</td>
                      <td>{groupNode?.schema}</td>
                      <td>{row.type || t(GROUP_LABEL[listingGroup])}</td>
                    </tr>
                  ))
                ) : (
                  listed.map((node) => (
                    <tr
                      key={`${node.kind}:${node.schema}:${node.name}`}
                      onDoubleClick={() => selected && openTable(selected.engine, browse.database, node)}
                    >
                      <td>{node.name}</td>
                      <td>{node.schema}</td>
                      <td>{t(KIND_LABEL[node.kind])}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <>
        <div className="db-result-panes">
          <button type="button" className={`tab${pane === "grid" ? " active" : ""}`} data-testid="db-result-grid" aria-pressed={pane === "grid"} onClick={() => setPane("grid")}>
            {t("dbResultGrid")}
          </button>
          <button type="button" className={`tab${pane === "summary" ? " active" : ""}`} data-testid="db-result-summary" aria-pressed={pane === "summary"} onClick={() => setPane("summary")}>
            {t("dbResultSummary")}
          </button>
          <button type="button" className={`tab${pane === "plan" ? " active" : ""}`} data-testid="db-result-plan-tab" aria-pressed={pane === "plan"} onClick={() => setPane("plan")}>
            {t("dbResultPlan")}
          </button>
        </div>
        <div className="db-result-body">
        {pane === "summary" && result ? (
          <p data-testid="db-summary">
            {t("dbSummaryCount", { count: result.rows.length, truncated: result.truncated ? 1 : 0 })}
          </p>
        ) : null}
        {pane === "plan" ? <pre data-testid="db-plan">{planText}</pre> : null}
        {pane === "grid" && keyView ? (
          <div className="db-key-view" data-testid="db-key-view">
            <p>{keyView.name}</p>
            <p>
              {t("dbKeyType")} {keyView.type}
            </p>
            <p>
              {t("dbKeyTtl")} {keyView.ttl}
            </p>
            {keyView.error ? <p className="db-error">{keyView.error}</p> : null}
            <p>{t("dbKeyValue")}</p>
            <textarea
              data-testid="db-redis-value"
              value={redisDraft}
              spellCheck={false}
              onChange={(event) => setRedisDraft(event.target.value)}
            />
            <div className="db-doc-actions">
              <button
                type="button"
                data-testid="db-redis-set"
                onClick={() => {
                  const sql = redisSetCommand(keyView.name, redisDraft);
                  if (!sql) {
                    replaceActive({ error: t("dbCommandFailed") });
                    return;
                  }
                  replaceActive({ sql, error: "" });
                  void mutate(sql);
                }}
              >
                {t("dbRedisSet")}
              </button>
              <button
                type="button"
                data-testid="db-redis-del"
                onClick={() => {
                  const sql = redisDelCommand(keyView.name);
                  if (!sql) return;
                  replaceActive({ sql, error: "" });
                  void mutate(sql);
                }}
              >
                {t("dbRedisDel")}
              </button>
            </div>
          </div>
        ) : null}
        {pane === "grid" && !keyView && result && result.rows.length === 0 && !tableView && !active?.error ? (
          <p data-testid="db-empty">{t("dbEmpty")}</p>
        ) : null}
        {pane === "grid" && !keyView && result && result.rows.length > 0 && selected && resultPresentation(selected.engine) === "documents" ? (
          <div data-testid="db-results" className="db-json-view">
            <p data-testid="db-sample-fields">
              {t("dbSampleFields")} {sampleFieldNames(result.rows.map((row) => String(row[0] ?? ""))).join(", ")}
            </p>
            {mongoCollection ? (
              <div className="db-doc-actions">
                <textarea
                  data-testid="db-mongo-draft"
                  value={mongoDraft}
                  spellCheck={false}
                  onChange={(event) => setMongoDraft(event.target.value)}
                />
                <button
                  type="button"
                  data-testid="db-mongo-insert"
                  onClick={() => {
                    const sql = mongoInsertCommand(mongoCollection, mongoDraft);
                    if (!sql) {
                      replaceActive({ error: t("dbCommandFailed") });
                      return;
                    }
                    replaceActive({ sql, error: "" });
                    void mutate(sql);
                  }}
                >
                  {t("dbMongoInsert")}
                </button>
              </div>
            ) : null}
            {result.rows.map((row, index) => {
              const text = String(row[0] ?? "");
              return (
                <div key={`${index}:${text}`}>
                  <textarea data-testid="db-mongo-doc" defaultValue={text} spellCheck={false} />
                  {mongoCollection ? (
                    <div className="db-doc-actions">
                      <button
                        type="button"
                        data-testid="db-mongo-replace"
                        onClick={(event) => {
                          const field = event.currentTarget.parentElement?.parentElement?.querySelector("textarea");
                          const sql = mongoReplaceCommand(mongoCollection, text, field?.value ?? text);
                          if (!sql) {
                            replaceActive({ error: t("dbCommandFailed") });
                            return;
                          }
                          replaceActive({ sql, error: "" });
                          void mutate(sql);
                        }}
                      >
                        {t("dbMongoReplace")}
                      </button>
                      <button
                        type="button"
                        data-testid="db-mongo-delete"
                        onClick={() => {
                          const sql = mongoDeleteCommand(mongoCollection, text);
                          if (!sql) return;
                          replaceActive({ sql, error: "" });
                          void mutate(sql);
                        }}
                      >
                        {t("dbMongoDelete")}
                      </button>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
        {pane === "grid" && !keyView && result && result.rows.length > 0 && selected && resultPresentation(selected.engine) === "values" ? (
          <div data-testid="db-results" className="db-value-view">
            {result.rows.map((row, index) => (
              <pre key={index}>{row.map((cell) => (cell == null ? "" : String(cell))).join("\t")}</pre>
            ))}
          </div>
        ) : null}
        {pane === "grid" && !keyView && result && (result.rows.length > 0 || tableView) && (!selected || resultPresentation(selected.engine) === "grid") ? (
          <div data-testid="db-results">
            {result.truncated ? <p data-testid="db-truncated">{t("dbTruncated")}</p> : null}
            {result.rows.length === 0 ? <p data-testid="db-empty">{t("dbEmpty")}</p> : null}
            <div className="db-grid-nav">
              <input
                data-testid="db-grid-filter"
                value={gridFilter}
                placeholder={t("dbGridFilter")}
                onChange={(event) => {
                  setGridFilter(event.target.value);
                  if (!tableView) setGridPage(1);
                }}
                onBlur={() => {
                  if (tableView) applyTableFilter(gridFilter);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && tableView) {
                    event.preventDefault();
                    applyTableFilter(gridFilter);
                  }
                }}
              />
              <button type="button" data-testid="db-grid-prev" onClick={() => turnPage(-1)}>
                {t("dbGridPrev")}
              </button>
              <button type="button" data-testid="db-grid-next" onClick={() => turnPage(1)}>
                {t("dbGridNext")}
              </button>
              {tableView ? (
                <>
                  {tableView.kind === "table" ? (
                    <button
                      type="button"
                      data-testid="db-row-insert"
                      onClick={() => {
                        setInsertValues(tableView.columns.map(() => ""));
                        setInsertOpen(true);
                      }}
                    >
                      {t("dbInsert")}
                    </button>
                  ) : null}
                  <button type="button" data-testid="db-definition" onClick={showDefinition}>
                    {t("dbDefinition")}
                  </button>
                  {tableView.kind === "table" ? (
                    <>
                      <button
                        type="button"
                        data-testid="db-drop-table"
                        onClick={() => {
                          if (!selected) return;
                          const sql = dropTableSql(selected.engine, tableView.schema, tableView.table);
                          if (!sql) return;
                          replaceActive({ sql, error: "" });
                          void run(undefined, sql, false);
                        }}
                      >
                        {t("dbDropTable")}
                      </button>
                      <button
                        type="button"
                        data-testid="db-truncate-table"
                        onClick={() => {
                          if (!selected) return;
                          const sql = truncateTableSql(selected.engine, tableView.schema, tableView.table);
                          if (!sql) return;
                          replaceActive({ sql, error: "" });
                          void mutate(sql);
                        }}
                      >
                        {t("dbTruncate")}
                      </button>
                    </>
                  ) : null}
                </>
              ) : null}
            </div>
            {insertOpen && tableView?.kind === "table" ? (
              <div className="db-insert-row" data-testid="db-insert-row">
                {tableView.columns.map((column, index) => (
                  <label key={column.name}>
                    {column.name}
                    <input
                      value={insertValues[index] ?? ""}
                      onChange={(event) => {
                        const next = [...insertValues];
                        next[index] = event.target.value;
                        setInsertValues(next);
                      }}
                    />
                  </label>
                ))}
                <button type="button" data-testid="db-insert-save" onClick={submitInsert}>
                  {t("dbRun")}
                </button>
              </div>
            ) : null}
            <table className="k8s-table">
              <thead>
                <tr>
                  {(result.columns.length > 0 ? result.columns : tableView?.columns.map((column) => column.name) ?? []).map((column) => (
                    <th key={column}>
                      {tableView ? (
                        <button type="button" className="db-sort" data-testid={`db-sort-${column}`} onClick={() => sortBy(column)}>
                          {column}
                          {tableView.sortColumn === column ? (tableView.sortDir === "asc" ? " ↑" : " ↓") : ""}
                        </button>
                      ) : (
                        column
                      )}
                    </th>
                  ))}
                  {dataTarget ? <th /> : null}
                </tr>
              </thead>
              <tbody>
                {(tableView ? result.rows : pageWindow(filterGridRows(result.rows, gridFilter), gridPage).rows).map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => {
                      const editable = dataTarget != null && selected != null && engineFamily(selected.engine) === "sql";
                      return (
                        <td key={cellIndex}>
                          {editable ? (
                            <input
                              defaultValue={cell == null ? "" : String(cell)}
                              onBlur={(event) => {
                                if (!selected || !dataTarget) return;
                                const sql = cellUpdateSql(
                                  selected.engine,
                                  dataTarget.schema,
                                  dataTarget.table,
                                  result.columns,
                                  row,
                                  cellIndex,
                                  event.target.value,
                                );
                                if (sql) void mutate(sql);
                              }}
                            />
                          ) : cell == null ? (
                            ""
                          ) : (
                            String(cell)
                          )}
                        </td>
                      );
                    })}
                    {dataTarget && selected && tableView ? (
                      <td>
                        <button
                          type="button"
                          data-testid="db-row-delete"
                          onClick={() => {
                            const names = tableView.columns.length > 0 ? tableView.columns.map((column) => column.name) : result.columns;
                            const values = names.map((name) => {
                              const cellIndex = result.columns.indexOf(name);
                              return cellIndex < 0 ? null : row[cellIndex];
                            });
                            const sql = rowDeleteSql(selected.engine, tableView.schema, tableView.table, names, values);
                            if (sql) void mutate(sql);
                          }}
                        >
                          {t("dbDeleteRow")}
                        </button>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        </div>
          </>
        )}
        <p className="db-readonly-hint" data-testid="db-readonly-hint">
          {t("dbReadonlyHint")}
        </p>
        </div>
        <div
          className="db-editor-resize"
          role="separator"
          aria-orientation="horizontal"
          onPointerDown={(event) => {
            event.preventDefault();
            const startY = event.clientY;
            const startHeight = editorHeight;
            const move = (pointer: PointerEvent) => {
              const room = mainRef.current?.clientHeight ?? 640;
              const max = Math.max(32, room - 180);
              setEditorHeight(Math.min(max, Math.max(32, startHeight + startY - pointer.clientY)));
            };
            const stop = () => {
              window.removeEventListener("pointermove", move);
              window.removeEventListener("pointerup", stop);
            };
            window.addEventListener("pointermove", move);
            window.addEventListener("pointerup", stop);
          }}
        />
        <div className="db-editor" style={{ height: editorHeight }}>
          <pre ref={gutterRef} className="db-editor-gutter" aria-hidden>
            {Array.from({ length: lineCount }, (_, index) => (
              <span key={index}>{index + 1}</span>
            ))}
          </pre>
          <textarea
            ref={sqlRef}
            data-testid="db-sql"
            value={sqlText}
            spellCheck={false}
            onScroll={(event) => {
              if (gutterRef.current) gutterRef.current.scrollTop = event.currentTarget.scrollTop;
            }}
            onChange={(event) => {
              const next = event.target.value;
              replaceActive({ sql: next });
              if (tableViewRef.current) {
                tableViewRef.current = null;
                setTableView(null);
                setDataTarget(null);
              }
              if (pending && !approvalStillMatches(pending.sql, next)) setPending(null);
            }}
          />
        </div>
        <div className="db-status-actions">
          <button
            type="button"
            className="find-panel-run primary"
            data-testid="db-run"
            disabled={!selected || busy}
            onMouseDown={(event) => {
              event.preventDefault();
              const field = sqlRef.current;
              const sql = active?.sql ?? "";
              chosenSql.current =
                field && field.selectionStart !== field.selectionEnd
                  ? sql.slice(field.selectionStart, field.selectionEnd)
                  : null;
            }}
            onClick={() => void run()}
          >
            {t("dbRun")}
          </button>
          <button
            type="button"
            data-testid="db-cancel"
            disabled={!busy}
            onClick={() => {
              requestSeq.current += 1;
              const id = operationId.current;
              operationId.current = "";
              importQueue.current = [];
              setImportProgress(null);
              setBusy(false);
              if (id) void dbCancelQuery(id);
            }}
          >
            {t("dbCancel")}
          </button>
          <button type="button" data-testid="db-explain" disabled={!selected || busy} onClick={() => void explain()}>
            {t("dbResultPlan")}
          </button>
          <button type="button" data-testid="db-export-page" disabled={!result} onClick={exportPage}>
            {t("dbExportPage")}
          </button>
          <button type="button" data-testid="db-export-filtered" disabled={!result || busy} onClick={() => void exportFiltered()}>
            {t("dbExportFiltered")}
          </button>
          <button
            type="button"
            data-testid="db-import-csv"
            disabled={!tableView || tableView.kind !== "table" || busy}
            onClick={() => importRef.current?.click()}
          >
            {t("dbImportCsv")}
          </button>
          <input
            ref={importRef}
            data-testid="db-import-file"
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importCsv(file);
            }}
          />
          {selected && engineFamily(selected.engine) === "sql" ? (
            <button type="button" data-testid="db-create-table" onClick={openCreateTable}>
              {t("dbCreateTable")}
            </button>
          ) : null}
          <input
            data-testid="db-query-name"
            value={queryName}
            placeholder={t("dbQueryName")}
            onChange={(event) => setQueryName(event.target.value)}
          />
          <button type="button" data-testid="db-save-query" disabled={!selected || !active} onClick={saveCurrentQuery}>
            {t("dbSaveQuery")}
          </button>
          <select
            data-testid="db-saved-queries"
            value=""
            onChange={(event) => {
              const item = savedQueries.find((query) => query.id === event.target.value);
              if (!item) return;
              setQueryName(item.name);
              tableViewRef.current = null;
              setTableView(null);
              setDataTarget(null);
              replaceActive({ sql: item.sql, result: null, error: "" });
            }}
          >
            <option value="">{t("dbSavedQueries")}</option>
            {savedQueries.map((query) => (
              <option key={query.id} value={query.id}>
                {query.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            data-testid="db-delete-query"
            disabled={!savedQueries.some((query) => query.name === queryName.trim())}
            onClick={() => {
              const item = savedQueries.find((query) => query.name === queryName.trim());
              if (item) deleteSavedQuery(item.id);
            }}
          >
            {t("dbDeleteQuery")}
          </button>
          <div className="db-status-secondary">
            <button type="button" data-testid="db-status-sessions" onClick={() => void openStatus("sessions")}>
              {t("dbSessions")}
            </button>
            <button type="button" data-testid="db-status-locks" onClick={() => void openStatus("locks")}>
              {t("dbLocks")}
            </button>
            <button type="button" data-testid="db-status-sizes" onClick={() => void openStatus("sizes")}>
              {t("dbSizes")}
            </button>
            <button type="button" data-testid="db-open-ai" disabled={!selected} onClick={openAi}>
              {t("dbOpenAi")}
            </button>
          </div>
        </div>
        {exportNote ? <p data-testid="db-export-note">{exportNote}</p> : null}
        {importProgress ? (
          <p data-testid="db-import-progress">{t("dbImportProgress", { done: importProgress.done, total: importProgress.total })}</p>
        ) : null}
      </div>
      {importPreview && tableView ? (
        <Modal title={t("dbImportPreview")} onClose={() => setImportPreview(null)}>
          <div data-testid="db-import-preview">
            <p>
              {t("dbImportTarget")}: {tableView.schema}.{tableView.table}
            </p>
            <p data-testid="db-import-rows">{t("dbImportRows", { count: importPreview.rowCount })}</p>
            {importPreview.errors.length > 0 ? (
              <p data-testid="db-import-errors">{t("dbImportErrors", { rows: importPreview.errors.join(", ") })}</p>
            ) : null}
            <p>{t("dbImportSample")}</p>
            <table>
              <tbody>
                {importPreview.sample.map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => (
                      <td key={cellIndex}>{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            {importMapping.map((item, index) => (
              <label key={item.column}>
                {item.column}
                <select
                  data-testid="db-import-map"
                  value={item.source == null ? "" : String(item.source)}
                  onChange={(event) => {
                    const source = event.target.value === "" ? null : Number(event.target.value);
                    setImportMapping((current) =>
                      current.map((column, columnIndex) => (columnIndex === index ? { ...column, source } : column)),
                    );
                  }}
                >
                  <option value="">{t("dbImportSkip")}</option>
                  {importPreview.headers.map((header, source) => (
                    <option key={source} value={source}>
                      {header}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <div className="connection-form-actions">
              <button type="button" onClick={() => setImportPreview(null)}>
                {t("common:cancel")}
              </button>
              <button type="button" className="find-panel-run primary" data-testid="db-import-confirm" onClick={() => void confirmImport()}>
                {t("dbImportConfirm")}
              </button>
            </div>
          </div>
        </Modal>
      ) : null}
      {createOpen ? (
        <Modal title={t("dbCreateTable")} onClose={() => setCreateOpen(false)}>
          <form
            className="connection-form"
            data-testid="db-create-form"
            onSubmit={(event) => {
              event.preventDefault();
              submitCreateTable();
            }}
          >
            <label>
              {t("dbSchema")}
              <input data-testid="db-create-schema" value={createSchema} onChange={(event) => setCreateSchema(event.target.value)} />
            </label>
            <label>
              {t("dbTableName")}
              <input data-testid="db-create-name" value={createName} onChange={(event) => setCreateName(event.target.value)} autoFocus />
            </label>
            {createColumns.map((column, index) => (
              <div key={index} className="db-create-column">
                <input
                  data-testid={`db-create-column-${index}`}
                  value={column.name}
                  placeholder={t("dbColumnName")}
                  onChange={(event) => {
                    const next = [...createColumns];
                    next[index] = { ...column, name: event.target.value };
                    setCreateColumns(next);
                  }}
                />
                <input
                  value={column.type}
                  placeholder={t("dbColumnType")}
                  onChange={(event) => {
                    const next = [...createColumns];
                    next[index] = { ...column, type: event.target.value };
                    setCreateColumns(next);
                  }}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={column.nullable}
                    onChange={(event) => {
                      const next = [...createColumns];
                      next[index] = { ...column, nullable: event.target.checked };
                      setCreateColumns(next);
                    }}
                  />
                  {t("dbNullable")}
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={column.primary}
                    onChange={(event) => {
                      const next = [...createColumns];
                      next[index] = { ...column, primary: event.target.checked };
                      setCreateColumns(next);
                    }}
                  />
                  {t("dbPrimaryKey")}
                </label>
              </div>
            ))}
            <button
              type="button"
              onClick={() => setCreateColumns((current) => [...current, { name: "", type: "text", nullable: true, primary: false }])}
            >
              {t("dbAddColumn")}
            </button>
            <div className="connection-form-actions">
              <button type="button" onClick={() => setCreateOpen(false)}>
                {t("common:cancel")}
              </button>
              <button type="submit" className="find-panel-run primary" data-testid="db-create-save">
                {t("dbRun")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
      {formOpen ? (
        <Modal wide title={editingId ? t("dbEditConnection") : t("dbNewConnection")} onClose={() => setFormOpen(false)}>
          <form
            className="connection-form db-connection-form"
            data-testid="db-connection-form"
            onSubmit={(event) => {
              event.preventDefault();
              void save();
            }}
          >
            <label>
              {t("dbName")}
              <input
                data-testid="db-connection-name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                autoFocus
              />
            </label>
            <label>
              {t("dbEngine")}
              <EngineSelect
                testId="db-connection-engine"
                fieldLabel={t("dbEngine")}
                value={form.engine}
                engines={OFFERED_ENGINES}
                onChange={(engine) => {
                  setForm({
                    ...form,
                    engine,
                    port: ENGINE_PORTS[engine as keyof typeof ENGINE_PORTS] ?? form.port,
                    database: engine === "redis" && !/^\d+$/.test(form.database) ? "0" : form.database,
                    authDatabase: engine === "mongodb" ? mongoAuthDatabase(form.authDatabase) : form.authDatabase,
                  });
                }}
              />
            </label>
            {form.engine === "sqlite" ? null : (
              <div className="db-form-pair">
            <label>
              {t("dbHost")}
              <input
                data-testid="db-connection-host"
                value={form.host}
                onChange={(event) => setForm({ ...form, host: event.target.value })}
              />
            </label>
            <label>
              {t("dbPort")}
              <input
                data-testid="db-connection-port"
                value={form.port}
                onChange={(event) => setForm({ ...form, port: event.target.value })}
              />
            </label>
              </div>
            )}
            {form.engine === "redis" ? (
              <label>
                {t("dbAuth")}
                <select
                  data-testid="db-connection-auth"
                  value={form.redisAuth}
                  onChange={(event) =>
                    setForm({ ...form, redisAuth: event.target.value as FormState["redisAuth"] })
                  }
                >
                  <option value="none">{t("dbAuthNone")}</option>
                  <option value="password">{t("dbAuthPassword")}</option>
                  <option value="user">{t("dbAuthUser")}</option>
                </select>
              </label>
            ) : null}
            <div className={form.engine === "mongodb" ? "db-form-pair" : undefined}>
            <label>
              {form.engine === "sqlite"
                ? t("dbFile")
                : form.engine === "redis"
                  ? t("dbIndex")
                  : form.engine === "oracle"
                    ? t("dbServiceName")
                    : t("dbDatabase")}
              <input
                data-testid="db-connection-database"
                value={form.database}
                onChange={(event) => setForm({ ...form, database: event.target.value })}
              />
            </label>
            {form.engine === "mongodb" ? (
              <label>
                {t("dbAuthDatabase")}
                <input
                  data-testid="db-connection-auth-database"
                  value={form.authDatabase}
                  onChange={(event) => setForm({ ...form, authDatabase: event.target.value })}
                />
              </label>
            ) : null}
            </div>
            {form.engine !== "sqlite" && form.redisAuth !== "none" ? (
            <div className="db-form-pair">
            {form.engine !== "redis" || form.redisAuth === "user" ? (
            <label>
              {t("dbUser")}
              <input
                data-testid="db-connection-user"
                value={form.user}
                onChange={(event) => setForm({ ...form, user: event.target.value })}
              />
            </label>
            ) : null}
            <label>
              {t("dbPassword")}
              <input
                data-testid="db-connection-password"
                type="password"
                value={form.password}
                placeholder={editingId ? t("dbPasswordKeep") : undefined}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
              />
            </label>
            </div>
            ) : null}
            <label>
              {t("dbTls")}
              <select
                data-testid="db-connection-tls"
                value={form.tls}
                onChange={(event) => setForm({ ...form, tls: event.target.value })}
              >
                <option value="disabled">{t("dbTlsOff")}</option>
                <option value="verify-full">{t("dbTlsVerify")}</option>
              </select>
            </label>
            <label className="checkbox-row">
              <input
                data-testid="db-connection-tunnel"
                type="checkbox"
                checked={form.tunnel}
                onChange={(event) =>
                  setForm({
                    ...form,
                    tunnel: event.target.checked,
                    sshSessionId: event.target.checked ? form.sshSessionId : "",
                  })
                }
              />
              {t("dbTunnel")}
            </label>
            {form.tunnel ? (
              <label>
                {t("dbTunnelSession")}
                <select
                  data-testid="db-connection-ssh"
                  value={form.sshSessionId}
                  onChange={(event) => setForm({ ...form, sshSessionId: event.target.value })}
                >
                  <option value="">{t("dbTunnelPick")}</option>
                  {liveSessions.map((tab) => (
                    <option key={tab.id} value={tab.id}>
                      {tab.title}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {formError ? (
              <p className="db-error" data-testid="db-form-error">
                {formError}
              </p>
            ) : null}
            {testOk ? (
              <p data-testid="db-test-ok">{t("dbTestOk")}</p>
            ) : null}
            <div className="form-row">
              <button type="button" data-testid="db-connection-test" disabled={busy} onClick={() => void testConnection()}>
                {t("dbTest")}
              </button>
              <button type="submit" data-testid="db-connection-save" disabled={busy}>
                {t("dbSave")}
              </button>
              <button type="button" data-testid="db-connection-close" onClick={() => setFormOpen(false)}>
                {t("common:cancel")}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </section>
  );
}
