import { create } from "zustand";
import {
  ensureSidecar,
  getAiSettings,
  saveAiSettings,
  fetchRunTrace,
  type AiSettingsUpdate,
  type AiSettingsView,
  type SidecarInfo,
  type TraceSpanRow,
} from "../lib/aiEngineer/api";
import {
  cancelAgentRun,
  flushUserContext,
  runAgentChat,
  type AgentUiEvent,
} from "../lib/aiEngineer/chatClient";
import { remoteUserFromServerId } from "../lib/aiEngineer/targetIdentity";
import {
  harnessNudgeContentCode,
  retractProvisionalAssistant,
  withToolEvidenceFlags,
} from "../lib/aiEngineer/harnessNotices";
import { markRunningToolsStopped } from "../lib/aiEngineer/toolRunLifecycle";
import { buildOptimisticToolAfterApproval } from "../lib/aiEngineer/approvalOptimisticExec";
import {
  looksTruncatedAssistant,
  mergeAssistantContinuation,
  stripTrailingDanglingHeading,
} from "../lib/aiEngineer/truncatedAssistant";
import {
  type PendingAttachment,
  toWireAttachments,
} from "../lib/aiEngineer/attachments";
import { formatAppError } from "../lib/formatAppError";
import {
  isAiModelConfigured,
} from "../lib/aiEngineerSettings";
import {
  readWorkspacePanelWidth,
  setWorkspacePanelWidth,
  subscribeWorkspacePanelWidth,
} from "../lib/workspacePanelWidth";
import { useToastStore } from "./toastStore";
import { useSessionStore } from "./sessionStore";
import { pruneOrphanPendingScopes, sanitizeScopeBundle } from "../lib/aiEngineer/chatHistoryPersist";
import {
  hydrateChatHistoryWithMigration,
  loadChatScopeFromDisk,
  saveAllScopesToDisk,
  saveScopeBundleToDisk,
  type DiskScopeBundle,
} from "../lib/aiEngineer/chatHistoryDisk";
import type { K8sClusterTarget } from "../lib/k8s/types";
import type { ManagedEntityRef } from "../lib/management/types";
import { revealAiEngineerPanel } from "./workspacePanelSwitch";
import { focusManagedEntity } from "./managedEntityStore";

let ensureReadyInFlight: Promise<void> | null = null;
let bootstrapListenerReady: Promise<void> | null = null;

function applyBootstrapEvent(payload: {
  phase?: string;
  detail?: string;
  progress?: number;
}) {
  const detail = payload.detail?.trim();
  const phase = payload.phase?.trim();
  const progress =
    typeof payload.progress === "number"
      ? Math.max(0, Math.min(100, payload.progress))
      : null;
  useAiEngineerStore.setState((s) => {
    const nextProgress =
      progress != null
        ? Math.max(s.bootstrapProgress ?? 0, progress)
        : s.bootstrapProgress;
    const bootstrapping = phase != null && phase !== "ready";
    return {
      bootstrapStatus: detail || phase || s.bootstrapStatus,
      bootstrapPhase: phase || s.bootstrapPhase,
      bootstrapProgress: nextProgress,
      starting: bootstrapping ? true : s.starting,
    };
  });
}

async function ensureBootstrapListener() {
  if (bootstrapListenerReady) return bootstrapListenerReady;
  bootstrapListenerReady = (async () => {
    try {
      const { listen } = await import("@tauri-apps/api/event");
      await listen<{
        phase?: string;
        detail?: string;
        progress?: number;
      }>("ai-sidecar-bootstrap", (ev) => {
        applyBootstrapEvent(ev.payload ?? {});
      });
    } catch {
      /* non-Tauri */
    }
  })();
  return bootstrapListenerReady;
}

export type ChatLine =
  | { id: string; kind: "user"; content: string }
  | {
      id: string;
      kind: "assistant";
      content: string;
      streaming?: boolean;
      /** True when this answer turn included tool evidence. */
      toolEvidence?: boolean;
    }
  | {
      id: string;
      kind: "tool";
      name: string;
      callId?: string;
      intent?: string;
      detail?: string;
      status?: "running" | "done" | "failed" | "denied" | "cancelled";
      output?: string;
      startedAt?: number;
      finishedAt?: number;
      /** Last time a live stdout/stderr chunk arrived (ms epoch). */
      lastOutputAt?: number;
      exitCode?: number;
      ok?: boolean;
    }
  | { id: string; kind: "error"; content: string }
  | {
      id: string;
      kind: "notice";
      variant: "compaction" | "resumed" | "info" | "harness";
      content: string;
    }
  | {
      id: string;
      kind: "attachment";
      attachmentKind: "console" | "remote_file" | "local_text" | "local_image";
      label: string;
      preview?: string;
      /** Full text for enlarge (console / remote / local text). */
      body?: string;
      /** data: URL for image enlarge (session; stripped on persist). */
      mediaUrl?: string;
    }
  | {
      id: string;
      kind: "ask";
      requestId: string;
      question: string;
      options?: Array<{ id: string; label: string }>;
      answered?: boolean;
    }
  | {
      id: string;
      kind: "approval";
      approvalId: string;
      /** Host tool call_id from sidecar — enables optimistic exec card. */
      callId?: string;
      command: string;
      risk: string;
      reason: string;
      intent?: string;
      impactPreview?: string;
      rememberableBinaries?: string[];
      networkGuard?: boolean;
      dualConfirm?: boolean;
      confirmPhrase?: string;
      execCommand?: string;
      /** Set after the user acts on this card. */
      decision?: "approved" | "rejected";
    };

export const SECURITY_MODES = ["observe", "safe", "autonomous", "production"] as const;
export type SecurityMode = (typeof SECURITY_MODES)[number];

export const INTERACTION_MODES = ["ask", "plan", "agent"] as const;
export type InteractionMode = (typeof INTERACTION_MODES)[number];

export function normalizeSecurityMode(raw: unknown): SecurityMode {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (SECURITY_MODES as readonly string[]).includes(value)
    ? (value as SecurityMode)
    : "safe";
}

export function normalizeInteractionMode(raw: unknown): InteractionMode {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return (INTERACTION_MODES as readonly string[]).includes(value)
    ? (value as InteractionMode)
    : "agent";
}

export type ChatThread = {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  securityMode: SecurityMode;
  interactionMode: InteractionMode;
  messages: ChatLine[];
  /** Last sidecar run_id for SessionLog resume on the next message. */
  lastRunId?: string | null;
};

export type ScopeThreadBundle = {
  activeThreadId: string;
  threads: ChatThread[];
};

let chatHistoryHydrated = false;
let chatHistoryHydratePromise: Promise<void> | null = null;
let pendingDiskSave: Record<string, ScopeThreadBundle> | null = null;

const MAX_LINES_PER_THREAD = 2000;
const MAX_THREADS_PER_SCOPE = 40;
/** In-memory live card cap; disk keeps longer tails up to MAX_DISK_TOOL_OUTPUT_CHARS. */
const MAX_TOOL_OUTPUT_CHARS = 256 * 1024;
const DEFAULT_THREAD_TITLE = "New chat";
const MAX_DISK_TOOL_OUTPUT_CHARS = 1024 * 1024;

function appendToolOutputText(prev: string | undefined, chunk: string): string {
  let next = (prev ?? "") + chunk;
  if (next.length > MAX_TOOL_OUTPUT_CHARS) {
    next = `…\n${next.slice(-MAX_TOOL_OUTPUT_CHARS)}`;
  }
  return next;
}

function slimToolLineForPersist(line: Extract<ChatLine, { kind: "tool" }>): ChatLine {
  const status = line.status === "running" ? "done" : line.status;
  const output = line.output
    ? line.output.length > MAX_DISK_TOOL_OUTPUT_CHARS
      ? `…\n${line.output.slice(-MAX_DISK_TOOL_OUTPUT_CHARS)}`
      : line.output
    : undefined;
  return {
    ...line,
    status,
    output,
    finishedAt: line.finishedAt ?? (status ? Date.now() : undefined),
    lastOutputAt: undefined,
  };
}

function isPersistableChatLine(v: unknown): v is ChatLine {
  if (!v || typeof v !== "object") return false;
  const kind = (v as { kind?: unknown }).kind;
  return (
    kind === "user" ||
    kind === "assistant" ||
    kind === "tool" ||
    kind === "error" ||
    kind === "notice" ||
    kind === "attachment"
  );
}

function slimMessagesForPersist(lines: ChatLine[]): ChatLine[] {
  return lines
    .filter(isPersistableChatLine)
    .map((line) => {
      if (line.kind === "assistant") {
        return {
          id: line.id,
          kind: "assistant" as const,
          content: line.content,
          ...(typeof line.toolEvidence === "boolean"
            ? { toolEvidence: line.toolEvidence }
            : {}),
        };
      }
      if (line.kind === "tool") {
        return slimToolLineForPersist(line);
      }
      if (line.kind === "notice") {
        return {
          id: line.id,
          kind: "notice" as const,
          variant: line.variant,
          content: line.content,
        };
      }
      if (line.kind === "attachment") {
        const body = line.body?.slice(0, 32 * 1024);
        return {
          id: line.id,
          kind: "attachment" as const,
          attachmentKind: line.attachmentKind,
          label: line.label,
          preview: line.preview,
          ...(body ? { body } : {}),
          // Drop mediaUrl — base64 images stay out of persisted history.
        };
      }
      return line;
    })
    .slice(-MAX_LINES_PER_THREAD);
}

function titleFromMessages(messages: ChatLine[], fallback = DEFAULT_THREAD_TITLE): string {
  const firstUser = messages.find((m) => m.kind === "user");
  if (!firstUser || firstUser.kind !== "user") return fallback;
  const t = firstUser.content.trim().replace(/\s+/g, " ");
  if (!t) return fallback;
  return t.length > 48 ? `${t.slice(0, 48)}…` : t;
}

function nextThreadId(): string {
  return `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

function makeEmptyThread(title = DEFAULT_THREAD_TITLE): ChatThread {
  const now = Date.now();
  return {
    id: nextThreadId(),
    title,
    createdAt: now,
    updatedAt: now,
    securityMode: "safe",
    interactionMode: "agent",
    messages: [],
  };
}

function makeBundle(thread?: ChatThread): ScopeThreadBundle {
  const t = thread ?? makeEmptyThread();
  return { activeThreadId: t.id, threads: [t] };
}

function evictOldestThreads(threads: ChatThread[], activeId: string): ChatThread[] {
  if (threads.length <= MAX_THREADS_PER_SCOPE) return threads;
  const sorted = [...threads].sort((a, b) => a.updatedAt - b.updatedAt);
  const keep = new Set<string>([activeId]);
  for (let i = sorted.length - 1; i >= 0 && keep.size < MAX_THREADS_PER_SCOPE; i -= 1) {
    keep.add(sorted[i].id);
  }
  return threads.filter((t) => keep.has(t.id));
}

function parseV2Bundle(raw: unknown): ScopeThreadBundle | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as {
    activeThreadId?: unknown;
    active_thread_id?: unknown;
    threads?: unknown;
  };
  const activeRaw = o.activeThreadId ?? o.active_thread_id;
  if (!Array.isArray(o.threads) || typeof activeRaw !== "string") return null;
  const threads: ChatThread[] = [];
  for (const item of o.threads) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (typeof t.id !== "string") continue;
    let rawMessages = t.messages;
    if (typeof rawMessages === "string") {
      try {
        rawMessages = JSON.parse(rawMessages);
      } catch {
        rawMessages = [];
      }
    }
    const messages = Array.isArray(rawMessages)
      ? ensureUniqueMessageIds(
          rawMessages.filter(isPersistableChatLine).slice(-MAX_LINES_PER_THREAD),
        )
      : [];
    threads.push({
      id: t.id,
      title:
        typeof t.title === "string" && t.title.trim()
          ? t.title
          : titleFromMessages(messages),
      createdAt:
        typeof t.createdAt === "number"
          ? t.createdAt
          : typeof t.created_at === "number"
            ? t.created_at
            : Date.now(),
      updatedAt:
        typeof t.updatedAt === "number"
          ? t.updatedAt
          : typeof t.updated_at === "number"
            ? t.updated_at
            : Date.now(),
      securityMode: normalizeSecurityMode(t.securityMode ?? t.security_mode),
      interactionMode: normalizeInteractionMode(
        t.interactionMode ?? t.interaction_mode,
      ),
      messages,
      lastRunId:
        typeof t.lastRunId === "string"
          ? t.lastRunId
          : typeof t.last_run_id === "string"
            ? t.last_run_id
            : null,
    });
  }
  if (threads.length === 0) return null;
  const active =
    threads.find((t) => t.id === activeRaw)?.id ?? threads[0].id;
  return { activeThreadId: active, threads };
}

function scopesFromDisk(
  byScope: Record<string, DiskScopeBundle>,
): Record<string, ScopeThreadBundle> {
  const out: Record<string, ScopeThreadBundle> = {};
  for (const [k, v] of Object.entries(byScope)) {
    const bundle = parseV2Bundle(v);
    if (bundle) out[k] = bundle;
  }
  return pruneOrphanPendingScopes(out) as Record<string, ScopeThreadBundle>;
}

function toDiskBundle(bundle: ScopeThreadBundle): DiskScopeBundle {
  return {
    activeThreadId: bundle.activeThreadId,
    threads: bundle.threads.map((t) => ({
      id: t.id,
      title: t.title,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
      securityMode: t.securityMode,
      interactionMode: t.interactionMode,
      messages: ensureUniqueMessageIds(slimMessagesForPersist(t.messages)),
      ...(t.lastRunId ? { lastRunId: t.lastRunId } : {}),
    })),
  };
}

function slimByScopeForPersist(
  byScope: Record<string, ScopeThreadBundle>,
): Record<string, ScopeThreadBundle> {
  const slim: Record<string, ScopeThreadBundle> = {};
  for (const [k, bundle] of Object.entries(byScope)) {
    slim[k] = {
      activeThreadId: bundle.activeThreadId,
      threads: bundle.threads.map((t) => ({
        ...t,
        messages: ensureUniqueMessageIds(slimMessagesForPersist(t.messages)),
      })),
    };
  }
  return slim;
}

function mergeScopeBundles(
  disk: ScopeThreadBundle | undefined,
  mem: ScopeThreadBundle | undefined,
): ScopeThreadBundle | null {
  if (!disk && !mem) return null;
  if (!disk) return sanitizeScopeBundle(mem!) as ScopeThreadBundle;
  if (!mem) return sanitizeScopeBundle(disk) as ScopeThreadBundle;
  const byId = new Map<string, ChatThread>();
  for (const t of disk.threads) byId.set(t.id, t);
  for (const t of mem.threads) {
    const prev = byId.get(t.id);
    // Empty in-memory placeholders must not overwrite disk threads with content.
    if (
      prev &&
      prev.messages.length > 0 &&
      t.messages.length === 0 &&
      t.updatedAt >= prev.updatedAt
    ) {
      continue;
    }
    if (!prev || t.updatedAt >= prev.updatedAt) byId.set(t.id, t);
  }
  const threads = [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  if (threads.length === 0) return null;
  return sanitizeScopeBundle({
    activeThreadId: mem.activeThreadId || disk.activeThreadId,
    threads,
  }) as ScopeThreadBundle;
}

function mergeThreadsByScope(
  disk: Record<string, ScopeThreadBundle>,
  mem: Record<string, ScopeThreadBundle>,
): Record<string, ScopeThreadBundle> {
  const keys = new Set([...Object.keys(disk), ...Object.keys(mem)]);
  const out: Record<string, ScopeThreadBundle> = {};
  for (const k of keys) {
    const merged = mergeScopeBundles(disk[k], mem[k]);
    if (merged) out[k] = merged;
  }
  return pruneOrphanPendingScopes(out) as Record<string, ScopeThreadBundle>;
}

function flushPersistedThreads(byScope: Record<string, ScopeThreadBundle>) {
  const cleaned = pruneOrphanPendingScopes(slimByScopeForPersist(byScope)) as Record<
    string,
    ScopeThreadBundle
  >;
  const diskMap = Object.fromEntries(
    Object.entries(cleaned).map(([k, b]) => [k, toDiskBundle(b)]),
  );
  void saveAllScopesToDisk(diskMap).catch((err) => {
    useToastStore
      .getState()
      .pushToast(`聊天记录写入磁盘失败：${String(err)}`, false);
  });
}

function savePersistedThreads(
  byScope: Record<string, ScopeThreadBundle>,
  dirtyScope?: string,
) {
  const cleaned = pruneOrphanPendingScopes(slimByScopeForPersist(byScope)) as Record<
    string,
    ScopeThreadBundle
  >;
  if (!chatHistoryHydrated) {
    // Never queue empty-only scopes before hydrate — that would race and look
    // like history was wiped when an empty "New chat" becomes active.
    const safe: Record<string, ScopeThreadBundle> = {};
    for (const [scope, bundle] of Object.entries(cleaned)) {
      const hasMsgs = bundle.threads.some((t) => t.messages.length > 0);
      if (hasMsgs) safe[scope] = bundle;
    }
    pendingDiskSave = Object.keys(safe).length ? safe : null;
    return;
  }
  if (dirtyScope && cleaned[dirtyScope]) {
    void saveScopeBundleToDisk(dirtyScope, toDiskBundle(cleaned[dirtyScope])).catch(
      (err) => {
        useToastStore
          .getState()
          .pushToast(`聊天记录写入磁盘失败：${String(err)}`, false);
      },
    );
    return;
  }
  flushPersistedThreads(cleaned);
}

function applyScopeAfterDiskLoad(
  get: () => AiEngineerState,
  set: (
    partial:
      | Partial<AiEngineerState>
      | ((s: AiEngineerState) => Partial<AiEngineerState>),
  ) => void,
  scope: string,
) {
  void (async () => {
    await ensureChatHistoryHydrated(get, set);
    if (get().chatScope !== scope) return;
    const map = await fillScopeMessagesFromDisk(scope, get().threadsByScope);
    if (get().chatScope !== scope) return;
    const loaded = loadScopeIntoState(map, scope, get().inputsByThread);
    // Don't clobber newer in-memory messages for the active thread.
    const cur = get();
    const activeId = loaded.activeThreadId;
    const curHas =
      cur.activeThreadId === activeId &&
      cur.messages.some((m) => m.kind === "user" || m.kind === "assistant");
    const diskHas = loaded.messages.length > 0;
    set({
      threadsByScope: loaded.threadsByScope,
      activeThreadId: loaded.activeThreadId || null,
      messages: curHas && !diskHas ? cur.messages : loaded.messages,
      input: loaded.input,
      inputsByThread: {
        ...get().inputsByThread,
        ...(loaded.activeThreadId
          ? { [loaded.activeThreadId]: loaded.input }
          : {}),
      },
    });
  })();
}

async function fillScopeMessagesFromDisk(
  scope: string,
  map: Record<string, ScopeThreadBundle>,
): Promise<Record<string, ScopeThreadBundle>> {
  try {
    const disk = await loadChatScopeFromDisk(scope);
    if (!disk) return map;
    const bundle = parseV2Bundle(disk);
    if (!bundle) return map;
    const mem = map[scope];
    const merged = mergeScopeBundles(bundle, mem);
    if (!merged) return map;
    return { ...map, [scope]: merged };
  } catch {
    return map;
  }
}

function ensureChatHistoryHydrated(
  get: () => AiEngineerState,
  set: (
    partial:
      | Partial<AiEngineerState>
      | ((s: AiEngineerState) => Partial<AiEngineerState>),
  ) => void,
): Promise<void> {
  if (chatHistoryHydrated) return Promise.resolve();
  if (chatHistoryHydratePromise) return chatHistoryHydratePromise;

  chatHistoryHydratePromise = (async () => {
    try {
      const snap = await hydrateChatHistoryWithMigration();
      const fromDisk = scopesFromDisk(snap.byScope ?? {});
      const mem = get().threadsByScope;
      let merged = mergeThreadsByScope(fromDisk, mem);

      const queued = pendingDiskSave;
      pendingDiskSave = null;
      if (queued) merged = mergeThreadsByScope(merged, queued);

      const { chatScope, inputsByThread } = get();
      if (chatScope) {
        merged = await fillScopeMessagesFromDisk(chatScope, merged);
      }

      chatHistoryHydrated = true;

      if (chatScope) {
        const loaded = loadScopeIntoState(merged, chatScope, inputsByThread);
        set({
          threadsByScope: loaded.threadsByScope,
          activeThreadId: loaded.activeThreadId || null,
          messages: loaded.messages,
          input: loaded.input,
          inputsByThread: loaded.activeThreadId
            ? {
                ...inputsByThread,
                [loaded.activeThreadId]: loaded.input,
              }
            : inputsByThread,
        });
      } else {
        set({ threadsByScope: merged });
      }
    } catch (err) {
      // Stay unhydrated so we retry and never persist empty placeholders.
      chatHistoryHydrated = false;
      useToastStore
        .getState()
        .pushToast(`聊天记录加载失败：${String(err)}`, false);
      pendingDiskSave = null;
    } finally {
      chatHistoryHydratePromise = null;
    }
  })();

  return chatHistoryHydratePromise;
}

type PendingAsk = {
  requestId: string;
  resolve: (v: { selected_option_ids: string[]; free_text?: string }) => void;
};

type PendingApproval = {
  approvalId: string;
  dualConfirm: boolean;
  confirmPhrase: string;
  rememberableBinaries: string[];
  resolve: (v: {
    approved: boolean;
    confirm_text?: string;
    remember_read_binaries?: string[];
    approve_for_session?: boolean;
    approve_permanently?: boolean;
  }) => void;
};

export type PlanStep = {
  step: string;
  status: "pending" | "in_progress" | "completed" | string;
};

export type ActiveInvestigation = {
  childRunId: string;
  question: string;
  focus?: string;
  status: "running" | "done" | "failed";
  summaryPreview?: string;
};

export type EngineerMode = "linux" | "k8s";

/** Isolate chat by cluster, host, or terminal session. */
export function aiChatScopeKey(
  sessionId: string,
  serverId?: string | null,
  clusterId?: string | null,
): string {
  const cid = (clusterId ?? "").trim();
  if (cid) return `cluster:${cid}`;
  const sid = (serverId ?? "").trim();
  return sid ? `server:${sid}` : `session:${sessionId}`;
}

export function k8sSyntheticSessionId(clusterId: string): string {
  // Cluster ids often embed kubeconfig paths (`kube:/path:ctx`). Starlette
  // decodes %2F to `/` before routing, so /v1/sessions/{session_id}/pull|stream
  // must stay a single path segment — never put raw `/` in the session id.
  return `k8s:${clusterId.replace(/\//g, "|")}`;
}

let chatAbort: AbortController | null = null;
let activeRunId: string | null = null;
/** Scope that owns the in-flight run; events for other scopes are ignored. */
let activeRunScope: string | null = null;
let activeRunThreadId: string | null = null;
let lineSeq = 0;
const nextId = () => {
  try {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `m_${crypto.randomUUID()}`;
    }
  } catch {
    /* ignore */
  }
  lineSeq += 1;
  return `m_${Date.now().toString(36)}_${lineSeq}`;
};

/** React keys must be unique — old `m1`/`m2` seq reset on reload and collided. */
function ensureUniqueMessageIds(messages: ChatLine[]): ChatLine[] {
  const seen = new Set<string>();
  let changed = false;
  const out = messages.map((line) => {
    const id = typeof line.id === "string" ? line.id : "";
    if (id && !seen.has(id)) {
      seen.add(id);
      return line;
    }
    changed = true;
    const fresh = nextId();
    seen.add(fresh);
    return { ...line, id: fresh } as ChatLine;
  });
  return changed ? out : messages;
}

type AiEngineerState = {
  open: boolean;
  width: number;
  sessionId: string | null;
  serverId: string | null;
  engineerMode: EngineerMode;
  clusterId: string | null;
  clusterName: string | null;
  clusterTarget: K8sClusterTarget | null;
  /** Current chat bucket key (cluster:*, server:*, or session:*). */
  chatScope: string | null;
  activeThreadId: string | null;
  ready: boolean;
  starting: boolean;
  /** First-launch bootstrap phase from Rust (`ai-sidecar-bootstrap`). */
  bootstrapStatus: string | null;
  bootstrapPhase: string | null;
  bootstrapProgress: number | null;
  busy: boolean;
  /** Model-side phase while busy: thinking (CoT suppressed) or streaming answer. */
  modelPhase: "idle" | "thinking" | "streaming";
  error: string | null;
  sidecar: SidecarInfo | null;
  settings: AiSettingsView | null;
  settingsOpen: boolean;
  input: string;
  messages: ChatLine[];
  threadsByScope: Record<string, ScopeThreadBundle>;
  inputsByThread: Record<string, string>;
  pendingAsk: PendingAsk | null;
  pendingApproval: PendingApproval | null;
  activePlan: PlanStep[] | null;
  activeInvestigation: ActiveInvestigation | null;
  pendingAttachments: PendingAttachment[];
  /** Live run timing spans (model / tool / approval). */
  runTraceSpans: TraceSpanRow[];
  /** Bumped to focus the composer textarea (e.g. after Send to chat). */
  composerFocusNonce: number;
  openPanel: (sessionId: string, serverId?: string) => void;
  openK8sPanel: (
    clusterId: string,
    clusterName?: string,
    clusterTarget?: K8sClusterTarget | null,
  ) => void;
  /** Unified Hosts/K8s AI binding entry. */
  bindManagedEntity: (
    ref: ManagedEntityRef,
    opts?: {
      open?: boolean;
      clusterTarget?: K8sClusterTarget | null;
    },
  ) => void;
  requestComposerFocus: () => void;
  /** Re-bind chat when the active terminal/server changes while panel stays open. */
  bindContext: (sessionId: string, serverId?: string) => void;
  bindK8sContext: (
    clusterId: string,
    clusterName?: string,
    clusterTarget?: K8sClusterTarget | null,
  ) => void;
  setEngineerMode: (mode: EngineerMode) => void;
  /** Soft-close kept for callers; side panels stay open until explicit collapse. */
  close: (opts?: { force?: boolean }) => void;
  setWidth: (w: number) => void;
  setInput: (v: string) => void;
  setSettingsOpen: (v: boolean) => void;
  setThreadSecurityMode: (mode: string) => void;
  setThreadInteractionMode: (mode: string) => void;
  addPendingAttachment: (att: PendingAttachment) => void;
  removePendingAttachment: (id: string) => void;
  clearPendingAttachments: () => void;
  createThread: () => string;
  switchThread: (threadId: string) => void;
  deleteThread: (threadId: string) => void;
  ensureReady: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  saveSettings: (update: AiSettingsUpdate) => Promise<void>;
  sendMessage: (opts: {
    sessionId: string;
    serverId?: string;
    clusterId?: string;
    /** Stop the in-flight run first, then send (interject). */
    interruptIfBusy?: boolean;
  }) => Promise<void>;
  stopActiveRun: () => void;
  flushMidRunContext: (content: string) => Promise<boolean>;
  resolveAsk: (selected: string[], freeText?: string) => void;
  resolveApproval: (
    approved: boolean,
    confirmText?: string,
    rememberRead?: boolean,
    approveForSession?: boolean,
    approvePermanently?: boolean,
  ) => void;
};

function abortActiveRun(
  getPending: () => {
    pendingAsk: PendingAsk | null;
    pendingApproval: PendingApproval | null;
  },
  reason: "switch" | "stop",
) {
  const { pendingAsk, pendingApproval } = getPending();
  if (pendingAsk) {
    pendingAsk.resolve({
      selected_option_ids: [],
      free_text: reason === "stop" ? "cancelled" : "context_switched",
    });
  }
  if (pendingApproval) {
    pendingApproval.resolve({ approved: false });
  }
  chatAbort?.abort();
  chatAbort = null;
  activeRunId = null;
  activeRunScope = null;
  activeRunThreadId = null;
}

function commitThreadMessages(
  get: () => AiEngineerState,
  scope: string,
  threadId: string,
  messages: ChatLine[],
  opts?: { bumpTitle?: boolean },
): Record<string, ScopeThreadBundle> {
  const prev = get().threadsByScope;
  const bundle = prev[scope] ?? makeBundle();
  const threads = bundle.threads.map((t) => {
    if (t.id !== threadId) return t;
    const title =
      opts?.bumpTitle &&
      (t.title === DEFAULT_THREAD_TITLE || t.title === "Chat 1" || !t.title.trim())
        ? titleFromMessages(messages, t.title || DEFAULT_THREAD_TITLE)
        : t.title;
    return {
      ...t,
      title,
      messages,
      updatedAt: Date.now(),
    };
  });
  const next: Record<string, ScopeThreadBundle> = {
    ...prev,
    [scope]: {
      activeThreadId: threadId,
      threads: evictOldestThreads(threads, threadId),
    },
  };
  savePersistedThreads(next, scope);
  return next;
}

function persistCurrentThread(
  get: () => AiEngineerState,
): Pick<AiEngineerState, "threadsByScope" | "inputsByThread"> {
  const { chatScope, activeThreadId, messages, input, threadsByScope, inputsByThread } =
    get();
  if (!chatScope || !activeThreadId) {
    return { threadsByScope, inputsByThread };
  }
  const nextByScope = commitThreadMessages(get, chatScope, activeThreadId, messages);
  return {
    threadsByScope: nextByScope,
    inputsByThread: { ...inputsByThread, [activeThreadId]: input },
  };
}

function loadScopeIntoState(
  threadsByScope: Record<string, ScopeThreadBundle>,
  scope: string,
  inputsByThread: Record<string, string>,
): {
  threadsByScope: Record<string, ScopeThreadBundle>;
  activeThreadId: string;
  messages: ChatLine[];
  input: string;
} {
  let nextMap = threadsByScope;
  let bundle = nextMap[scope];
  if (bundle) {
    bundle = sanitizeScopeBundle(bundle) as ScopeThreadBundle;
    if (bundle !== nextMap[scope]) {
      nextMap = { ...nextMap, [scope]: bundle };
    }
  }
  if (!bundle || bundle.threads.length === 0) {
    // Before disk hydrate finishes, never invent+persist an empty "New chat"
    // or it becomes the active thread and looks like history was wiped.
    if (!chatHistoryHydrated) {
      return {
        threadsByScope: nextMap,
        activeThreadId: "",
        messages: [],
        input: "",
      };
    }
    const thread = makeEmptyThread();
    bundle = makeBundle(thread);
    nextMap = { ...nextMap, [scope]: bundle };
    savePersistedThreads(nextMap, scope);
  }
  const active =
    bundle.threads.find((t) => t.id === bundle!.activeThreadId) ?? bundle.threads[0];
  const uniqueMessages = ensureUniqueMessageIds(active.messages);
  if (uniqueMessages !== active.messages) {
    nextMap = {
      ...nextMap,
      [scope]: {
        ...bundle,
        threads: bundle.threads.map((t) =>
          t.id === active.id ? { ...t, messages: uniqueMessages } : t,
        ),
      },
    };
    savePersistedThreads(nextMap, scope);
  }
  return {
    threadsByScope: nextMap,
    activeThreadId: active.id,
    messages: uniqueMessages,
    input: inputsByThread[active.id] ?? "",
  };
}

export const useAiEngineerStore = create<AiEngineerState>((set, get) => ({
  open: false,
  width: readWorkspacePanelWidth(),
  sessionId: null,
  serverId: null,
  engineerMode: "linux",
  clusterId: null,
  clusterName: null,
  clusterTarget: null,
  chatScope: null,
  activeThreadId: null,
  ready: false,
  starting: false,
  bootstrapStatus: null,
  bootstrapPhase: null,
  bootstrapProgress: null,
  busy: false,
  modelPhase: "idle",
  error: null,
  sidecar: null,
  settings: null,
  settingsOpen: false,
  input: "",
  messages: [],
  threadsByScope: {},
  inputsByThread: {},
  pendingAsk: null,
  pendingApproval: null,
  activePlan: null,
  activeInvestigation: null,
  pendingAttachments: [],
  runTraceSpans: [],
  composerFocusNonce: 0,

  openPanel: (sessionId, serverId) => {
    get().bindManagedEntity(
      {
        kind: "server",
        id: serverId || sessionId,
        label: sessionId,
        sessionId,
        serverId: serverId ?? null,
      },
      { open: true },
    );
  },

  openK8sPanel: (clusterId, clusterName, clusterTarget) => {
    get().bindManagedEntity(
      {
        kind: "cluster",
        id: clusterId,
        label: clusterName ?? clusterId,
      },
      { open: true, clusterTarget },
    );
  },

  bindManagedEntity: (ref, opts) => {
    focusManagedEntity(ref);
    const open = opts?.open ?? false;
    if (ref.kind === "cluster") {
      set({ engineerMode: "k8s" });
      get().bindK8sContext(ref.id, ref.label, opts?.clusterTarget);
      if (open) {
        set({ open: true });
        void get().ensureReady();
      }
      return;
    }
    const sessionId = ref.sessionId || ref.id;
    set({ engineerMode: "linux" });
    get().bindContext(sessionId, ref.serverId ?? undefined);
    if (open) {
      set({ open: true });
      void get().ensureReady();
    }
  },

  requestComposerFocus: () => {
    set((s) => ({
      open: true,
      composerFocusNonce: s.composerFocusNonce + 1,
    }));
  },

  setEngineerMode: (mode) => {
    set({ engineerMode: mode });
  },

  bindK8sContext: (clusterId, clusterName, clusterTarget) => {
    const sessionId = k8sSyntheticSessionId(clusterId);
    const nextScope = aiChatScopeKey(sessionId, null, clusterId);
    const prev = get();
    // Prefer explicit target; if omitted while staying on the same cluster, keep
    // previous. When switching cluster id without a target, clear stale target
    // so the host bridge falls back to the workbench selection.
    const nextTarget =
      clusterTarget !== undefined && clusterTarget !== null
        ? clusterTarget
        : prev.clusterId === clusterId
          ? prev.clusterTarget
          : null;
    if (
      prev.chatScope === nextScope &&
      prev.sessionId === sessionId &&
      prev.clusterId === clusterId
    ) {
      if (clusterTarget && clusterTarget !== prev.clusterTarget) {
        set({ clusterTarget, clusterName: clusterName ?? prev.clusterName });
      }
      applyScopeAfterDiskLoad(get, set, nextScope);
      return;
    }

    const persisted = persistCurrentThread(get);
    const switchingAway =
      prev.chatScope != null && prev.chatScope !== nextScope;

    if (switchingAway && (prev.busy || prev.pendingAsk || prev.pendingApproval)) {
      const { sidecar, sessionId: oldSession } = prev;
      const runId = activeRunId;
      abortActiveRun(() => prev, "switch");
      if (sidecar && oldSession && runId) {
        void cancelAgentRun(sidecar, oldSession, runId).catch(() => undefined);
      }
    }

    const loaded = loadScopeIntoState(
      persisted.threadsByScope,
      nextScope,
      persisted.inputsByThread,
    );

    set({
      ...persisted,
      ...loaded,
      engineerMode: "k8s",
      sessionId,
      serverId: null,
      clusterId,
      clusterName: clusterName ?? clusterId,
      clusterTarget: nextTarget ?? null,
      chatScope: nextScope,
      busy: switchingAway ? false : prev.busy,
      modelPhase: switchingAway ? "idle" : prev.modelPhase,
      pendingAsk: switchingAway ? null : prev.pendingAsk,
      pendingApproval: switchingAway ? null : prev.pendingApproval,
      activeInvestigation: switchingAway ? null : prev.activeInvestigation,
    });
    applyScopeAfterDiskLoad(get, set, nextScope);
  },

  bindContext: (sessionId, serverId) => {
    const nextScope = aiChatScopeKey(sessionId, serverId);
    const prev = get();
    if (
      prev.chatScope === nextScope &&
      prev.sessionId === sessionId &&
      (prev.serverId ?? null) === (serverId ?? null) &&
      prev.engineerMode === "linux"
    ) {
      applyScopeAfterDiskLoad(get, set, nextScope);
      return;
    }

    const persisted = persistCurrentThread(get);
    const switchingAway =
      prev.chatScope != null && prev.chatScope !== nextScope;

    if (switchingAway && (prev.busy || prev.pendingAsk || prev.pendingApproval)) {
      const { sidecar, sessionId: oldSession } = prev;
      const runId = activeRunId;
      abortActiveRun(() => prev, "switch");
      if (sidecar && oldSession && runId) {
        void cancelAgentRun(sidecar, oldSession, runId).catch(() => undefined);
      }
    }

    const loaded = loadScopeIntoState(
      persisted.threadsByScope,
      nextScope,
      persisted.inputsByThread,
    );

    set({
      ...persisted,
      ...loaded,
      engineerMode: "linux",
      sessionId,
      serverId: serverId ?? null,
      clusterId: null,
      clusterName: null,
      clusterTarget: null,
      chatScope: nextScope,
      busy: switchingAway ? false : prev.busy,
      modelPhase: switchingAway ? "idle" : prev.modelPhase,
      pendingAsk: switchingAway ? null : prev.pendingAsk,
      pendingApproval: switchingAway ? null : prev.pendingApproval,
      activeInvestigation: switchingAway ? null : prev.activeInvestigation,
    });
    applyScopeAfterDiskLoad(get, set, nextScope);
  },

  close: (_opts) => {
    const persisted = persistCurrentThread(get);
    set({
      ...persisted,
      open: false,
      settingsOpen: false,
    });
  },

  setWidth: (w) => {
    const next = setWorkspacePanelWidth(w);
    set({ width: next });
  },

  setInput: (v) => {
    const { activeThreadId, inputsByThread } = get();
    set({
      input: v,
      inputsByThread: activeThreadId
        ? { ...inputsByThread, [activeThreadId]: v }
        : inputsByThread,
    });
  },

  setSettingsOpen: (v) => set({ settingsOpen: v }),

  setThreadSecurityMode: (mode) => {
    const { chatScope, activeThreadId, threadsByScope } = get();
    if (!chatScope || !activeThreadId) return;
    const nextMode = normalizeSecurityMode(mode);
    const bundle = threadsByScope[chatScope];
    if (!bundle) return;
    const threads = bundle.threads.map((t) =>
      t.id === activeThreadId
        ? { ...t, securityMode: nextMode, updatedAt: Date.now() }
        : t,
    );
    const nextByScope = {
      ...threadsByScope,
      [chatScope]: { ...bundle, threads },
    };
    savePersistedThreads(nextByScope, chatScope);
    set({ threadsByScope: nextByScope });
  },

  setThreadInteractionMode: (mode) => {
    const { chatScope, activeThreadId, threadsByScope } = get();
    if (!chatScope || !activeThreadId) return;
    const nextMode = normalizeInteractionMode(mode);
    const bundle = threadsByScope[chatScope];
    if (!bundle) return;
    const threads = bundle.threads.map((t) =>
      t.id === activeThreadId
        ? { ...t, interactionMode: nextMode, updatedAt: Date.now() }
        : t,
    );
    const nextByScope = {
      ...threadsByScope,
      [chatScope]: { ...bundle, threads },
    };
    savePersistedThreads(nextByScope, chatScope);
    set({ threadsByScope: nextByScope });
  },

  addPendingAttachment: (att) => {
    set({ pendingAttachments: [...get().pendingAttachments, att] });
  },

  removePendingAttachment: (id) => {
    set({
      pendingAttachments: get().pendingAttachments.filter((a) => a.id !== id),
    });
  },

  clearPendingAttachments: () => set({ pendingAttachments: [] }),

  createThread: () => {
    const { chatScope, busy, pendingAsk, pendingApproval, sidecar, sessionId } =
      get();
    if (!chatScope) return "";
    if (busy || pendingAsk || pendingApproval) {
      const runId = activeRunId;
      abortActiveRun(() => get(), "switch");
      if (sidecar && sessionId && runId) {
        void cancelAgentRun(sidecar, sessionId, runId).catch(() => undefined);
      }
    }
    const persisted = persistCurrentThread(get);
    const thread = makeEmptyThread();
    const prevBundle = persisted.threadsByScope[chatScope] ?? makeBundle();
    const threads = evictOldestThreads(
      [...prevBundle.threads, thread],
      thread.id,
    );
    const threadsByScope = {
      ...persisted.threadsByScope,
      [chatScope]: { activeThreadId: thread.id, threads },
    };
    savePersistedThreads(threadsByScope, chatScope);
    set({
      ...persisted,
      threadsByScope,
      activeThreadId: thread.id,
      messages: [],
      input: "",
      busy: false,
      modelPhase: "idle",
      pendingAsk: null,
      pendingApproval: null,
      activeInvestigation: null,
      pendingAttachments: [],
      inputsByThread: { ...persisted.inputsByThread, [thread.id]: "" },
    });
    return thread.id;
  },

  switchThread: (threadId) => {
    const { chatScope, activeThreadId, busy, pendingAsk, pendingApproval, sidecar, sessionId } =
      get();
    if (!chatScope || threadId === activeThreadId) return;
    const existing = get().threadsByScope[chatScope]?.threads.find((t) => t.id === threadId);
    if (!existing) return;

    if (busy || pendingAsk || pendingApproval) {
      const runId = activeRunId;
      abortActiveRun(() => get(), "switch");
      if (sidecar && sessionId && runId) {
        void cancelAgentRun(sidecar, sessionId, runId).catch(() => undefined);
      }
    }

    const applySwitch = (
      map: Record<string, ScopeThreadBundle>,
      inputsByThread: Record<string, string>,
    ) => {
      const bundle = map[chatScope];
      const target = bundle?.threads.find((t) => t.id === threadId);
      if (!target || !bundle) return;
      const uniqueMessages = ensureUniqueMessageIds(target.messages);
      const threadsByScope = {
        ...map,
        [chatScope]: {
          ...bundle,
          activeThreadId: threadId,
          threads:
            uniqueMessages === target.messages
              ? bundle.threads
              : bundle.threads.map((t) =>
                  t.id === threadId ? { ...t, messages: uniqueMessages } : t,
                ),
        },
      };
      savePersistedThreads(threadsByScope, chatScope);
      set({
        threadsByScope,
        activeThreadId: threadId,
        messages: uniqueMessages,
        input: inputsByThread[threadId] ?? "",
        inputsByThread,
        busy: false,
        modelPhase: "idle",
        pendingAsk: null,
        pendingApproval: null,
        activeInvestigation: null,
      });
    };

    // Index hydrate leaves bodies empty — pull from disk before showing.
    if (existing.messages.length === 0) {
      const scope = chatScope;
      void (async () => {
        await ensureChatHistoryHydrated(get, set);
        if (get().chatScope !== scope) return;
        const persisted = persistCurrentThread(get);
        const map = await fillScopeMessagesFromDisk(scope, persisted.threadsByScope);
        if (get().chatScope !== scope) return;
        applySwitch(map, persisted.inputsByThread);
      })();
      return;
    }

    const persisted = persistCurrentThread(get);
    applySwitch(persisted.threadsByScope, persisted.inputsByThread);
  },

  deleteThread: (threadId) => {
    const { chatScope } = get();
    if (!chatScope) return;
    const persisted = persistCurrentThread(get);
    const bundle = persisted.threadsByScope[chatScope];
    if (!bundle) return;
    let threads = bundle.threads.filter((t) => t.id !== threadId);
    if (threads.length === 0) {
      threads = [makeEmptyThread()];
    }
    const nextActive =
      bundle.activeThreadId === threadId
        ? [...threads].sort((a, b) => b.updatedAt - a.updatedAt)[0]
        : threads.find((t) => t.id === bundle.activeThreadId) ?? threads[0];
    const threadsByScope = {
      ...persisted.threadsByScope,
      [chatScope]: { activeThreadId: nextActive.id, threads },
    };
    savePersistedThreads(threadsByScope, chatScope);
    const { [threadId]: _removed, ...restInputs } = persisted.inputsByThread;
    void _removed;
    set({
      ...persisted,
      threadsByScope,
      activeThreadId: nextActive.id,
      messages: nextActive.messages,
      input: restInputs[nextActive.id] ?? "",
      inputsByThread: restInputs,
      busy: false,
      modelPhase: "idle",
      pendingAsk: null,
      pendingApproval: null,
      activeInvestigation: null,
    });
  },

  ensureReady: async () => {
    await ensureChatHistoryHydrated(get, set);
    if (get().ready) return;
    if (ensureReadyInFlight) return ensureReadyInFlight;

    ensureReadyInFlight = (async () => {
      await ensureBootstrapListener();
      set((s) => ({
        starting: true,
        error: null,
        ...(s.bootstrapPhase == null && s.bootstrapProgress == null
          ? {
              bootstrapStatus: null,
              bootstrapPhase: null,
              bootstrapProgress: null,
            }
          : {}),
      }));
      try {
        const settings = await getAiSettings();
        const sidecar = await ensureSidecar();
        set({
          settings,
          sidecar,
          ready: true,
          starting: false,
          error: null,
          bootstrapStatus: null,
          bootstrapPhase: null,
          bootstrapProgress: null,
        });
      } catch (err) {
        set({
          starting: false,
          ready: false,
          sidecar: null,
          error: formatAppError(err),
          bootstrapStatus: null,
          bootstrapPhase: null,
          bootstrapProgress: null,
        });
      } finally {
        ensureReadyInFlight = null;
      }
    })();

    return ensureReadyInFlight;
  },

  refreshSettings: async () => {
    try {
      const settings = await getAiSettings();
      set({ settings });
    } catch {
      /* ignore */
    }
  },

  saveSettings: async (update) => {
    const settings = await saveAiSettings(update);
    set({ settings });
  },

  stopActiveRun: () => {
    const {
      sidecar,
      sessionId,
      pendingApproval,
      pendingAsk,
      chatScope,
      activeThreadId,
      messages,
    } = get();
    const runId = activeRunId;
    abortActiveRun(() => get(), "stop");
    let nextMessages = messages.map((line) => {
      if (
        pendingApproval &&
        line.kind === "approval" &&
        line.approvalId === pendingApproval.approvalId &&
        !line.decision
      ) {
        return { ...line, decision: "rejected" as const };
      }
      if (
        pendingAsk &&
        line.kind === "ask" &&
        line.requestId === pendingAsk.requestId &&
        !line.answered
      ) {
        return { ...line, answered: true };
      }
      return line;
    });
    nextMessages = markRunningToolsStopped(nextMessages);
    const threadsByScope =
      chatScope && activeThreadId
        ? commitThreadMessages(get, chatScope, activeThreadId, nextMessages)
        : get().threadsByScope;
    set({
      busy: false,
      modelPhase: "idle",
      pendingAsk: null,
      pendingApproval: null,
      activeInvestigation: null,
      messages: nextMessages,
      threadsByScope,
    });
    if (sidecar && sessionId && runId) {
      void cancelAgentRun(sidecar, sessionId, runId).catch(() => undefined);
    }
  },

  flushMidRunContext: async (content: string) => {
    const trimmed = content.trim();
    if (!trimmed) return false;
    const { sidecar, sessionId, busy } = get();
    const runId = activeRunId;
    if (!busy || !sidecar || !sessionId || !runId) {
      return false;
    }
    try {
      await flushUserContext(sidecar, sessionId, runId, trimmed);
      const note = `[USER CONTEXT]\n${trimmed.slice(0, 64 * 1024)}`;
      const { chatScope, activeThreadId, messages } = get();
      const nextMessages: ChatLine[] = [
        ...messages,
        {
          id: `m_${crypto.randomUUID()}`,
          kind: "notice",
          variant: "info",
          content: note.slice(0, 500),
        },
      ];
      const threadsByScope =
        chatScope && activeThreadId
          ? commitThreadMessages(get, chatScope, activeThreadId, nextMessages)
          : get().threadsByScope;
      set({ messages: nextMessages, threadsByScope });
      return true;
    } catch {
      return false;
    }
  },

  resolveAsk: (selected, freeText) => {
    const pending = get().pendingAsk;
    if (!pending) return;
    pending.resolve({ selected_option_ids: selected, free_text: freeText });
    const { chatScope, activeThreadId, messages } = get();
    const nextMessages = messages.map((line) =>
      line.kind === "ask" && line.requestId === pending.requestId
        ? { ...line, answered: true }
        : line,
    );
    const threadsByScope =
      chatScope && activeThreadId
        ? commitThreadMessages(get, chatScope, activeThreadId, nextMessages)
        : get().threadsByScope;
    set({
      pendingAsk: null,
      messages: nextMessages,
      threadsByScope,
    });
  },

  resolveApproval: (approved, confirmText, rememberRead, approveForSession, approvePermanently) => {
    const pending = get().pendingApproval;
    if (!pending) return;
    pending.resolve({
      approved,
      confirm_text: confirmText,
      remember_read_binaries:
        approved && rememberRead ? pending.rememberableBinaries : [],
      approve_for_session: approved && Boolean(approveForSession),
      approve_permanently: approved && Boolean(approvePermanently),
    });
    const { chatScope, activeThreadId, messages } = get();
    const approvalLine = messages.find(
      (line): line is Extract<ChatLine, { kind: "approval" }> =>
        line.kind === "approval" && line.approvalId === pending.approvalId,
    );
    let nextMessages = messages.map((line) =>
      line.kind === "approval" && line.approvalId === pending.approvalId
        ? { ...line, decision: approved ? ("approved" as const) : ("rejected" as const) }
        : line,
    );
    // Close the approve→tool_call gap: show a running card immediately.
    if (approved && approvalLine) {
      const optimistic = buildOptimisticToolAfterApproval({
        callId: approvalLine.callId,
        command: approvalLine.command,
        execCommand: approvalLine.execCommand,
        intent: approvalLine.intent,
      });
      if (
        optimistic &&
        !nextMessages.some(
          (line) => line.kind === "tool" && line.callId === optimistic.callId,
        )
      ) {
        nextMessages = [
          ...nextMessages,
          { id: nextId(), ...optimistic },
        ];
      }
    }
    const threadsByScope =
      chatScope && activeThreadId
        ? commitThreadMessages(get, chatScope, activeThreadId, nextMessages)
        : get().threadsByScope;
    set({
      pendingApproval: null,
      messages: nextMessages,
      threadsByScope,
    });
  },

  sendMessage: async ({ sessionId, serverId, clusterId, interruptIfBusy }) => {
    const mode = get().engineerMode;
    const effectiveClusterId =
      clusterId ?? (mode === "k8s" ? get().clusterId : null);
    if (effectiveClusterId) {
      // Refresh cluster_target from workbench without a static import cycle.
      const { useK8sStore } = await import("./k8sStore");
      const ks = useK8sStore.getState();
      const target =
        ks.clusters.find((c) => c.id === effectiveClusterId) ??
        (ks.selectedCluster?.id === effectiveClusterId
          ? ks.selectedCluster
          : null) ??
        get().clusterTarget;
      get().bindK8sContext(
        effectiveClusterId,
        target?.display_name ?? get().clusterName ?? effectiveClusterId,
        target,
      );
    } else {
      get().bindContext(sessionId, serverId);
    }
    const text = get().input.trim();
    const pendingAtts = [...get().pendingAttachments];
    if (!text && pendingAtts.length === 0) return;
    if (!isAiModelConfigured(get().settings)) {
      set({ settingsOpen: true });
      return;
    }
    if (get().busy) {
      if (!interruptIfBusy) return;
      get().stopActiveRun();
      await new Promise((r) => setTimeout(r, 40));
    }
    if (get().busy) return;

    const runSessionId = effectiveClusterId
      ? k8sSyntheticSessionId(effectiveClusterId)
      : sessionId;
    const runScope = effectiveClusterId
      ? aiChatScopeKey(runSessionId, null, effectiveClusterId)
      : aiChatScopeKey(sessionId, serverId);
    let runThreadId = get().activeThreadId;
    if (!runThreadId || get().chatScope !== runScope) {
      if (effectiveClusterId) {
        get().bindK8sContext(
          effectiveClusterId,
          get().clusterName ?? effectiveClusterId,
        );
      } else {
        get().bindContext(sessionId, serverId);
      }
      runThreadId = get().activeThreadId;
    }
    if (!runThreadId) {
      runThreadId = get().createThread() || null;
    }
    if (!runThreadId) return;

    const priorHistory = get()
      .messages.filter(
        (m): m is Extract<ChatLine, { kind: "user" | "assistant" }> =>
          m.kind === "user" || m.kind === "assistant",
      )
      .slice(-16)
      .map((m) => ({
        role: m.kind as "user" | "assistant",
        content: m.content.slice(0, 4000),
      }));
    const resumeRunId =
      get()
        .threadsByScope[runScope]?.threads.find((t) => t.id === runThreadId)
        ?.lastRunId ?? null;
    const threadMeta = get()
      .threadsByScope[runScope]?.threads.find((t) => t.id === runThreadId);
    const interactionMode = normalizeInteractionMode(threadMeta?.interactionMode);
    const userLine: ChatLine | null = text
      ? { id: nextId(), kind: "user", content: text }
      : null;
    const attachmentLines: ChatLine[] = pendingAtts.map((a) => {
      if (a.kind === "local_image") {
        return {
          id: nextId(),
          kind: "attachment" as const,
          attachmentKind: "local_image" as const,
          label: a.name,
          mediaUrl: `data:${a.media_type};base64,${a.data_base64}`,
        };
      }
      const text = a.text;
      return {
        id: nextId(),
        kind: "attachment" as const,
        attachmentKind: a.kind,
        label:
          a.kind === "console"
            ? a.label || "console"
            : a.kind === "remote_file"
              ? a.path
              : a.name,
        preview: text.slice(0, 120),
        body: text,
      };
    });
    const nextMessages = [
      ...get().messages,
      ...attachmentLines,
      ...(userLine ? [userLine] : []),
    ];
    const threadsByScope = commitThreadMessages(
      get,
      runScope,
      runThreadId,
      nextMessages,
      { bumpTitle: true },
    );
    set({
      input: "",
      busy: true,
      modelPhase: "idle",
      sessionId: runSessionId,
      serverId: effectiveClusterId ? null : (serverId ?? get().serverId),
      clusterId: effectiveClusterId ?? null,
      chatScope: runScope,
      activeThreadId: runThreadId,
      messages: nextMessages,
      threadsByScope,
      inputsByThread: { ...get().inputsByThread, [runThreadId]: "" },
      activeInvestigation: null,
      pendingAttachments: [],
      runTraceSpans: [],
    });

    const sameRunTarget = () => {
      const cur = get();
      return (
        cur.chatScope === runScope &&
        cur.activeThreadId === runThreadId &&
        activeRunScope === runScope &&
        activeRunThreadId === runThreadId
      );
    };

    const appendIfSameThread = (line: ChatLine) => {
      const cur = get();
      if (cur.chatScope !== runScope || cur.activeThreadId !== runThreadId) return;
      const messages = [...cur.messages, line];
      const threadsByScope = commitThreadMessages(
        get,
        runScope,
        runThreadId!,
        messages,
      );
      set({ messages, threadsByScope });
    };

    const replaceMessagesIfSameThread = (messages: ChatLine[]) => {
      const cur = get();
      if (cur.chatScope !== runScope || cur.activeThreadId !== runThreadId) return;
      const threadsByScope = commitThreadMessages(
        get,
        runScope,
        runThreadId!,
        messages,
      );
      set({ messages, threadsByScope });
    };

    const patchToolLineByCallId = (
      callId: string,
      patch: Partial<Extract<ChatLine, { kind: "tool" }>>,
    ) => {
      const cur = get();
      if (cur.chatScope !== runScope || cur.activeThreadId !== runThreadId) return;
      const idx = cur.messages.findIndex(
        (line) => line.kind === "tool" && line.callId === callId,
      );
      if (idx < 0) return;
      const prev = cur.messages[idx];
      if (prev.kind !== "tool") return;
      const messages = [...cur.messages];
      messages[idx] = { ...prev, ...patch };
      replaceMessagesIfSameThread(messages);
    };

    const appendToolOutputByCallId = (callId: string, chunk: string) => {
      if (!chunk) return;
      const cur = get();
      if (cur.chatScope !== runScope || cur.activeThreadId !== runThreadId) return;
      const idx = cur.messages.findIndex(
        (line) => line.kind === "tool" && line.callId === callId,
      );
      if (idx < 0) return;
      const prev = cur.messages[idx];
      if (prev.kind !== "tool") return;
      const messages = [...cur.messages];
      messages[idx] = {
        ...prev,
        output: appendToolOutputText(prev.output, chunk),
        lastOutputAt: Date.now(),
      };
      replaceMessagesIfSameThread(messages);
    };

    const persistThreadLastRunId = (rid: string) => {
      const state = get();
      const bundle = state.threadsByScope[runScope];
      if (!bundle) return;
      const threads = bundle.threads.map((t) =>
        t.id === runThreadId ? { ...t, lastRunId: rid, updatedAt: Date.now() } : t,
      );
      const next = {
        ...state.threadsByScope,
        [runScope]: { ...bundle, threads },
      };
      savePersistedThreads(next, runScope);
      set({ threadsByScope: next });
    };

    try {
      const sidecar = await ensureSidecar();
      set({ sidecar, ready: true });
      chatAbort?.abort();
      const abort = new AbortController();
      chatAbort = abort;
      activeRunId = null;
      activeRunScope = runScope;
      activeRunThreadId = runThreadId;

      const sshTab = useSessionStore
        .getState()
        .tabs.find((t) => t.id === runSessionId);
      const resolvedServerId = effectiveClusterId
        ? undefined
        : (serverId ?? get().serverId ?? sshTab?.server_id ?? undefined);
      const hostFingerprint = sshTab?.host_fingerprint ?? null;
      const remoteUser = remoteUserFromServerId(resolvedServerId ?? null);

      const { runId } = await runAgentChat({
        sidecar,
        sessionId: runSessionId,
        message: text,
        engineerMode: effectiveClusterId ? "k8s" : "linux",
        clusterId: effectiveClusterId ?? undefined,
        clusterName: get().clusterName ?? undefined,
        clusterTarget: get().clusterTarget ?? undefined,
        securityMode: normalizeSecurityMode(
          get()
            .threadsByScope[runScope]?.threads.find((t) => t.id === runThreadId)
            ?.securityMode,
        ),
        interactionMode,
        serverId: resolvedServerId,
        hostFingerprint,
        remoteUser,
        history: priorHistory,
        resumeRunId,
        attachments: toWireAttachments(pendingAtts),
        signal: abort.signal,
        onAskUser: (ev) =>
          new Promise((resolve) => {
            if (
              get().chatScope !== runScope ||
              get().activeThreadId !== runThreadId
            ) {
              resolve({ selected_option_ids: [], free_text: "context_switched" });
              return;
            }
            set({
              pendingAsk: { requestId: ev.request_id, resolve },
            });
            revealAiEngineerPanel();
            appendIfSameThread({
              id: nextId(),
              kind: "ask",
              requestId: ev.request_id,
              question: ev.question,
              options: ev.options,
            });
          }),
        onApproval: (ev) =>
          new Promise((resolve) => {
            if (
              get().chatScope !== runScope ||
              get().activeThreadId !== runThreadId
            ) {
              resolve({ approved: false });
              return;
            }
            set({
              pendingApproval: {
                approvalId: ev.approval_id,
                dualConfirm: Boolean(ev.dual_confirm),
                confirmPhrase: ev.confirm_phrase || ev.command,
                rememberableBinaries: ev.rememberable_binaries ?? [],
                resolve,
              },
            });
            revealAiEngineerPanel();
            appendIfSameThread({
              id: nextId(),
              kind: "approval",
              approvalId: ev.approval_id,
              callId: ev.call_id,
              command: ev.command,
              risk: ev.risk,
              reason: ev.reason,
              intent: ev.intent,
              impactPreview: ev.impact_preview,
              rememberableBinaries: ev.rememberable_binaries,
              networkGuard: ev.network_guard,
              dualConfirm: Boolean(ev.dual_confirm),
              confirmPhrase: ev.confirm_phrase || ev.command,
              execCommand: ev.exec_command,
            });
          }),
        onToolExec: {
          onOutput: ({ callId, chunk }) => appendToolOutputByCallId(callId, chunk),
          onStart: ({ callId, command, intent }) => {
            patchToolLineByCallId(callId, {
              detail: command,
              intent,
              status: "running",
              startedAt: Date.now(),
            });
          },
          onDone: ({ callId, ok, exitCode, error, stdout, stderr }) => {
            const cur = get();
            const existing = cur.messages.find(
              (line): line is Extract<ChatLine, { kind: "tool" }> =>
                line.kind === "tool" && line.callId === callId,
            );
            // Already finished (user stop / prior patch) — don't resurrect as running.
            if (
              existing &&
              existing.status &&
              existing.status !== "running"
            ) {
              return;
            }
            const fallbackOut = [stdout, stderr].filter(Boolean).join("");
            let output = existing?.output;
            if (!output?.trim() && fallbackOut.trim()) {
              output = appendToolOutputText(undefined, fallbackOut);
            } else if (error && !ok) {
              output = appendToolOutputText(output, `\n${error}`);
            }
            patchToolLineByCallId(callId, {
              status: ok ? "done" : "failed",
              ok,
              exitCode: exitCode ?? undefined,
              finishedAt: Date.now(),
              ...(output !== existing?.output ? { output } : {}),
            });
            // Gap before next assistant tokens — show existing 思考中 line.
            if (sameRunTarget()) set({ modelPhase: "thinking" });
          },
        },
        onEvent: (event: AgentUiEvent) => {
          if (
            get().chatScope !== runScope ||
            get().activeThreadId !== runThreadId ||
            activeRunScope !== runScope ||
            activeRunThreadId !== runThreadId
          ) {
            return;
          }
          if (event.type === "tool_timeout") {
            patchToolLineByCallId(event.call_id, {
              status: "failed",
              ok: false,
              finishedAt: Date.now(),
              output: appendToolOutputText(
                get().messages.find(
                  (l): l is Extract<ChatLine, { kind: "tool" }> =>
                    l.kind === "tool" && l.callId === event.call_id,
                )?.output,
                `\n[TOOL_TIMEOUT] ${event.error ?? "wait ended"}; host may still be running`,
              ),
            });
            set({ modelPhase: "thinking" });
            return;
          }
          if (event.type === "tool_result") {
            const ok = event.payload.ok !== false;
            patchToolLineByCallId(event.call_id, {
              status: ok ? "done" : "failed",
              ok,
              finishedAt: Date.now(),
              output: JSON.stringify(event.payload),
            });
            set({ modelPhase: "thinking" });
            return;
          }
          if (event.type === "status") {
            if (event.run_id) {
              activeRunId = event.run_id;
              persistThreadLastRunId(event.run_id);
            }
            if (event.phase === "thinking" || event.status === "thinking") {
              set({ modelPhase: "thinking" });
            }
            return;
          }
          if (event.type === "session_resumed") {
            appendIfSameThread({
              id: nextId(),
              kind: "notice",
              variant: "resumed",
              content: "session_resumed",
            });
            return;
          }
          if (event.type === "compaction") {
            appendIfSameThread({
              id: nextId(),
              kind: "notice",
              variant: "compaction",
              content: "compaction",
            });
            return;
          }
          if (event.type === "memory_context") {
            appendIfSameThread({
              id: nextId(),
              kind: "notice",
              variant: "info",
              content: "memory_context",
            });
            return;
          }
          if (
            event.type === "evidence_nudge" ||
            event.type === "act_nudge" ||
            event.type === "verify_nudge" ||
            event.type === "audit_nudge"
          ) {
            if (event.type === "audit_nudge") {
              // Defense in depth: always clear ungated prose for this turn.
              replaceMessagesIfSameThread(
                retractProvisionalAssistant(get().messages),
              );
            }
            appendIfSameThread({
              id: nextId(),
              kind: "notice",
              variant: "harness",
              content: harnessNudgeContentCode(
                event.type,
                event.type === "evidence_nudge"
                  ? { blocked: event.blocked }
                  : event.type === "act_nudge"
                    ? { kind: event.kind }
                    : event.type === "audit_nudge"
                      ? { reason: event.reason }
                      : { risk: event.risk },
              ),
            });
            return;
          }
          if (event.type === "assistant_retract") {
            replaceMessagesIfSameThread(
              retractProvisionalAssistant(get().messages),
            );
            set({ modelPhase: "thinking" });
            return;
          }
          if (event.type === "trace_span") {
            const span = event.span;
            if (!span?.id) return;
            const prev = get().runTraceSpans;
            const idx = prev.findIndex((s) => s.id === span.id);
            const next =
              idx >= 0
                ? prev.map((s, i) => (i === idx ? { ...s, ...span } : s))
                : [...prev, span];
            set({ runTraceSpans: next });
            return;
          }
          if (event.type === "completed") {
            const content = event.content ?? "";
            if (content.trim()) {
              const msgs = get().messages;
              for (let i = msgs.length - 1; i >= 0; i -= 1) {
                const line = msgs[i];
                if (line.kind === "assistant") {
                  if (line.content === content) break;
                  if (line.streaming) {
                    replaceMessagesIfSameThread([
                      ...msgs.slice(0, i),
                      { id: line.id, kind: "assistant", content },
                      ...msgs.slice(i + 1),
                    ]);
                    break;
                  }
                  appendIfSameThread({ id: nextId(), kind: "assistant", content });
                  break;
                }
              }
            }
            replaceMessagesIfSameThread(withToolEvidenceFlags(get().messages));
            const { sidecar, sessionId } = get();
            const rid = activeRunId;
            if (sidecar && sessionId && rid) {
              void fetchRunTrace(sidecar, sessionId, rid)
                .then((data) => {
                  if (sameRunTarget()) {
                    set({ runTraceSpans: data.spans ?? [] });
                  }
                })
                .catch(() => undefined);
            }
            return;
          } else if (event.type === "assistant_delta") {
            const text = event.text ?? "";
            if (!text) return;
            const msgs = get().messages;
            const last = msgs[msgs.length - 1];
            if (last?.kind === "assistant" && last.streaming) {
              replaceMessagesIfSameThread([
                ...msgs.slice(0, -1),
                { ...last, content: last.content + text },
              ]);
            } else if (
              last?.kind === "assistant" &&
              looksTruncatedAssistant(last.content)
            ) {
              // Resume into the cut-off bubble instead of starting a second one.
              // Never glue a restarted "## …" heading onto the truncated tail.
              replaceMessagesIfSameThread([
                ...msgs.slice(0, -1),
                {
                  ...last,
                  content: mergeAssistantContinuation(last.content, text),
                  streaming: true,
                },
              ]);
            } else {
              appendIfSameThread({
                id: nextId(),
                kind: "assistant",
                content: text,
                streaming: true,
              });
            }
            set({ modelPhase: "streaming" });
          } else if (event.type === "assistant_message") {
            const content = event.content ?? "";
            if (!content.trim()) return;
            const msgs = get().messages;
            // Replace the latest assistant in this turn (streaming or not) so
            // harness-cleaned text never appends beside the ungated stream.
            let lastAssistant = -1;
            for (let i = msgs.length - 1; i >= 0; i -= 1) {
              if (msgs[i].kind === "user") break;
              if (msgs[i].kind === "assistant") {
                lastAssistant = i;
                break;
              }
            }
            if (lastAssistant >= 0) {
              const prev = msgs[lastAssistant];
              const merged =
                prev.kind === "assistant"
                  ? mergeAssistantContinuation(prev.content, content)
                  : stripTrailingDanglingHeading(content) || content;
              replaceMessagesIfSameThread([
                ...msgs.slice(0, lastAssistant),
                {
                  id: prev.id,
                  kind: "assistant",
                  content: stripTrailingDanglingHeading(merged) || merged,
                },
                ...msgs.slice(lastAssistant + 1),
              ]);
            } else {
              appendIfSameThread({
                id: nextId(),
                kind: "assistant",
                content: stripTrailingDanglingHeading(content) || content,
              });
            }
          } else if (event.type === "tool_call") {
            const detail = String(
              (event.arguments.command as string) ||
                (event.arguments.query as string) ||
                (event.arguments.url as string) ||
                (event.arguments.question as string) ||
                (event.arguments.category as string) ||
                (event.arguments.kind && event.arguments.name
                  ? `${event.arguments.kind}/${event.arguments.namespace ?? ""}/${event.arguments.name}`
                  : "") ||
                (event.arguments.pod as string) ||
                (event.arguments.name as string) ||
                "",
            );
            const intent =
              typeof event.arguments.intent === "string" && event.arguments.intent.trim()
                ? event.arguments.intent.trim()
                : undefined;
            const isExec =
              event.name === "terminal_exec" ||
              event.name === "ai_exec" ||
              event.name.startsWith("k8s_");
            const msgs = get().messages;
            const last = msgs[msgs.length - 1];
            if (last?.kind === "assistant" && last.streaming) {
              replaceMessagesIfSameThread([
                ...msgs.slice(0, -1),
                { id: last.id, kind: "assistant", content: last.content },
              ]);
            }
            set({ modelPhase: "thinking" });
            const callId = event.call_id || undefined;
            const status = event.denied
              ? "denied"
              : isExec && event.awaiting_host
                ? "running"
                : undefined;
            if (callId) {
              const existing = get().messages.find(
                (line): line is Extract<ChatLine, { kind: "tool" }> =>
                  line.kind === "tool" && line.callId === callId,
              );
              if (existing) {
                patchToolLineByCallId(callId, {
                  name: event.name,
                  intent: intent ?? existing.intent,
                  detail: event.denied
                    ? detail
                      ? `${detail} — denied by policy`
                      : "Denied by policy"
                    : detail || existing.detail,
                  status: status ?? existing.status,
                  startedAt:
                    existing.startedAt ??
                    (isExec && event.awaiting_host ? Date.now() : undefined),
                  ok: event.denied ? false : existing.ok,
                });
                return;
              }
            }
            appendIfSameThread({
              id: nextId(),
              kind: "tool",
              name: event.name,
              callId,
              intent,
              detail: event.denied
                ? detail
                  ? `${detail} — denied by policy`
                  : "Denied by policy"
                : detail,
              status,
              startedAt: isExec && event.awaiting_host ? Date.now() : undefined,
              ok: event.denied ? false : undefined,
            });
          } else if (event.type === "plan_progress") {
            set({ activePlan: event.plan.length > 0 ? event.plan : null });
          } else if (event.type === "investigator_start") {
            set({
              activeInvestigation: {
                childRunId: event.child_run_id,
                question: event.question,
                focus: event.focus,
                status: "running",
              },
            });
          } else if (event.type === "investigator_end") {
            const prev = get().activeInvestigation;
            set({
              activeInvestigation: {
                childRunId: event.child_run_id || prev?.childRunId || "",
                question: prev?.question || "",
                focus: prev?.focus,
                status: event.ok ? "done" : "failed",
                summaryPreview:
                  event.summary_preview || event.error || prev?.summaryPreview,
              },
            });
          } else if (event.type === "error") {
            replaceMessagesIfSameThread(
              retractProvisionalAssistant(get().messages),
            );
            appendIfSameThread({
              id: nextId(),
              kind: "error",
              content: event.message,
            });
            replaceMessagesIfSameThread(withToolEvidenceFlags(get().messages));
          } else if (event.type === "cancelled") {
            replaceMessagesIfSameThread(
              markRunningToolsStopped(get().messages),
            );
            appendIfSameThread({
              id: nextId(),
              kind: "error",
              content: "Stopped",
            });
          }
        },
      });
      if (sameRunTarget()) {
        activeRunId = runId;
        persistThreadLastRunId(runId);
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        useToastStore.getState().pushToast(formatAppError(err), false);
        appendIfSameThread({
          id: nextId(),
          kind: "error",
          content: formatAppError(err),
        });
      }
    } finally {
      if (activeRunScope === runScope && activeRunThreadId === runThreadId) {
        chatAbort = null;
        activeRunId = null;
        activeRunScope = null;
        activeRunThreadId = null;
        if (
          get().chatScope === runScope &&
          get().activeThreadId === runThreadId
        ) {
          const msgs = get().messages;
          let changed = false;
          const next = msgs.map((line) => {
            if (line.kind === "assistant" && line.streaming) {
              changed = true;
              return { id: line.id, kind: "assistant" as const, content: line.content };
            }
            return line;
          });
          const finalized = markRunningToolsStopped(next);
          if (finalized !== next) changed = true;
          if (changed) {
            const threadsByScope = commitThreadMessages(
              get,
              runScope,
              runThreadId!,
              finalized,
            );
            set({
              busy: false,
              modelPhase: "idle",
              pendingAsk: null,
              pendingApproval: null,
              messages: finalized,
              threadsByScope,
            });
          } else {
            set({
              busy: false,
              modelPhase: "idle",
              pendingAsk: null,
              pendingApproval: null,
            });
          }
        }
      }
    }
  },
}));

subscribeWorkspacePanelWidth((width) => {
  if (useAiEngineerStore.getState().width !== width) {
    useAiEngineerStore.setState({ width });
  }
});
