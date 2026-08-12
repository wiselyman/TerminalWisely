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
  runAgentChat,
  type AgentUiEvent,
} from "../lib/aiEngineer/chatClient";
import { formatAppError } from "../lib/formatAppError";
import {
  readWorkspacePanelWidth,
  setWorkspacePanelWidth,
  subscribeWorkspacePanelWidth,
} from "../lib/workspacePanelWidth";
import { useToastStore } from "./toastStore";
import { revealAiEngineerPanel } from "./workspacePanelSwitch";

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

const CHAT_HISTORY_KEY = "tw.aiEngineer.chatByScope.v1";
const MAX_LINES_PER_SCOPE = 200;
const MAX_TOOL_OUTPUT_CHARS = 32 * 1024;

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

function loadPersistedChats(): Record<string, ChatLine[]> {
  try {
    const raw = localStorage.getItem(CHAT_HISTORY_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, ChatLine[]> = {};
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (!Array.isArray(v)) continue;
      out[k] = v.filter(isPersistableChatLine).slice(-MAX_LINES_PER_SCOPE);
    }
    return out;
  } catch {
    return {};
  }
}

function isPersistableChatLine(v: unknown): v is ChatLine {
  if (!v || typeof v !== "object") return false;
  const kind = (v as { kind?: unknown }).kind;
  return (
    kind === "user" ||
    kind === "assistant" ||
    kind === "tool" ||
    kind === "error"
  );
}

function savePersistedChats(byScope: Record<string, ChatLine[]>) {
  try {
    const slim: Record<string, ChatLine[]> = {};
    for (const [k, lines] of Object.entries(byScope)) {
      slim[k] = lines
        .filter(isPersistableChatLine)
        .map((line) => {
          if (line.kind === "assistant") {
            return { id: line.id, kind: "assistant" as const, content: line.content };
          }
          if (line.kind === "tool") {
            return slimToolLineForPersist(line);
          }
          return line;
        })
        .slice(-MAX_LINES_PER_SCOPE);
    }
    localStorage.setItem(CHAT_HISTORY_KEY, JSON.stringify(slim));
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
  }) => void;
};

/** Isolate chat UI by host; fall back to terminal session when no server id. */
export function aiChatScopeKey(
  sessionId: string,
  serverId?: string | null,
): string {
  const sid = (serverId ?? "").trim();
  return sid ? `server:${sid}` : `session:${sessionId}`;
}

let chatAbort: AbortController | null = null;
let activeRunId: string | null = null;
/** Scope that owns the in-flight run; events for other scopes are ignored. */
let activeRunScope: string | null = null;
let lineSeq = 0;
const nextId = () => `m${++lineSeq}`;

type AiEngineerState = {
  open: boolean;
  width: number;
  sessionId: string | null;
  serverId: string | null;
  /** Current chat bucket key (server:* or session:*). */
  chatScope: string | null;
  ready: boolean;
  starting: boolean;
  /** First-launch bootstrap phase from Rust (`ai-sidecar-bootstrap`). */
  bootstrapStatus: string | null;
  busy: boolean;
  /** Model-side phase while busy: thinking (CoT suppressed) or streaming answer. */
  modelPhase: "idle" | "thinking" | "streaming";
  error: string | null;
  sidecar: SidecarInfo | null;
  settings: AiSettingsView | null;
  settingsOpen: boolean;
  input: string;
  messages: ChatLine[];
  /** Persisted chats keyed by aiChatScopeKey. */
  messagesByScope: Record<string, ChatLine[]>;
  inputsByScope: Record<string, string>;
  pendingAsk: PendingAsk | null;
  pendingApproval: PendingApproval | null;
  openPanel: (sessionId: string, serverId?: string) => void;
  /** Re-bind chat when the active terminal/server changes while panel stays open. */
  bindContext: (sessionId: string, serverId?: string) => void;
  close: () => void;
  setWidth: (w: number) => void;
  setInput: (v: string) => void;
  setSettingsOpen: (v: boolean) => void;
  ensureReady: () => Promise<void>;
  refreshSettings: () => Promise<void>;
  saveSettings: (update: AiSettingsUpdate) => Promise<void>;
  sendMessage: (opts: {
    sessionId: string;
    serverId?: string;
    /** Stop the in-flight run first, then send (interject). */
    interruptIfBusy?: boolean;
  }) => Promise<void>;
  stopActiveRun: () => void;
  resolveAsk: (selected: string[], freeText?: string) => void;
  resolveApproval: (approved: boolean, confirmText?: string, rememberRead?: boolean) => void;
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
}

function persistCurrentScope(
  get: () => AiEngineerState,
): Pick<AiEngineerState, "messagesByScope" | "inputsByScope"> {
  const { chatScope, messages, input, messagesByScope, inputsByScope } = get();
  if (!chatScope) {
    return { messagesByScope, inputsByScope };
  }
  const nextByScope = { ...messagesByScope, [chatScope]: messages };
  savePersistedChats(nextByScope);
  return {
    messagesByScope: nextByScope,
    inputsByScope: { ...inputsByScope, [chatScope]: input },
  };
}

export const useAiEngineerStore = create<AiEngineerState>((set, get) => ({
  open: false,
  width: readWorkspacePanelWidth(),
  sessionId: null,
  serverId: null,
  chatScope: null,
  ready: false,
  starting: false,
  bootstrapStatus: null,
  busy: false,
  modelPhase: "idle",
  error: null,
  sidecar: null,
  settings: null,
  settingsOpen: false,
  input: "",
  messages: [],
  messagesByScope: loadPersistedChats(),
  inputsByScope: {},
  pendingAsk: null,
  pendingApproval: null,

  openPanel: (sessionId, serverId) => {
    get().bindContext(sessionId, serverId);
    set({ open: true });
    void get().ensureReady();
  },

  bindContext: (sessionId, serverId) => {
    const nextScope = aiChatScopeKey(sessionId, serverId);
    const prev = get();
    if (
      prev.chatScope === nextScope &&
      prev.sessionId === sessionId &&
      (prev.serverId ?? null) === (serverId ?? null)
    ) {
      return;
    }

    const persisted = persistCurrentScope(get);
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

    set({
      ...persisted,
      sessionId,
      serverId: serverId ?? null,
      chatScope: nextScope,
      messages: persisted.messagesByScope[nextScope] ?? [],
      input: persisted.inputsByScope[nextScope] ?? "",
      busy: switchingAway ? false : prev.busy,
      modelPhase: switchingAway ? "idle" : prev.modelPhase,
      pendingAsk: switchingAway ? null : prev.pendingAsk,
      pendingApproval: switchingAway ? null : prev.pendingApproval,
    });
  },

  close: () => {
    // Hide panel only — do not abort an in-flight agent run when switching
    // to Host Stats / Find / etc. Explicit Stop still cancels.
    const persisted = persistCurrentScope(get);
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
    const { chatScope, inputsByScope } = get();
    set({
      input: v,
      inputsByScope: chatScope
        ? { ...inputsByScope, [chatScope]: v }
        : inputsByScope,
    });
  },
  setSettingsOpen: (v) => set({ settingsOpen: v }),

  ensureReady: async () => {
    set({ starting: true, error: null, bootstrapStatus: null });
    let unlisten: (() => void) | undefined;
    try {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        unlisten = await listen<{ phase?: string; detail?: string }>(
          "ai-sidecar-bootstrap",
          (ev) => {
            const detail = ev.payload?.detail?.trim();
            const phase = ev.payload?.phase?.trim();
            set({
              bootstrapStatus: detail || phase || null,
            });
          },
        );
      } catch {
        /* non-Tauri */
      }
      const settings = await getAiSettings();
      const sidecar = await ensureSidecar();
      set({
        settings,
        sidecar,
        ready: true,
        starting: false,
        error: null,
        bootstrapStatus: null,
      });
    } catch (err) {
      set({
        starting: false,
        ready: false,
        sidecar: null,
        error: formatAppError(err),
        bootstrapStatus: null,
      });
    } finally {
      unlisten?.();
    }
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
    const { sidecar, sessionId, pendingApproval, pendingAsk, chatScope, messages, messagesByScope } =
      get();
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
    const nextByScope = chatScope
      ? { ...messagesByScope, [chatScope]: nextMessages }
      : messagesByScope;
    savePersistedChats(nextByScope);
    set({
      busy: false,
      modelPhase: "idle",
      pendingAsk: null,
      pendingApproval: null,
      messages: nextMessages,
      messagesByScope: nextByScope,
    });
    if (sidecar && sessionId && runId) {
      void cancelAgentRun(sidecar, sessionId, runId).catch(() => undefined);
    }
  },
  resolveAsk: (selected, freeText) => {
    const pending = get().pendingAsk;
    if (!pending) return;
    pending.resolve({ selected_option_ids: selected, free_text: freeText });
    const { chatScope, messages, messagesByScope } = get();
    const nextMessages = messages.map((line) =>
      line.kind === "ask" && line.requestId === pending.requestId
        ? { ...line, answered: true }
        : line,
    );
    const nextByScope = chatScope
      ? { ...messagesByScope, [chatScope]: nextMessages }
      : messagesByScope;
    savePersistedChats(nextByScope);
    set({
      pendingAsk: null,
      messages: nextMessages,
      messagesByScope: nextByScope,
    });
  },

  resolveApproval: (approved, confirmText, rememberRead) => {
    const pending = get().pendingApproval;
    if (!pending) return;
    pending.resolve({
      approved,
      confirm_text: confirmText,
      remember_read_binaries:
        approved && rememberRead ? pending.rememberableBinaries : [],
    });
    const { chatScope, messages, messagesByScope } = get();
    const nextMessages = messages.map((line) =>
      line.kind === "approval" && line.approvalId === pending.approvalId
        ? { ...line, decision: approved ? ("approved" as const) : ("rejected" as const) }
        : line,
    );
    const nextByScope = chatScope
      ? { ...messagesByScope, [chatScope]: nextMessages }
      : messagesByScope;
    savePersistedChats(nextByScope);
    set({
      pendingApproval: null,
      messages: nextMessages,
      messagesByScope: nextByScope,
    });
  },

  sendMessage: async ({ sessionId, serverId, interruptIfBusy }) => {
    get().bindContext(sessionId, serverId);
    const text = get().input.trim();
    if (!text) return;
    if (get().busy) {
      if (!interruptIfBusy) return;
      get().stopActiveRun();
      // Let abort settle before starting the next run on the same session.
      await new Promise((r) => setTimeout(r, 40));
    }
    if (get().busy) return;

    const runScope = aiChatScopeKey(sessionId, serverId);
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
    const userLine: ChatLine = { id: nextId(), kind: "user", content: text };
    const nextMessages = [...get().messages, userLine];
    const messagesByScope = { ...get().messagesByScope, [runScope]: nextMessages };
    savePersistedChats(messagesByScope);
    set({
      input: "",
      busy: true,
      modelPhase: "idle",
      sessionId,
      serverId: serverId ?? get().serverId,
      chatScope: runScope,
      messages: nextMessages,
      messagesByScope,
      inputsByScope: { ...get().inputsByScope, [runScope]: "" },
    });

    const appendIfSameScope = (line: ChatLine) => {
      const cur = get();
      if (cur.chatScope !== runScope) return;
      const messages = [...cur.messages, line];
      const messagesByScope = { ...cur.messagesByScope, [runScope]: messages };
      savePersistedChats(messagesByScope);
      set({
        messages,
        messagesByScope,
      });
    };

    const replaceMessagesIfSameScope = (messages: ChatLine[]) => {
      const cur = get();
      if (cur.chatScope !== runScope) return;
      const messagesByScope = { ...cur.messagesByScope, [runScope]: messages };
      savePersistedChats(messagesByScope);
      set({ messages, messagesByScope });
    };

    const patchToolLineByCallId = (
      callId: string,
      patch: Partial<Extract<ChatLine, { kind: "tool" }>>,
    ) => {
      const cur = get();
      if (cur.chatScope !== runScope) return;
      const idx = cur.messages.findIndex(
        (line) => line.kind === "tool" && line.callId === callId,
      );
      if (idx < 0) return;
      const prev = cur.messages[idx];
      if (prev.kind !== "tool") return;
      const messages = [...cur.messages];
      messages[idx] = { ...prev, ...patch };
      replaceMessagesIfSameScope(messages);
    };

    const appendToolOutputByCallId = (callId: string, chunk: string) => {
      if (!chunk) return;
      const cur = get();
      if (cur.chatScope !== runScope) return;
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
      replaceMessagesIfSameScope(messages);
    };

    try {
      const sidecar = await ensureSidecar();
      set({ sidecar, ready: true });
      chatAbort?.abort();
      const abort = new AbortController();
      chatAbort = abort;
      activeRunId = null;
      activeRunScope = runScope;

      const { runId } = await runAgentChat({
        sidecar,
        sessionId,
        message: text,
        securityMode: get().settings?.security_mode || "safe",
        serverId: serverId ?? get().serverId ?? undefined,
        history: priorHistory,
        signal: abort.signal,
        onAskUser: (ev) =>
          new Promise((resolve) => {
            if (get().chatScope !== runScope) {
              resolve({ selected_option_ids: [], free_text: "context_switched" });
              return;
            }
            set({
              pendingAsk: { requestId: ev.request_id, resolve },
            });
            revealAiEngineerPanel();
            appendIfSameScope({
              id: nextId(),
              kind: "ask",
              requestId: ev.request_id,
              question: ev.question,
              options: ev.options,
            });
          }),
        onApproval: (ev) =>
          new Promise((resolve) => {
            if (get().chatScope !== runScope) {
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
            appendIfSameScope({
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
          if (get().chatScope !== runScope || activeRunScope !== runScope) {
            return;
          }
          if (event.type === "status") {
            if (event.run_id) {
              activeRunId = event.run_id;
            }
            if (event.phase === "thinking" || event.status === "thinking") {
              set({ modelPhase: "thinking" });
            }
            return;
          }
          if (event.type === "assistant_delta") {
            const text = event.text ?? "";
            if (!text) return;
            const msgs = get().messages;
            const last = msgs[msgs.length - 1];
            if (last?.kind === "assistant" && last.streaming) {
              replaceMessagesIfSameScope([
                ...msgs.slice(0, -1),
                { ...last, content: last.content + text },
              ]);
            } else {
              appendIfSameScope({
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
              replaceMessagesIfSameScope([
                ...msgs.slice(0, -1),
                { id: last.id, kind: "assistant", content },
              ]);
            } else if (last?.kind === "assistant" && last.content === content) {
              // already shown via deltas / prior finalize
            } else {
              appendIfSameScope({ id: nextId(), kind: "assistant", content });
            }
          } else if (event.type === "completed") {
            // Backend also emits assistant_message with the same text; only show
            // completed content when it adds something new (e.g. conclusion summary).
            const content = event.content ?? "";
            if (!content.trim()) return;
            const msgs = get().messages;
            for (let i = msgs.length - 1; i >= 0; i -= 1) {
              const line = msgs[i];
              if (line.kind === "assistant") {
                if (line.content === content) return;
                if (line.streaming) {
                  replaceMessagesIfSameScope([
                    ...msgs.slice(0, i),
                    { id: line.id, kind: "assistant", content },
                    ...msgs.slice(i + 1),
                  ]);
                  return;
                }
                break;
              }
            }
            appendIfSameScope({ id: nextId(), kind: "assistant", content });
          } else if (event.type === "tool_call") {
            const detail = String(
              (event.arguments.command as string) ||
                (event.arguments.query as string) ||
                (event.arguments.url as string) ||
                "",
            );
            const intent =
              typeof event.arguments.intent === "string" && event.arguments.intent.trim()
                ? event.arguments.intent.trim()
                : undefined;
            const isExec =
              event.name === "terminal_exec" || event.name === "ai_exec";
            // Finalize any in-flight streaming bubble before tool lines.
            const msgs = get().messages;
            const last = msgs[msgs.length - 1];
            if (last?.kind === "assistant" && last.streaming) {
              replaceMessagesIfSameScope([
                ...msgs.slice(0, -1),
                { id: last.id, kind: "assistant", content: last.content },
              ]);
            }
            appendIfSameScope({
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
          } else if (event.type === "error") {
            appendIfSameScope({
              id: nextId(),
              kind: "error",
              content: event.message,
            });
          } else if (event.type === "cancelled") {
            appendIfSameScope({
              id: nextId(),
              kind: "error",
              content: "Stopped",
            });
          }
        },
      });
      if (activeRunScope === runScope) {
        activeRunId = runId;
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        useToastStore.getState().pushToast(formatAppError(err), false);
        appendIfSameScope({
          id: nextId(),
          kind: "error",
          content: formatAppError(err),
        });
      }
    } finally {
      if (activeRunScope === runScope) {
        chatAbort = null;
        activeRunId = null;
        activeRunScope = null;
        if (get().chatScope === runScope) {
          set({ busy: false, modelPhase: "idle", pendingAsk: null, pendingApproval: null });
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
