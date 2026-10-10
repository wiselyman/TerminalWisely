import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, ChevronLeft, ChevronRight, Filter, Plus, X, Wrench } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Modal } from "../Modal";
import { DatabaseIcon } from "../WorkspaceToolIcons";
import { ColumnMark, EngineMark, GroupMark, ObjectMark, QueryMark } from "./DbIcons";
import { EngineSelect } from "./EngineSelect";
import {
  ColumnHeaderMenu,
  type ColumnHeaderMenuAction,
  type ColumnHeaderMenuTarget,
} from "./ColumnHeaderMenu";
import { emptyFilterRule, FilterSortPane } from "./FilterSortPane";
import { ObjectContextMenu, type ObjectMenuTarget } from "./ObjectContextMenu";
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
import { useDbWorkspaceStore } from "../../stores/dbWorkspaceStore";
import { leaveManagedHome, useManagedEntityStore } from "../../stores/managedEntityStore";
import { useSessionStore } from "../../stores/sessionStore";
import { DateTimeCellPicker } from "./DateTimeCellPicker";
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
  emptyTableSql,
  engineFamily,
  filterGridRows,
  findObjectTab,
  forgetSavedQueries,
  formatDbFormError,
  freshObjectTab,
  freshQueryTab,
  nextSqlTabTitle,
  browseConnection,
  browseDatabase,
  browseGroup,
  browseKind,
  browseSchema,
  groupRows,
  hasTableStructure,
  maintainActionFromMenu,
  maintainSql,
  mongoAuthDatabase,
  mongoDeleteCommand,
  mongoInsertCommand,
  mongoReplaceCommand,
  objectKinds,
  objectPaneRows,
  objectPaneSummary,
  objectsIn,
  cellEditorValue,
  cellEditorInputType,
  cellUsesDateTimePicker,
  resolveCellEditorKind,
  readSavedQueries,
  redisAuthMode,
  redisDelCommand,
  redisSetCommand,
  rememberQuery,
  objectMenuActions,
  type ObjectMenuAction,
  parseMongoJson,
  renameObjectSql,
  resultPresentation,
  redisExpireCommand,
  redisPersistCommand,
  shortDbFormError,
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
  truncateTableSql,
  orderDatabases,
  pageWindow,
  previewCsvImport,
  type CsvColumnMap,
  type CsvImportPreview,
  type ObjectBrowseState,
  type NewColumn,
  type ObjectColumn,
  type ObjectKind,
  type ObjectNode,
  type WorkbenchTab,
  type FilterRule,
  type SavedQuery,
  type SortDir,
  type SortRule,
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

type ResultPane = "grid" | "plan";

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

const EMPTY_WORKBENCH_TABS: WorkbenchTab[] = [];

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

type ObjectCacheEntry = { rows: unknown[][]; error: string; structureError: string };

type KeyView = { name: string; type: string; ttl: string; value: string; error: string };
type TableView = {
  schema: string;
  table: string;
  kind: "table" | "view" | "materialized_view";
  columns: ObjectColumn[];
  sortColumn: string | null;
  sortDir: SortDir;
  filter: string;
  filterRules: FilterRule[];
  sortRules: SortRule[];
  page: number;
};
type RunStatus = "rows" | "approval" | "error" | "idle";

export function DbWorkbench() {
  const { t } = useTranslation(["shell", "common"]);
  const homeOpen = useManagedEntityStore((s) => s.homeOpen);
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
  const [keyView, setKeyView] = useState<KeyView | null>(null);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [openDbs, setOpenDbs] = useState<Record<string, boolean>>({});
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [databases, setDatabases] = useState<string[]>([]);
  const activeWsId = useDbWorkspaceStore((s) => s.activeId);
  const openWorkspace = useDbWorkspaceStore((s) => s.openWorkspace);
  const replaceWorkspaceTabs = useDbWorkspaceStore((s) => s.replaceTabs);
  const setWorkspaceActiveTab = useDbWorkspaceStore((s) => s.setActiveTab);
  const closeWorkspaceTab = useDbWorkspaceStore((s) => s.closeTab);
  const clearConnectionWorkspaces = useDbWorkspaceStore((s) => s.clearConnection);
  // Stable empty array — inline `[]` in the selector re-creates every getSnapshot and
  // trips React 19 "getSnapshot should be cached" → max update depth.
  const tabs = useDbWorkspaceStore((s) =>
    activeWsId ? (s.tabsByWorkspace[activeWsId] ?? EMPTY_WORKBENCH_TABS) : EMPTY_WORKBENCH_TABS,
  );
  const activeTabId = useDbWorkspaceStore((s) =>
    activeWsId ? s.activeTabByWorkspace[activeWsId] ?? null : null,
  );
  const [objectCache, setObjectCache] = useState<Record<string, ObjectCacheEntry>>({});
  const [browse, setBrowse] = useState<ObjectBrowseState | null>(null);
  const [gridFilter, setGridFilter] = useState("");
  const [filterPaneOpen, setFilterPaneOpen] = useState(false);
  const [draftFilterRules, setDraftFilterRules] = useState<FilterRule[]>([]);
  const [filterSeedId, setFilterSeedId] = useState<string | null>(null);
  const [gridPage, setGridPage] = useState(1);
  const [editingCell, setEditingCell] = useState<{
    row: number;
    col: number;
    rect: DOMRect | null;
  } | null>(null);
  const [dataTarget, setDataTarget] = useState<{ schema: string; table: string } | null>(null);
  const [tableView, setTableView] = useState<TableView | null>(null);
  const [mongoCollection, setMongoCollection] = useState<string | null>(null);
  const [savedQueries, setSavedQueries] = useState<SavedQuery[]>([]);
  const [queryName, setQueryName] = useState("");
  const [redisDraft, setRedisDraft] = useState("");
  const [redisTtlDraft, setRedisTtlDraft] = useState("");
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
  /** Live sessions keep brand-colored icons even if the tree row is collapsed. */
  const [liveIds, setLiveIds] = useState<Record<string, boolean>>({});
  /** Schemas stay colored after first successful open (Navicat). */
  const [liveSchemas, setLiveSchemas] = useState<Record<string, boolean>>({});
  const [openNodes, setOpenNodes] = useState<Record<string, boolean>>({});
  const [activeSchema, setActiveSchema] = useState<string | null>(null);
  const [pane, setPane] = useState<ResultPane>("grid");
  const [planText, setPlanText] = useState("");
  const [pending, setPending] = useState<DbQueryResponse | null>(null);
  const [submittedSql, setSubmittedSql] = useState("SELECT 1");
  const [objectMenu, setObjectMenu] = useState<ObjectMenuTarget | null>(null);
  const [columnMenu, setColumnMenu] = useState<ColumnHeaderMenuTarget | null>(null);
  const [renameTarget, setRenameTarget] = useState<ObjectMenuTarget | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const sqlRef = useRef<HTMLTextAreaElement>(null);
  const gridFilterRef = useRef<HTMLInputElement>(null);
  const mainRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState(36);
  const activeDatabase = useRef<string | null>(null);
  const operationId = useRef("");
  const importQueue = useRef<string[]>([]);
  const catalogSeq = useRef(0);
  const gutterRef = useRef<HTMLPreElement>(null);
  const chosenSql = useRef<string | null>(null);
  const refreshDbAfterWrite = useRef<string | null>(null);
  const requestSeq = useRef(0);
  const tableViewRef = useRef<TableView | null>(null);
  const mongoRef = useRef<string | null>(null);
  const importRef = useRef<HTMLInputElement>(null);
  tableViewRef.current = tableView;
  mongoRef.current = mongoCollection;
  const tabSeq = useRef(0);
  const tabsRef = useRef(tabs);
  const activeTabIdRef = useRef(activeTabId);
  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;
  const [sidebarSlot, setSidebarSlot] = useState<HTMLElement | null>(null);
  const active =
    (activeTabId ? tabs.find((tab) => tab.id === activeTabId) : undefined) ??
    null;
  /** Results + editor chrome when any inner tab is focused. */
  const queryFocused = active != null;

  useLayoutEffect(() => {
    setSidebarSlot(document.getElementById("tw-db-sidebar-host"));
  }, []);

  useEffect(() => {
    setTestOk(false);
  }, [form]);

  const selected = connections.find((item) => item.id === selectedId) ?? null;

  useEffect(() => {
    if (!activeWsId) return;
    const ws = useDbWorkspaceStore.getState().workspaces.find((item) => item.id === activeWsId);
    if (!ws) return;
    tabsRef.current = useDbWorkspaceStore.getState().tabsByWorkspace[activeWsId] ?? [];
    activeTabIdRef.current =
      useDbWorkspaceStore.getState().activeTabByWorkspace[activeWsId] ?? null;
    if (selectedId !== ws.connectionId) {
      setSelectedId(ws.connectionId);
      setConnectRequestId(ws.connectionId);
      setConnectAttempt((attempt) => attempt + 1);
      return;
    }
    rememberDatabase(ws.database);
    setOpenDbs((current) =>
      current[ws.database] ? current : { ...current, [ws.database]: true },
    );
    if (activeTabIdRef.current) return;
    const engine = connections.find((item) => item.id === ws.connectionId)?.engine;
    if (!engine) return;
    setBrowse((current) => {
      if (
        current?.level === "database" &&
        current.database === ws.database &&
        current.schema == null
      ) {
        return current;
      }
      return browseDatabase(engine, ws.database);
    });
  }, [activeWsId, selectedId, connections]);

  function commitTabs(next: WorkbenchTab[], focusId: string | null, workspaceId = activeWsId) {
    if (!workspaceId) return;
    tabsRef.current = next;
    activeTabIdRef.current = focusId;
    replaceWorkspaceTabs(workspaceId, next);
    setWorkspaceActiveTab(workspaceId, focusId);
  }

  function ensureWorkspaceFor(database: string): string | null {
    if (!selected) return null;
    leaveManagedHome();
    return openWorkspace({
      connectionId: selected.id,
      connectionName: selected.name,
      database,
      engine: selected.engine,
    });
  }

  /** Keep a focused query tab (create one if Object Pane has none). Sync via refs for same-tick callers. */
  function ensureQueryTab(patch: Partial<WorkbenchTab> = {}): string {
    const database =
      (typeof patch.database === "string" && patch.database) ||
      browse?.database ||
      activeDatabase.current ||
      selected?.database ||
      "";
    const workspaceId = database ? ensureWorkspaceFor(database) : activeWsId;
    if (!workspaceId) {
      const id = `q${(tabSeq.current += 1)}`;
      return id;
    }
    const current =
      useDbWorkspaceStore.getState().tabsByWorkspace[workspaceId] ?? tabsRef.current;
    const focused = activeTabIdRef.current;
    if (focused && current.some((tab) => tab.id === focused)) {
      const next = current.map((tab) => (tab.id === focused ? { ...tab, ...patch } : tab));
      commitTabs(next, focused, workspaceId);
      return focused;
    }
    const id = `q${(tabSeq.current += 1)}`;
    const title = nextSqlTabTitle(current);
    const next = [...current, { ...freshQueryTab(id, title), ...patch }];
    commitTabs(next, id, workspaceId);
    return id;
  }

  function ensureObjectTab(
    database: string,
    node: Pick<ObjectNode, "kind" | "schema" | "name">,
    patch: Partial<WorkbenchTab> = {},
  ): string {
    const workspaceId = ensureWorkspaceFor(database);
    if (!workspaceId) return `o${(tabSeq.current += 1)}`;
    const current =
      useDbWorkspaceStore.getState().tabsByWorkspace[workspaceId] ?? tabsRef.current;
    const existing = findObjectTab(current, database, node.kind, node.schema, node.name);
    if (existing) {
      const next = current.map((tab) =>
        tab.id === existing.id ? { ...tab, ...patch } : tab,
      );
      commitTabs(next, existing.id, workspaceId);
      return existing.id;
    }
    const id = `o${(tabSeq.current += 1)}`;
    const next = [...current, { ...freshObjectTab(id, database, node), ...patch }];
    commitTabs(next, id, workspaceId);
    return id;
  }

  function replaceActive(patch: Partial<WorkbenchTab>) {
    patchFocusedOrQuery(patch);
  }

  function clearWork() {
    requestSeq.current += 1;
    if (selectedId) clearConnectionWorkspaces(selectedId);
    tabsRef.current = [];
    activeTabIdRef.current = null;
    setDatabases([]);
    setObjectCache({});
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
      clearConnectionWorkspaces(id);
      setLiveIds((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
      setOpenIds((current) => {
        const next = { ...current };
        delete next[id];
        return next;
      });
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
      const focused = activeTabIdRef.current;
      const current = tabsRef.current;
      if (focused && current.some((tab) => tab.id === focused)) {
        ensureQueryTab({
          sql: (() => {
            const base = current.find((tab) => tab.id === focused)?.sql.trim() ?? "";
            return base ? `${base}\n${sql}` : sql;
          })(),
        });
        return;
      }
      ensureQueryTab({ sql });
    });
    return () => setDbSqlSink(null);
  }, [setDbSqlSink]);

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
        setLiveIds((current) => ({ ...current, [connectionId]: true }));
        setLiveSchemas({});
        setOpenDbs({});
        setOpenNodes({});
        setBrowse(browseConnection());
        leaveManagedHome();
      })
      .catch((err: unknown) => {
        if (catalogSeq.current !== seq) return;
        setConnectingId((current) => (current === connectionId ? null : current));
        setDatabases([]);
        setOpenDbs({});
        setBrowse(null);
        setConnectFailure({ id: connectionId, message: String(err) });
        setOpenIds((current) => ({ ...current, [connectionId]: false }));
        setLiveIds((current) => ({ ...current, [connectionId]: false }));
      });
  }, [selected, connectRequestId, connectAttempt]);

  useEffect(() => {
    setRedisDraft(keyView?.value ?? "");
    const ttl = keyView?.ttl ?? "";
    setRedisTtlDraft(ttl === "-1" || ttl === "-2" ? "" : ttl);
  }, [keyView]);

  useEffect(() => {
    setEditingCell(null);
  }, [active?.result, dataTarget, tableView?.table, tableView?.schema]);

  useEffect(() => {
    if (!queryFocused) setToolsOpen(false);
  }, [queryFocused]);

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
  const paneNodes = browse?.database ? nodesFor(browse.database) : [];
  const listed = browse ? objectPaneRows(browse, databases, paneNodes) : [];
  const listSummary = browse ? objectPaneSummary(browse, databases, paneNodes) : null;
  const groupNode =
    browse?.level === "group" && browse.group && browse.table && browse.database
      ? paneNodes.find(
          (node) => node.name === browse.table && node.schema === browse.schema && node.kind === browse.kind,
        ) ?? null
      : null;
  const groupListing = browse?.level === "group" && browse.group && groupNode ? groupRows(groupNode, browse.group) : null;
  const listingGroup = groupListing && browse?.group ? browse.group : null;

  function typeLabel(typeKey: string): string {
    if (typeKey === "database") return t("dbDatabase");
    if (typeKey === "schema") return t("dbSchema");
    if (typeKey in KIND_LABEL) return t(KIND_LABEL[typeKey as ObjectKind]);
    if (typeKey in GROUP_LABEL) return t(GROUP_LABEL[typeKey as TableGroup]);
    return typeKey;
  }

  function focusObjectPane(next: ObjectBrowseState) {
    setBrowse(next);
    activeTabIdRef.current = null;
    if (activeWsId) setWorkspaceActiveTab(activeWsId, null);
    setKeyView(null);
    setTableView(null);
    setDataTarget(null);
    setMongoCollection(null);
    setPending(null);
    setPane("grid");
  }

  function mapTab(tabId: string, patch: Partial<WorkbenchTab>) {
    // Prefer store activeId — React hook state can lag one frame after openWorkspace.
    const workspaceId = useDbWorkspaceStore.getState().activeId ?? activeWsId;
    if (!workspaceId) return;
    const current =
      useDbWorkspaceStore.getState().tabsByWorkspace[workspaceId] ?? tabsRef.current;
    const next = current.map((tab) => (tab.id === tabId ? { ...tab, ...patch } : tab));
    commitTabs(next, activeTabIdRef.current, workspaceId);
  }

  /** Patch the focused tab (object or SQL); create a SQL tab only when none is focused. */
  function patchFocusedOrQuery(patch: Partial<WorkbenchTab> = {}): string {
    return ensureQueryTab(patch);
  }

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
    leaveManagedHome();
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
      port: (() => {
        const parsed = Number.parseInt(form.port, 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
      })(),
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
    leaveManagedHome();
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
      setTestOk(false);
      setFormError(t("dbTunnelRequired"));
      return;
    }
    setFormError("");
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
      setTestOk(false);
      setFormError(formatDbFormError(err, t("dbSaveFailed")));
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
      setTestOk(false);
      setFormError(formatDbFormError(err, t("dbTestFailed")));
    } finally {
      setBusy(false);
    }
  }

  function isObjectDataTab(tab: WorkbenchTab | null | undefined): boolean {
    return (
      !!tab &&
      (tab.kind === "table" || tab.kind === "view" || tab.kind === "materialized_view")
    );
  }

  /** Rebuild browse chrome from the focused object tab (after Run cleared it, remount, etc.). */
  function tableViewFromObjectTab(tab: WorkbenchTab): TableView | null {
    if (!isObjectDataTab(tab) || !tab.objectName || !tab.database) return null;
    const kind = tab.kind as "table" | "view" | "materialized_view";
    return {
      schema: tab.schema ?? "",
      table: tab.objectName,
      kind,
      columns: columnsForObject(tab.database, tab.schema ?? "", tab.objectName),
      sortColumn: null,
      sortDir: "asc",
      filter: "",
      filterRules: [],
      sortRules: [],
      page: 1,
    };
  }

  async function run(leaseId?: string, sqlOverride?: string, keepTarget = false): Promise<RunStatus> {
    if (!selected) return "idle";
    // Object-table tabs stay in browse mode (Navicat). Clearing tableView here used to
    // replace the funnel/+ chrome with a full-width client "筛选" input.
    const preserveBrowse = keepTarget || isObjectDataTab(active);
    if (!preserveBrowse) {
      tableViewRef.current = null;
      setDataTarget(null);
      setTableView(null);
      setMongoCollection(null);
      setKeyView(null);
      setInsertOpen(false);
      setGridFilter("");
      setGridPage(1);
    } else if (!tableViewRef.current && isObjectDataTab(active) && active) {
      const restored = tableViewFromObjectTab(active);
      if (restored) {
        tableViewRef.current = restored;
        setTableView(restored);
        if (restored.kind === "table") {
          setDataTarget({ schema: restored.schema, table: restored.table });
        }
      }
    }
    const statement = sqlOverride ?? statementToRun();
    if (!statement.trim() && !sqlOverride) return "idle";
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
    const tabId = patchFocusedOrQuery(
      sqlOverride ? { sql: statement, error: "" } : { error: "" },
    );
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
        mapTab(tabId, { result: null });
        return "approval";
      }
      setPending(null);
      setPane("grid");
      mapTab(tabId, {
        result: {
          columns: response.columns,
          rows: response.rows,
          truncated: response.truncated,
          connection_id: response.connection_id,
          revision: response.revision,
        },
        error: "",
      });
      return "rows";
    } catch (err) {
      if (requestSeq.current !== seq) return "idle";
      setPending(null);
      mapTab(tabId, { result: null, error: String(err) });
      return "error";
    } finally {
      if (requestSeq.current === seq) setBusy(false);
    }
  }

  function columnNames(view: TableView, extra: string[] = []): string[] {
    return [...new Set([...view.columns.map((column) => column.name), ...extra])];
  }

  function tableSqlOptions(view: TableView) {
    return {
      filterRules: view.filterRules,
      sortRules: view.sortRules.length > 0 ? view.sortRules : undefined,
    };
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
      tableSqlOptions(view),
    );
    if (!sql) return;
    setTableView(view);
    setDataTarget(view.kind === "table" ? { schema: view.schema, table: view.table } : null);
    setGridFilter(view.filter);
    setDraftFilterRules(view.filterRules);
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

  function reloadObjectsIfNeeded() {
    if (!selected) return;
    const database = refreshDbAfterWrite.current ?? activeDatabase.current;
    refreshDbAfterWrite.current = null;
    if (!database) return;
    loadObjects(selected.id, selected.revision, database, catalogSeq.current, selected.engine);
  }

  async function mutate(sql: string) {
    const status = await run(undefined, sql, true);
    if (status === "rows") {
      await refreshOpenTarget();
      reloadObjectsIfNeeded();
    }
  }

  async function approve() {
    if (!selected || !pending) return;
    if (!approvalStillMatches(pending.sql, submittedSql)) {
      setPending(null);
      return;
    }
    ensureQueryTab({ sql: pending.sql, error: "" });
    const leaseId = await dbRegisterLease({
      connectionId: pending.connection_id,
      revision: pending.revision,
      operation: pending.operation,
      sql: pending.sql,
    });
    const status = await run(leaseId, pending.sql, true);
    if (status === "rows") {
      await refreshOpenTarget();
      reloadObjectsIfNeeded();
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
    if (!selected) return;
    const seq = requestSeq.current;
    const connectionId = selected.id;
    const revision = selected.revision;
    const tabId = ensureQueryTab({ error: "" });
    try {
      const response = await dbStatus(selected.id, page);
      if (requestSeq.current !== seq) return;
      if (response.connection_id !== connectionId || response.revision !== revision) return;
      setPending(null);
      setPane("grid");
      mapTab(tabId, {
        result: {
          columns: response.columns,
          rows: response.rows,
          truncated: response.truncated,
          connection_id: response.connection_id,
          revision: response.revision,
        },
      });
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

  function addQueryTab() {
    const database =
      browse?.database || activeDatabase.current || selected?.database || "";
    const workspaceId = database ? ensureWorkspaceFor(database) : activeWsId;
    if (!workspaceId) return;
    const current =
      useDbWorkspaceStore.getState().tabsByWorkspace[workspaceId] ?? tabsRef.current;
    const id = `q${(tabSeq.current += 1)}`;
    const title = nextSqlTabTitle(current);
    const next = [...current, freshQueryTab(id, title)];
    commitTabs(next, id, workspaceId);
    setBrowse(null);
    setPending(null);
    setKeyView(null);
    setTableView(null);
    setDataTarget(null);
    setMongoCollection(null);
    setEditorHeight(220);
  }

  function showConnectionPane() {
    focusObjectPane(browseConnection());
  }

  function showDatabasePane(engine: string, database: string) {
    if (selected) {
      leaveManagedHome();
      openWorkspace({
        connectionId: selected.id,
        connectionName: selected.name,
        database,
        engine: selected.engine || engine,
      });
    }
    rememberDatabase(database);
    focusObjectPane(browseDatabase(engine, database));
  }

  function showSchemaPane(engine: string, database: string, schema: string) {
    rememberDatabase(database);
    setActiveSchema(schema);
    focusObjectPane(browseSchema(engine, database, schema));
  }

  function showKindPane(database: string, kind: ObjectKind, schema: string | null) {
    rememberDatabase(database);
    if (schema) setActiveSchema(schema);
    focusObjectPane(browseKind(database, kind, schema));
  }

  function showGroup(database: string, node: ObjectNode, group: TableGroup) {
    rememberDatabase(database);
    if (node.schema) setActiveSchema(node.schema);
    focusObjectPane(browseGroup(database, node.kind, node.schema, node.name, group));
  }

  async function openRedisKey(database: string, name: string) {
    if (!selected) return;
    rememberDatabase(database);
    setDataTarget(null);
    setBrowse(null);
    setKeyView(null);
    setEditorHeight(36);
    const tabId = ensureObjectTab(
      database,
      { kind: "key", schema: "", name },
      { sql: `GET ${name}`, result: null, error: "" },
    );
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
        mapTab(tabId, { error });
        return;
      }
      setKeyView({ name, type: typeCell.text, ttl: ttlCell.text, value: valueCell.text, error: valueCell.error });
      if (typeCell.error || ttlCell.error) {
        mapTab(tabId, { error: [typeCell.error, ttlCell.error].filter(Boolean).join("\n") });
      }
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
      ensureObjectTab(database, node, { sql, result: null, error: "" });
      void run(undefined, sql, true);
      return;
    }
    if (node.kind === "table" || node.kind === "view" || node.kind === "materialized_view") {
      setMongoCollection(null);
      ensureObjectTab(database, node, { result: null, error: "" });
      void loadTable({
        schema: node.schema,
        table: node.name,
        kind: node.kind,
        columns: node.columns,
        sortColumn: null,
        sortDir: "asc",
        filter: "",
        filterRules: [],
        sortRules: [],
        page: 1,
      });
      setFilterPaneOpen(false);
      setFilterSeedId(null);
      return;
    }
    const sql = tableSelectSql(engine, node.kind, node.schema, node.name);
    if (!sql) return;
    setTableView(null);
    setDataTarget(null);
    setMongoCollection(null);
    ensureObjectTab(database, node, { sql, result: null, error: "" });
    void run(undefined, sql, true);
  }

  function sortBy(column: string) {
    if (!tableView) return;
    const next: TableView = {
      ...tableView,
      sortColumn: column,
      sortDir: tableView.sortColumn === column && tableView.sortDir === "asc" ? "desc" : "asc",
      sortRules: [],
      page: 1,
    };
    void loadTable(next);
  }

  function applyColumnSort(column: string, dir: SortDir) {
    if (!tableView) return;
    void loadTable({ ...tableView, sortColumn: column, sortDir: dir, sortRules: [], page: 1 });
  }

  function clearColumnSort() {
    if (!tableView) return;
    void loadTable({ ...tableView, sortColumn: null, sortDir: "asc", sortRules: [], page: 1 });
  }

  function handleColumnMenuAction(action: ColumnHeaderMenuAction, column: string) {
    setColumnMenu(null);
    if (action === "asc") {
      applyColumnSort(column, "asc");
      return;
    }
    if (action === "desc") {
      applyColumnSort(column, "desc");
      return;
    }
    if (action === "clear") {
      clearColumnSort();
      return;
    }
    if (!tableView) return;
    const rule = emptyFilterRule(column);
    setDraftFilterRules([...tableView.filterRules, rule]);
    setFilterSeedId(rule.id);
    setFilterPaneOpen(true);
  }

  function applyFilterSortPane() {
    if (!tableView) return;
    void loadTable({
      ...tableView,
      filter: "",
      filterRules: draftFilterRules,
      page: 1,
    });
  }

  function turnPage(delta: number) {
    if (!tableView) {
      if (delta < 0) {
        setGridPage((page) => Math.max(1, page - 1));
        return;
      }
      const visible = pageWindow(filterGridRows(result?.rows ?? [], gridFilter), gridPage);
      if (visible.page >= visible.pages) return;
      setGridPage(visible.page + 1);
      return;
    }
    if (delta < 0) {
      if (tableView.page <= 1) return;
      void loadTable({ ...tableView, page: tableView.page - 1 });
      return;
    }
    // Stay on the current page when this page is already short (no more rows).
    if ((result?.rows.length ?? 0) < GRID_PAGE_SIZE) return;
    void loadTable({ ...tableView, page: tableView.page + 1 });
  }

  function showDefinition(target?: { kind: ObjectKind; schema: string; table: string; columns?: ObjectColumn[] }) {
    if (!selected) return;
    const view = target ?? (tableView
      ? { kind: tableView.kind, schema: tableView.schema, table: tableView.table, columns: tableView.columns }
      : null);
    if (!view) return;
    const read = definitionSql(selected.engine, view.kind, view.schema, view.table);
    if (read) {
      setTableView(null);
      setDataTarget(null);
      replaceActive({ sql: read, result: null, error: "" });
      void run(undefined, read, false);
      return;
    }
    const local = tableDefinitionFromColumns(selected.engine, view.schema, view.table, view.columns ?? []);
    if (!local) return;
    setTableView(null);
    setDataTarget(null);
    replaceActive({ sql: local, result: null, error: "" });
  }

  function handleObjectMenuAction(action: ObjectMenuAction) {
    if (!selected || !objectMenu) return;
    const target = objectMenu;
    const cached = nodesFor(target.database).find(
      (item) => item.name === target.name && item.schema === target.schema && item.kind === target.kind,
    );
    const node: ObjectNode = cached ?? {
      kind: target.kind as ObjectKind,
      schema: target.schema,
      name: target.name,
      columns: [],
      members: [],
    };
    setObjectMenu(null);
    if (action === "open") {
      openTable(selected.engine, target.database, node);
      return;
    }
    if (action === "definition") {
      showDefinition({ kind: node.kind, schema: node.schema, table: node.name, columns: node.columns });
      return;
    }
    if (action === "refresh") {
      loadObjects(selected.id, selected.revision, target.database, catalogSeq.current, selected.engine);
      return;
    }
    if (action === "rename") {
      setRenameTarget(target);
      setRenameDraft(target.name);
      return;
    }
    if (action === "empty") {
      const sql = emptyTableSql(selected.engine, target.schema, target.name);
      if (!sql) return;
      refreshDbAfterWrite.current = target.database;
      replaceActive({ sql, error: "" });
      void mutate(sql);
      return;
    }
    if (action === "truncate") {
      const sql = truncateTableSql(selected.engine, target.schema, target.name);
      if (!sql) return;
      refreshDbAfterWrite.current = target.database;
      replaceActive({ sql, error: "" });
      void mutate(sql);
      return;
    }
    if (action === "drop") {
      const sql = dropTableSql(selected.engine, target.schema, target.name);
      if (!sql) return;
      refreshDbAfterWrite.current = target.database;
      replaceActive({ sql, error: "" });
      void mutate(sql);
      return;
    }
    const maintain = maintainActionFromMenu(action);
    if (maintain) {
      const sql = maintainSql(selected.engine, maintain, target.schema, target.name);
      if (!sql) return;
      refreshDbAfterWrite.current = target.database;
      replaceActive({ sql, error: "" });
      void mutate(sql);
    }
  }

  function applyRename() {
    if (!selected || !renameTarget) return;
    const sql = renameObjectSql(selected.engine, renameTarget.schema, renameTarget.name, renameDraft.trim());
    refreshDbAfterWrite.current = renameTarget.database;
    setRenameTarget(null);
    setRenameDraft("");
    if (!sql) return;
    replaceActive({ sql, error: "" });
    void mutate(sql);
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
        tableSqlOptions(tableView),
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

  function insertColumnNames(view: TableView): string[] {
    if (view.columns.length > 0) return view.columns.map((column) => column.name);
    return active?.result?.columns ?? [];
  }

  function submitInsert() {
    if (!selected || !tableView || tableView.kind !== "table") return;
    const names = insertColumnNames(tableView);
    if (names.length === 0) return;
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
    if (!activeWsId) return;
    closeWorkspaceTab(activeWsId, id);
    const next = useDbWorkspaceStore.getState().tabsByWorkspace[activeWsId] ?? [];
    const focus = useDbWorkspaceStore.getState().activeTabByWorkspace[activeWsId] ?? null;
    tabsRef.current = next;
    activeTabIdRef.current = focus;
  }

  function columnsForObject(database: string, schema: string, name: string): ObjectColumn[] {
    const nodes = nodesFor(database);
    const hit = nodes.find(
      (node) =>
        node.name === name &&
        node.schema === schema &&
        (node.kind === "table" || node.kind === "view" || node.kind === "materialized_view"),
    );
    return hit?.columns ?? [];
  }

  // If Run (or remount) dropped tableView while an object tab is focused, put browse chrome back.
  useEffect(() => {
    if (tableView || !active || !isObjectDataTab(active)) return;
    const restored = tableViewFromObjectTab(active);
    if (!restored) return;
    tableViewRef.current = restored;
    setTableView(restored);
    if (restored.kind === "table") {
      setDataTarget({ schema: restored.schema, table: restored.table });
    }
  }, [active, tableView]);

  function focusInnerTab(tab: WorkbenchTab) {
    const workspaceId = useDbWorkspaceStore.getState().activeId ?? activeWsId;
    if (workspaceId) setWorkspaceActiveTab(workspaceId, tab.id);
    activeTabIdRef.current = tab.id;
    setBrowse(null);
    setPending(null);
    setEditorHeight(tab.kind === "query" ? 220 : 36);
    if (tab.kind === "query") {
      setKeyView(null);
      setTableView(null);
      setDataTarget(null);
      setMongoCollection(null);
      return;
    }
    if (tab.database) rememberDatabase(tab.database);
    if (tab.schema) setActiveSchema(tab.schema);
    if (tab.kind === "key") {
      setTableView(null);
      setDataTarget(null);
      setMongoCollection(null);
      if (tab.objectName && tab.database) void openRedisKey(tab.database, tab.objectName);
      return;
    }
    if (tab.kind === "collection") {
      setTableView(null);
      setDataTarget(null);
      setKeyView(null);
      setMongoCollection(tab.objectName);
      return;
    }
    if (tab.kind === "table" || tab.kind === "view" || tab.kind === "materialized_view") {
      setKeyView(null);
      setMongoCollection(null);
      if (!selected || !tab.database || !tab.objectName) return;
      void loadTable({
        schema: tab.schema ?? "",
        table: tab.objectName,
        kind: tab.kind,
        columns: columnsForObject(tab.database, tab.schema ?? "", tab.objectName),
        sortColumn: null,
        sortDir: "asc",
        filter: "",
        filterRules: [],
        sortRules: [],
        page: 1,
      });
      setFilterPaneOpen(false);
      setFilterSeedId(null);
    }
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
          data-testid={`db-tree-object-${node.name}`}
          onClick={() => toggleNode(nodeKey, false)}
          onDoubleClick={(event) => {
            event.preventDefault();
            if (selected) openTable(selected.engine, databaseName, node);
          }}
          onContextMenu={(event) => {
            event.preventDefault();
            event.stopPropagation();
            setObjectMenu({
              database: databaseName,
              schema: node.schema,
              name: node.name,
              kind: node.kind,
              x: event.clientX,
              y: event.clientY,
            });
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
    const kindOpen = openNodes[kindKey] ?? false;
    const schemaNodes = nodes.filter((node) => node.kind === kind && (schemaName == null || node.schema === schemaName));
    return (
      <div key={kind} className="k8s-tree-group">
        <button
          type="button"
          className={`k8s-tree-group-label ${deeper ? "db-tree-under-schema" : "db-tree-deeper"}`}
          data-testid={`db-tree-kind-${kind}`}
          onClick={() => {
            toggleNode(kindKey, false);
            showKindPane(databaseName, kind, schemaName);
          }}
        >
          {kindOpen ? <ChevronDown size={12} className="k8s-tree-chevron" /> : <ChevronRight size={12} className="k8s-tree-chevron" />}
          <span className="k8s-tree-icon">
            <ObjectMark kind={kind} />
          </span>
          <span>
            {t("dbTreeCount", {
              label: t(KIND_LABEL[kind]),
              count: schemaNodes.length,
            })}
          </span>
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
                    showConnectionPane();
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
                    <EngineMark engine={item.engine} connected={!!liveIds[item.id]} />
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
                            data-testid={`db-tree-database-${databaseName}`}
                            onClick={() => {
                              const willOpen = !dbOpen;
                              setOpenDbs((current) => ({ ...current, [databaseName]: willOpen }));
                              showDatabasePane(item.engine, databaseName);
                              if ((willOpen || schemasFirst(item.engine)) && !entry) {
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
                              <ObjectMark
                                kind="database"
                                active={Boolean(entry && !entry.error)}
                              />
                            </span>
                            <span>
                              {entry && !entry.error
                                ? t("dbTreeCount", {
                                    label: databaseName,
                                    count: schemasFirst(item.engine)
                                      ? schemaNames(nodes).length
                                      : objectsIn(nodes, "table", null).length,
                                  })
                                : databaseName}
                            </span>
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
                                    const schemaOpen = openNodes[schemaKey] ?? false;
                                    return (
                                      <div key={schemaName} className="k8s-tree-group">
                                        <button
                                          type="button"
                                          className="k8s-tree-group-label db-tree-schema"
                                          data-testid={`db-tree-schema-${schemaName}`}
                                          onClick={() => {
                                            const willOpen = !schemaOpen;
                                            toggleNode(schemaKey, false);
                                            if (willOpen) {
                                              setLiveSchemas((current) => ({
                                                ...current,
                                                [schemaKey]: true,
                                              }));
                                            }
                                            showSchemaPane(item.engine, databaseName, schemaName);
                                          }}
                                        >
                                          {schemaOpen ? (
                                            <ChevronDown size={12} className="k8s-tree-chevron" />
                                          ) : (
                                            <ChevronRight size={12} className="k8s-tree-chevron" />
                                          )}
                                          <span className="k8s-tree-icon">
                                            <ObjectMark
                                              kind="schema"
                                              active={Boolean(liveSchemas[schemaKey]) || schemaOpen}
                                            />
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
    <section
      className={`db-workbench${homeOpen ? " db-workbench--home" : ""}`}
      data-testid="db-workbench"
      data-home={homeOpen ? "1" : "0"}
    >
      {sidebarSlot ? createPortal(nav, sidebarSlot) : nav}
      {objectMenu ? (
        <ObjectContextMenu
          target={objectMenu}
          actions={objectMenuActions(selected?.engine ?? "postgres", objectMenu.kind)}
          labels={{
            dbMenuOpen: t("dbMenuOpen"),
            dbMenuDefinition: t("dbMenuDefinition"),
            dbMenuRename: t("dbMenuRename"),
            dbMenuEmpty: t("dbMenuEmpty"),
            dbMenuTruncate: t("dbMenuTruncate"),
            dbMenuDrop: t("dbMenuDrop"),
            dbMenuRefresh: t("dbMenuRefresh"),
            dbMenuAnalyze: t("dbMenuAnalyze"),
            dbMenuVacuum: t("dbMenuVacuum"),
            dbMenuReindex: t("dbMenuReindex"),
            dbMenuOptimize: t("dbMenuOptimize"),
          }}
          onAction={handleObjectMenuAction}
          onClose={() => setObjectMenu(null)}
        />
      ) : null}
      {columnMenu ? (
        <ColumnHeaderMenu
          target={columnMenu}
          labels={{
            asc: t("dbSortAsc"),
            desc: t("dbSortDesc"),
            clear: t("dbSortClear"),
            filter: t("dbAddFilter"),
          }}
          onAction={handleColumnMenuAction}
          onClose={() => setColumnMenu(null)}
        />
      ) : null}
      {renameTarget ? (
        <div className="db-rename-bar" data-testid="db-rename-bar">
          <input
            data-testid="db-rename-input"
            value={renameDraft}
            onChange={(event) => setRenameDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") applyRename();
              if (event.key === "Escape") {
                setRenameTarget(null);
                setRenameDraft("");
              }
            }}
            autoFocus
          />
          <button type="button" className="find-panel-run primary" data-testid="db-rename-apply" onClick={applyRename}>
            {t("dbRenameApply")}
          </button>
          <button
            type="button"
            data-testid="db-rename-cancel"
            onClick={() => {
              setRenameTarget(null);
              setRenameDraft("");
            }}
          >
            {t("dbReject")}
          </button>
        </div>
      ) : null}
      <div className="db-workbench-main" ref={mainRef}>
        {tabs.length > 0 ? (
          <div className="db-query-tabs" data-testid="db-query-tabs">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                className={`tab${tab.id === activeTabId ? " active" : ""}`}
                data-testid={tab.kind === "query" ? "db-query-tab" : "db-object-tab"}
                data-tab-kind={tab.kind}
                aria-pressed={tab.id === activeTabId}
                onClick={() => {
                  focusInnerTab(tab);
                }}
              >
                <span className="db-inner-tab-icon" aria-hidden="true">
                  {tab.kind === "query" ? <QueryMark /> : <ObjectMark kind={tab.kind} />}
                </span>
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
        {!queryFocused && browse?.database && objectCache[browse.database]?.error ? (
          <p className="db-error" data-testid="db-error">
            {objectCache[browse.database]?.error}
          </p>
        ) : !queryFocused && browse ? (
          <div className="db-object-list" data-testid="db-object-list">
            {selected && engineFamily(selected.engine) === "sql" ? (
              <div className="db-object-list-toolbar">
                <button
                  type="button"
                  className="db-action-btn"
                  data-testid="db-new-query"
                  title={t("dbNewQuery")}
                  aria-label={t("dbNewQuery")}
                  onClick={addQueryTab}
                >
                  <Plus size={14} strokeWidth={2} aria-hidden="true" />
                  <span>{t("dbNewQuery")}</span>
                </button>
              </div>
            ) : null}
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
                  listed.map((row) => (
                    <tr
                      key={`${row.action}:${row.schema}:${row.name}`}
                      data-testid={`db-object-row-${row.name}`}
                      onDoubleClick={() => {
                        if (!selected) return;
                        if (row.action === "open-database") {
                          setOpenDbs((current) => ({ ...current, [row.name]: true }));
                          showDatabasePane(selected.engine, row.name);
                          if (!objectCache[row.name]) {
                            loadObjects(
                              selected.id,
                              selected.revision,
                              row.name,
                              catalogSeq.current,
                              selected.engine,
                            );
                          }
                          return;
                        }
                        if (row.action === "open-schema" && browse.database) {
                          const schemaKey = `${selected.id}:${browse.database}:${row.name}`;
                          setOpenNodes((current) => ({ ...current, [schemaKey]: true }));
                          setOpenDbs((current) => ({ ...current, [browse.database!]: true }));
                          showSchemaPane(selected.engine, browse.database, row.name);
                          return;
                        }
                        if (row.action === "open-object" && browse.database) {
                          const node = paneNodes.find(
                            (item) =>
                              item.name === row.name &&
                              item.schema === row.schema &&
                              item.kind === row.typeKey,
                          );
                          if (node) openTable(selected.engine, browse.database, node);
                        }
                      }}
                    >
                      <td>{row.name}</td>
                      <td>{row.schema}</td>
                      <td>{typeLabel(row.typeKey)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {listSummary ? (
              <p className="db-object-summary" data-testid="db-object-summary">
                {t(`dbObjectCount_${listSummary.typeKey}`, { count: listSummary.count })}
              </p>
            ) : null}
          </div>
        ) : queryFocused ? (
          <>
        <div className="db-result-body">
        {pane === "plan" ? (
          <div className="db-plan-view" data-testid="db-plan-view">
            <div className="db-plan-toolbar">
              <button
                type="button"
                className="db-action-btn"
                data-testid="db-show-data"
                onClick={() => setPane("grid")}
              >
                {t("dbResultGrid")}
              </button>
              <span className="db-plan-toolbar-label">{t("dbResultPlan")}</span>
            </div>
            <pre data-testid="db-plan">{planText}</pre>
          </div>
        ) : null}
        {pane === "grid" && keyView ? (
          <div className="db-key-view" data-testid="db-key-view">
            <p>{keyView.name}</p>
            <p data-testid="db-redis-type">
              <span className="db-redis-type-badge">{keyView.type || "unknown"}</span>
              <span>
                {" "}
                {t("dbKeyType")}
              </span>
            </p>
            <p data-testid="db-redis-ttl">
              {t("dbKeyTtl")} {keyView.ttl}
            </p>
            {keyView.error ? <p className="db-error">{keyView.error}</p> : null}
            <label className="db-redis-ttl-edit">
              {t("dbRedisTtlSeconds")}
              <input
                data-testid="db-redis-ttl-input"
                value={redisTtlDraft}
                inputMode="numeric"
                onChange={(event) => setRedisTtlDraft(event.target.value)}
              />
            </label>
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
                data-testid="db-redis-expire"
                onClick={() => {
                  const seconds = Number.parseInt(redisTtlDraft, 10);
                  const sql = redisExpireCommand(keyView.name, seconds);
                  if (!sql) {
                    replaceActive({ error: t("dbCommandFailed") });
                    return;
                  }
                  replaceActive({ sql, error: "" });
                  void mutate(sql);
                }}
              >
                {t("dbRedisExpire")}
              </button>
              <button
                type="button"
                data-testid="db-redis-persist"
                onClick={() => {
                  const sql = redisPersistCommand(keyView.name);
                  if (!sql) return;
                  replaceActive({ sql, error: "" });
                  void mutate(sql);
                }}
              >
                {t("dbRedisPersist")}
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
                {!parseMongoJson(mongoDraft).ok ? (
                  <span className="db-form-status-error" data-testid="db-mongo-json-error">
                    <span className="db-form-status-icon" aria-hidden>
                      !
                    </span>
                    <span className="db-form-status-text">{t("dbMongoJsonInvalid")}</span>
                  </span>
                ) : null}
                <button
                  type="button"
                  data-testid="db-mongo-insert"
                  disabled={!parseMongoJson(mongoDraft).ok}
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
                          const next = field?.value ?? text;
                          if (!parseMongoJson(next).ok) {
                            replaceActive({ error: t("dbMongoJsonInvalid") });
                            return;
                          }
                          const sql = mongoReplaceCommand(mongoCollection, text, next);
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
          <div data-testid="db-results" className="db-grid-chrome">
            {result.truncated ? <p data-testid="db-truncated">{t("dbTruncated")}</p> : null}
            {/* Table browse: empty page stays quiet (Navicat). Ad-hoc SQL still shows db-empty. */}
            {result.rows.length === 0 && !tableView ? <p data-testid="db-empty">{t("dbEmpty")}</p> : null}
            <div className="db-grid-toolbar-top">
              {tableView || isObjectDataTab(active) ? (
                <button
                  type="button"
                  className={`db-filter-toggle${filterPaneOpen ? " active" : ""}`}
                  data-testid="db-filter-toggle"
                  aria-label={t("dbFilterToggle")}
                  aria-pressed={filterPaneOpen}
                  title={t("dbFilterToggle")}
                  onClick={() => {
                    const view = tableView ?? (active ? tableViewFromObjectTab(active) : null);
                    if (!view) return;
                    if (!tableView) {
                      tableViewRef.current = view;
                      setTableView(view);
                    }
                    setFilterPaneOpen((open) => {
                      const next = !open;
                      if (next) {
                        setDraftFilterRules(view.filterRules);
                      } else {
                        setFilterSeedId(null);
                      }
                      return next;
                    });
                  }}
                >
                  <Filter size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : (
                <input
                  ref={gridFilterRef}
                  data-testid="db-grid-filter"
                  value={gridFilter}
                  placeholder={t("dbGridFilter")}
                  onChange={(event) => {
                    setGridFilter(event.target.value);
                    setGridPage(1);
                  }}
                />
              )}
              {(tableView?.kind === "table" || active?.kind === "table") ? (
                <button
                  type="button"
                  className="db-action-btn db-row-insert"
                  data-testid="db-row-insert"
                  aria-label={t("dbInsert")}
                  title={t("dbInsert")}
                  onClick={() => {
                    const view = tableView ?? (active ? tableViewFromObjectTab(active) : null);
                    if (!view || view.kind !== "table") return;
                    if (!tableView) {
                      tableViewRef.current = view;
                      setTableView(view);
                      setDataTarget({ schema: view.schema, table: view.table });
                    }
                    const names = insertColumnNames(view);
                    setInsertValues(names.map(() => ""));
                    setInsertOpen(true);
                  }}
                >
                  <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
                </button>
              ) : null}
            </div>
            {tableView && filterPaneOpen ? (
              <FilterSortPane
                columns={columnNames(tableView, result.columns)}
                filterRules={draftFilterRules}
                onFilterRulesChange={setDraftFilterRules}
                onApply={applyFilterSortPane}
                seedFocusId={filterSeedId}
              />
            ) : null}
            <table className="k8s-table db-data-grid">
              <thead>
                <tr>
                  {(result.columns.length > 0 ? result.columns : tableView?.columns.map((column) => column.name) ?? []).map((column) => (
                    <th key={column}>
                      {tableView ? (
                        <div className="db-column-head">
                          <button type="button" className="db-sort" data-testid={`db-sort-${column}`} onClick={() => sortBy(column)}>
                            {column}
                            {tableView.sortColumn === column ? (tableView.sortDir === "asc" ? " ↑" : " ↓") : ""}
                          </button>
                          <button
                            type="button"
                            className="db-column-menu-trigger"
                            data-testid={`db-column-menu-${column}`}
                            aria-label={t("dbAddFilter")}
                            onClick={(event) => {
                              event.stopPropagation();
                              setColumnMenu({ column, x: event.clientX, y: event.clientY });
                            }}
                          >
                            <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
                          </button>
                        </div>
                      ) : (
                        column
                      )}
                    </th>
                  ))}
                  {dataTarget || insertOpen ? <th className="db-row-actions-col" /> : null}
                </tr>
              </thead>
              <tbody>
                {insertOpen && tableView?.kind === "table" ? (
                  <tr className="db-insert-draft" data-testid="db-insert-row">
                    {insertColumnNames(tableView).map((column, index) => (
                      <td key={column} className="db-cell-editing">
                        <input
                          autoFocus={index === 0}
                          data-testid={index === 0 ? "db-insert-cell-0" : undefined}
                          value={insertValues[index] ?? ""}
                          aria-label={column}
                          onChange={(event) => {
                            const next = [...insertValues];
                            next[index] = event.target.value;
                            setInsertValues(next);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              submitInsert();
                            }
                            if (event.key === "Escape") {
                              event.preventDefault();
                              setInsertOpen(false);
                            }
                          }}
                        />
                      </td>
                    ))}
                    <td className="db-row-actions">
                      <button
                        type="button"
                        className="db-row-action"
                        data-testid="db-insert-save"
                        aria-label={t("dbInsert")}
                        title={t("dbInsert")}
                        onClick={submitInsert}
                      >
                        <Check size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        className="db-row-action"
                        data-testid="db-insert-cancel"
                        aria-label={t("dbInsertCancel")}
                        title={t("dbInsertCancel")}
                        onClick={() => setInsertOpen(false)}
                      >
                        <X size={14} strokeWidth={2} aria-hidden="true" />
                      </button>
                    </td>
                  </tr>
                ) : null}
                {(tableView ? result.rows : pageWindow(filterGridRows(result.rows, gridFilter), gridPage).rows).map((row, index) => (
                  <tr key={index}>
                    {row.map((cell, cellIndex) => {
                      const editable =
                        dataTarget != null && selected != null && engineFamily(selected.engine) === "sql";
                      const editing =
                        editable &&
                        editingCell?.row === index &&
                        editingCell?.col === cellIndex;
                      if (!editable) {
                        return (
                          <td key={cellIndex}>
                            {cell == null ? (
                              <span className="db-cell-null-value">{t("dbCellNull")}</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        );
                      }
                      if (!editing) {
                        const beginEdit = (target: HTMLElement) => {
                          setEditingCell({
                            row: index,
                            col: cellIndex,
                            rect: target.getBoundingClientRect(),
                          });
                        };
                        return (
                          <td
                            key={cellIndex}
                            className="db-cell-display db-cell-editable"
                            data-testid={index === 0 && cellIndex === 0 ? "db-cell-display" : undefined}
                            tabIndex={0}
                            title={t("dbCellEditHint")}
                            onClick={(event) => beginEdit(event.currentTarget)}
                            onDoubleClick={(event) => beginEdit(event.currentTarget)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === "F2") {
                                event.preventDefault();
                                beginEdit(event.currentTarget);
                              }
                            }}
                          >
                            {cell == null ? (
                              <span className="db-cell-null-value">{t("dbCellNull")}</span>
                            ) : (
                              String(cell)
                            )}
                          </td>
                        );
                      }
                      const columnName = result.columns[cellIndex] ?? "";
                      const sqlType =
                        tableView?.columns.find((column) => column.name === columnName)?.type ?? "";
                      const editorKind = resolveCellEditorKind(sqlType, cell);
                      const inputType = cellEditorInputType(editorKind);
                      const commitCell = (next: string | null) => {
                        setEditingCell(null);
                        if (!selected || !dataTarget) return;
                        const sql = cellUpdateSql(
                          selected.engine,
                          dataTarget.schema,
                          dataTarget.table,
                          result.columns,
                          row,
                          cellIndex,
                          next,
                        );
                        if (sql) void mutate(sql);
                      };
                      if (cellUsesDateTimePicker(editorKind)) {
                        const pickerKind = editorKind as "time" | "date" | "datetime";
                        return (
                          <td key={cellIndex} className="db-cell-editing">
                            <span className="db-cell-edit db-cell-edit--picker-open">
                              {cell == null ? (
                                <span className="db-cell-null-value">{t("dbCellNull")}</span>
                              ) : (
                                String(cell)
                              )}
                            </span>
                            <DateTimeCellPicker
                              kind={pickerKind}
                              initial={cell}
                              anchorRect={editingCell?.rect ?? null}
                              testId={
                                editorKind === "time"
                                  ? "db-cell-input-time"
                                  : editorKind === "date"
                                    ? "db-cell-input-date"
                                    : "db-cell-input-datetime"
                              }
                              onCancel={() => setEditingCell(null)}
                              onCommit={(next) => commitCell(next)}
                            />
                          </td>
                        );
                      }
                      if (editorKind === "boolean") {
                        const checked =
                          cell === true ||
                          cell === "t" ||
                          cell === "true" ||
                          cell === 1 ||
                          cell === "1";
                        return (
                          <td key={cellIndex} className="db-cell-editing">
                            <span className="db-cell-edit">
                              <input
                                autoFocus
                                type="checkbox"
                                data-testid={
                                  index === 0 && cellIndex === 0
                                    ? "db-cell-input"
                                    : "db-cell-input-boolean"
                                }
                                defaultChecked={checked}
                                onChange={(event) => {
                                  commitCell(event.target.checked ? "true" : "false");
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Escape") {
                                    event.preventDefault();
                                    setEditingCell(null);
                                  }
                                }}
                              />
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={cellIndex} className="db-cell-editing">
                          <span className="db-cell-edit">
                            <input
                              autoFocus
                              type={inputType}
                              data-testid={
                                index === 0 && cellIndex === 0
                                  ? "db-cell-input"
                                  : editorKind !== "text"
                                    ? `db-cell-input-${editorKind}`
                                    : undefined
                              }
                              defaultValue={cellEditorValue(editorKind, cell)}
                              onBlur={(event) => {
                                commitCell(event.target.value);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Escape") {
                                  event.preventDefault();
                                  setEditingCell(null);
                                }
                              }}
                            />
                          </span>
                        </td>
                      );
                    })}
                    {dataTarget && selected && tableView ? (
                      <td className="db-row-actions-col">
                        <button
                          type="button"
                          className="db-row-delete"
                          data-testid="db-row-delete"
                          onClick={() => {
                            const names =
                              tableView.columns.length > 0
                                ? tableView.columns.map((column) => column.name)
                                : result.columns;
                            const values = names.map((name) => {
                              const cellIndex = result.columns.indexOf(name);
                              return cellIndex < 0 ? null : row[cellIndex];
                            });
                            const sql = rowDeleteSql(
                              selected.engine,
                              tableView.schema,
                              tableView.table,
                              names,
                              values,
                            );
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
            <div className="db-grid-toolbar-bottom">
              <div className="db-grid-pager">
                <button
                  type="button"
                  data-testid="db-grid-prev"
                  disabled={tableView ? tableView.page <= 1 : gridPage <= 1}
                  aria-label={t("dbGridPrev")}
                  title={t("dbGridPrev")}
                  onClick={() => turnPage(-1)}
                >
                  <ChevronLeft size={14} strokeWidth={2} aria-hidden="true" />
                </button>
                <span className="db-grid-page" data-testid="db-grid-page">
                  {t("dbGridPage", { page: tableView?.page ?? gridPage })}
                </span>
                <button
                  type="button"
                  data-testid="db-grid-next"
                  disabled={
                    tableView
                      ? result.rows.length < GRID_PAGE_SIZE
                      : pageWindow(filterGridRows(result.rows, gridFilter), gridPage).page >=
                        pageWindow(filterGridRows(result.rows, gridFilter), gridPage).pages
                  }
                  aria-label={t("dbGridNext")}
                  title={t("dbGridNext")}
                  onClick={() => turnPage(1)}
                >
                  <ChevronRight size={14} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        ) : null}
        </div>
          </>
        ) : null}
        {queryFocused ? (
          <p className="db-readonly-hint" data-testid="db-readonly-hint">
            {t("dbReadonlyHint")}
          </p>
        ) : null}
        </div>
        {queryFocused ? (
          <>
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
            className="db-action-btn db-action-btn--primary"
            data-testid="db-run"
            disabled={!selected || busy}
            title={
              sqlRef.current && sqlRef.current.selectionStart !== sqlRef.current.selectionEnd
                ? t("dbRunSelection")
                : t("dbRun")
            }
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
            className="db-action-btn"
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
          <button
            type="button"
            className="db-action-btn"
            data-testid="db-explain"
            disabled={!selected || busy}
            onClick={() => void explain()}
          >
            {t("dbResultPlan")}
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
          <div className="db-tools">
            <button
              type="button"
              className="db-action-btn db-tools-trigger"
              data-testid="db-tools-menu"
              aria-label={t("dbTools")}
              title={t("dbTools")}
              aria-expanded={toolsOpen}
              aria-haspopup="menu"
              onClick={() => setToolsOpen((open) => !open)}
            >
              <Wrench size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
            {toolsOpen ? (
              <div className="db-tools-panel" data-testid="db-tools-panel" role="menu">
                <button
                  type="button"
                  role="menuitem"
                  data-testid="db-export-page"
                  disabled={!result}
                  onClick={() => {
                    exportPage();
                    setToolsOpen(false);
                  }}
                >
                  {t("dbExportPage")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="db-export-filtered"
                  disabled={!result || busy}
                  onClick={() => {
                    void exportFiltered();
                    setToolsOpen(false);
                  }}
                >
                  {t("dbExportFiltered")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="db-import-csv"
                  disabled={!tableView || tableView.kind !== "table" || busy}
                  onClick={() => {
                    importRef.current?.click();
                    setToolsOpen(false);
                  }}
                >
                  {t("dbImportCsv")}
                </button>
                {selected && engineFamily(selected.engine) === "sql" ? (
                  <button
                    type="button"
                    role="menuitem"
                    data-testid="db-create-table"
                    onClick={() => {
                      openCreateTable();
                      setToolsOpen(false);
                    }}
                  >
                    {t("dbCreateTable")}
                  </button>
                ) : null}
                <div className="db-tools-separator" role="separator" />
                <label className="db-tools-field">
                  <span>{t("dbQueryName")}</span>
                  <input
                    data-testid="db-query-name"
                    value={queryName}
                    placeholder={t("dbQueryName")}
                    onChange={(event) => setQueryName(event.target.value)}
                  />
                </label>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="db-save-query"
                  disabled={!selected || !active}
                  onClick={() => {
                    saveCurrentQuery();
                  }}
                >
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
                    setToolsOpen(false);
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
                  role="menuitem"
                  data-testid="db-delete-query"
                  disabled={!savedQueries.some((query) => query.name === queryName.trim())}
                  onClick={() => {
                    const item = savedQueries.find((query) => query.name === queryName.trim());
                    if (item) deleteSavedQuery(item.id);
                  }}
                >
                  {t("dbDeleteQuery")}
                </button>
                <div className="db-tools-separator" role="separator" />
                <button
                  type="button"
                  role="menuitem"
                  data-testid="db-status-sessions"
                  onClick={() => {
                    void openStatus("sessions");
                    setToolsOpen(false);
                  }}
                >
                  {t("dbSessions")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="db-status-locks"
                  onClick={() => {
                    void openStatus("locks");
                    setToolsOpen(false);
                  }}
                >
                  {t("dbLocks")}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  data-testid="db-status-sizes"
                  onClick={() => {
                    void openStatus("sizes");
                    setToolsOpen(false);
                  }}
                >
                  {t("dbSizes")}
                </button>
              </div>
            ) : null}
          </div>
        </div>
        {exportNote ? <p data-testid="db-export-note">{exportNote}</p> : null}
        {importProgress ? (
          <p data-testid="db-import-progress">{t("dbImportProgress", { done: importProgress.done, total: importProgress.total })}</p>
        ) : null}
          </>
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
            <div className="db-form-status" data-testid="db-form-status" aria-live="polite">
              {formError ? (
                <span className="db-form-status-error" data-testid="db-form-error" title={formError}>
                  <span className="db-form-status-icon" aria-hidden>
                    !
                  </span>
                  <span className="db-form-status-text">{shortDbFormError(formError)}</span>
                </span>
              ) : testOk ? (
                <span
                  className="db-form-status-ok"
                  data-testid="db-test-ok"
                  title={t("dbTestOk")}
                  aria-label={t("dbTestOk")}
                >
                  <span className="db-form-status-icon" aria-hidden>
                    ✅
                  </span>
                </span>
              ) : (
                <span className="db-form-status-placeholder" aria-hidden />
              )}
            </div>
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
