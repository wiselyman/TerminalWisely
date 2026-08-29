import { create } from "zustand";
import {
  ensureSidecar,
  getAiSettings,
  saveAiSettings,
  type AiSettingsUpdate,
  type AiSettingsView,
  type SidecarInfo,
} from "../lib/aiEngineer/api";
import {
  cancelAgentRun,
  flushUserContext,
  runAgentChat,
  type AgentUiEvent,
} from "../lib/aiEngineer/chatClient";
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
  | { id: string; kind: "assistant"; content: string; streaming?: boolean }
  | {
      id: string;
      kind: "tool";
      name: string;
      callId?: string;
      intent?: string;
      detail?: string;
      status?: "running" | "done" | "failed" | "denied";
      output?: string;
      startedAt?: number;
      finishedAt?: number;
      exitCode?: number;
      ok?: boolean;
    }
  | { id: string; kind: "error"; content: string }
  | {
      id: string;
      kind: "notice";
      variant: "compaction" | "resumed" | "info";
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

const CHAT_HISTORY_KEY_V1 = "tw.aiEngineer.chatByScope.v1";
const CHAT_HISTORY_KEY_V2 = "tw.aiEngineer.chatByScope.v2";
const MAX_LINES_PER_THREAD = 200;
const MAX_THREADS_PER_SCOPE = 20;
const MAX_TOOL_OUTPUT_CHARS = 32 * 1024;
const DEFAULT_THREAD_TITLE = "New chat";

function appendToolOutputText(prev: string | undefined, chunk: string): string {
  let next = (prev ?? "") + chunk;
  if (next.length > MAX_TOOL_OUTPUT_CHARS) {
    next = `…\n${next.slice(-MAX_TOOL_OUTPUT_CHARS)}`;
  }
  return next;
}

function slimToolLineForPersist(line: Extract<ChatLine, { kind: "tool" }>): ChatLine {
  const status = line.status === "running" ? "done" : line.status;
  return {
    ...line,
    status,
    output: line.output?.slice(-4000),
    finishedAt: line.finishedAt ?? (status ? Date.now() : undefined),
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
        return { id: line.id, kind: "assistant" as const, content: line.content };
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
          // Drop mediaUrl — base64 images would blow localStorage.
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
  const o = raw as { activeThreadId?: unknown; threads?: unknown };
  if (!Array.isArray(o.threads) || typeof o.activeThreadId !== "string") return null;
  const threads: ChatThread[] = [];
  for (const item of o.threads) {
    if (!item || typeof item !== "object") continue;
    const t = item as Record<string, unknown>;
    if (typeof t.id !== "string") continue;
    const messages = Array.isArray(t.messages)
      ? ensureUniqueMessageIds(
          t.messages.filter(isPersistableChatLine).slice(-MAX_LINES_PER_THREAD),
        )
      : [];
    threads.push({
      id: t.id,
      title:
        typeof t.title === "string" && t.title.trim()
          ? t.title
          : titleFromMessages(messages),
      createdAt: typeof t.createdAt === "number" ? t.createdAt : Date.now(),
      updatedAt: typeof t.updatedAt === "number" ? t.updatedAt : Date.now(),
      securityMode: normalizeSecurityMode(t.securityMode),
      interactionMode: normalizeInteractionMode(t.interactionMode),
      messages,
      lastRunId: typeof t.lastRunId === "string" ? t.lastRunId : null,
    });
  }
  if (threads.length === 0) return null;
  const active =
    threads.find((t) => t.id === o.activeThreadId)?.id ?? threads[0].id;
  return { activeThreadId: active, threads };
}

function loadPersistedThreads(): Record<string, ScopeThreadBundle> {
  try {
    const rawV2 = localStorage.getItem(CHAT_HISTORY_KEY_V2);
    if (rawV2) {
      const parsed = JSON.parse(rawV2) as unknown;
      if (parsed && typeof parsed === "object") {
        const out: Record<string, ScopeThreadBundle> = {};
        for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
          const bundle = parseV2Bundle(v);
          if (bundle) out[k] = bundle;
        }
        return out;
      }
    }
    const rawV1 = localStorage.getItem(CHAT_HISTORY_KEY_V1);
    if (!rawV1) return {};
    const parsed = JSON.parse(rawV1) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, ScopeThreadBundle> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      const messages = ensureUniqueMessageIds(
        v.filter(isPersistableChatLine).slice(-MAX_LINES_PER_THREAD),
      );
      const thread = makeEmptyThread(titleFromMessages(messages, "Chat 1"));
      thread.messages = messages;
      out[k] = makeBundle(thread);
    }
    if (Object.keys(out).length > 0) {
      savePersistedThreads(out);
    }
    return out;
  } catch {
    return {};
  }
}

function savePersistedThreads(byScope: Record<string, ScopeThreadBundle>) {
  try {
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
    localStorage.setItem(CHAT_HISTORY_KEY_V2, JSON.stringify(slim));
  } catch {
    /* quota / private mode */
  }
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
  savePersistedThreads(next);
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
  if (!bundle || bundle.threads.length === 0) {
    const thread = makeEmptyThread();
    bundle = makeBundle(thread);
    nextMap = { ...nextMap, [scope]: bundle };
    savePersistedThreads(nextMap);
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
    savePersistedThreads(nextMap);
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
  threadsByScope: loadPersistedThreads(),
  inputsByThread: {},
  pendingAsk: null,
  pendingApproval: null,
  activePlan: null,
  activeInvestigation: null,
  pendingAttachments: [],
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
    savePersistedThreads(nextByScope);
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
    savePersistedThreads(nextByScope);
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
    savePersistedThreads(threadsByScope);
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

    const persisted = persistCurrentThread(get);
    const bundle = persisted.threadsByScope[chatScope];
    const target = bundle?.threads.find((t) => t.id === threadId);
    if (!target || !bundle) return;

    const uniqueMessages = ensureUniqueMessageIds(target.messages);
    const threadsByScope = {
      ...persisted.threadsByScope,
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
    savePersistedThreads(threadsByScope);
    set({
      ...persisted,
      threadsByScope,
      activeThreadId: threadId,
      messages: uniqueMessages,
      input: persisted.inputsByThread[threadId] ?? "",
      busy: false,
      modelPhase: "idle",
      pendingAsk: null,
      pendingApproval: null,
      activeInvestigation: null,
    });
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
    savePersistedThreads(threadsByScope);
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
    let nextMessages = messages;
    if (pendingApproval || pendingAsk) {
      nextMessages = messages.map((line) => {
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
    }
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
    const nextMessages = messages.map((line) =>
      line.kind === "approval" && line.approvalId === pending.approvalId
        ? { ...line, decision: approved ? ("approved" as const) : ("rejected" as const) }
        : line,
    );
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
      savePersistedThreads(next);
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
        serverId: effectiveClusterId
          ? undefined
          : (serverId ?? get().serverId ?? undefined),
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
            const fallbackOut = [stdout, stderr].filter(Boolean).join("");
            let output = existing?.output;
            if (!output?.trim() && fallbackOut.trim()) {
              output = appendToolOutputText(undefined, fallbackOut);
            } else if (error && !ok) {
              output = appendToolOutputText(output, error);
            }
            patchToolLineByCallId(callId, {
              status: ok ? "done" : "failed",
              ok,
              exitCode: exitCode ?? undefined,
              finishedAt: Date.now(),
              ...(output !== existing?.output ? { output } : {}),
            });
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
          if (event.type === "assistant_delta") {
            const text = event.text ?? "";
            if (!text) return;
            const msgs = get().messages;
            const last = msgs[msgs.length - 1];
            if (last?.kind === "assistant" && last.streaming) {
              replaceMessagesIfSameThread([
                ...msgs.slice(0, -1),
                { ...last, content: last.content + text },
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
            const last = msgs[msgs.length - 1];
            if (last?.kind === "assistant" && last.streaming) {
              replaceMessagesIfSameThread([
                ...msgs.slice(0, -1),
                { id: last.id, kind: "assistant", content },
              ]);
            } else if (last?.kind === "assistant" && last.content === content) {
              // already shown
            } else {
              appendIfSameThread({ id: nextId(), kind: "assistant", content });
            }
          } else if (event.type === "completed") {
            const content = event.content ?? "";
            if (!content.trim()) return;
            const msgs = get().messages;
            for (let i = msgs.length - 1; i >= 0; i -= 1) {
              const line = msgs[i];
              if (line.kind === "assistant") {
                if (line.content === content) return;
                if (line.streaming) {
                  replaceMessagesIfSameThread([
                    ...msgs.slice(0, i),
                    { id: line.id, kind: "assistant", content },
                    ...msgs.slice(i + 1),
                  ]);
                  return;
                }
                break;
              }
            }
            appendIfSameThread({ id: nextId(), kind: "assistant", content });
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
            appendIfSameThread({
              id: nextId(),
              kind: "tool",
              name: event.name,
              callId: event.call_id || undefined,
              intent,
              detail,
              status: event.denied
                ? "denied"
                : isExec && event.awaiting_host
                  ? "running"
                  : undefined,
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
            appendIfSameThread({
              id: nextId(),
              kind: "error",
              content: event.message,
            });
          } else if (event.type === "cancelled") {
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
          if (changed) {
            const threadsByScope = commitThreadMessages(
              get,
              runScope,
              runThreadId!,
              next,
            );
            set({
              busy: false,
              modelPhase: "idle",
              pendingAsk: null,
              pendingApproval: null,
              messages: next,
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
