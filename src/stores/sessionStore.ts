import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import i18n from "../i18n";
import { formatAppError } from "../lib/formatAppError";
import { formatConnectError } from "../lib/connectError";
import { uniqueTabTitle } from "../lib/tabTitle";
import { createTransferId } from "../lib/transferId";
import { useToastStore } from "./toastStore";
import type {
  DeviceRecord,
  SavedConnection,
  SendToRequest,
  SessionInfo,
  SshConnectRequest,
  SshConnectResult,
  TabSession,
  TransferProgressPayload,
} from "../types";

const PENDING_PREFIX = "pending:";
const cancelledConnects = new Set<string>();

function createPendingId(): string {
  return `${PENDING_PREFIX}${crypto.randomUUID()}`;
}

function isPendingId(id: string): boolean {
  return id.startsWith(PENDING_PREFIX);
}

function tabIsConnecting(tab: TabSession): boolean {
  return tab.connectionStatus === "connecting" || isPendingId(tab.id);
}

function sshTabTitle(request: SshConnectRequest): string {
  const custom = request.session_title?.trim();
  if (custom) return custom;
  return `${request.username}@${request.host}`;
}

async function discardSessionIfCancelled(
  pendingId: string,
  sessionId: string,
): Promise<boolean> {
  if (!cancelledConnects.has(pendingId)) return false;
  cancelledConnects.delete(pendingId);
  try {
    await invoke("close_session", { sessionId });
  } catch {
    // Session may not exist yet; ignore cleanup errors.
  }
  return true;
}

interface SessionState {
  tabs: TabSession[];
  activeTabId: string | null;
  savedConnections: SavedConnection[];
  deviceHistory: DeviceRecord[];
  activeTransfers: Record<string, TransferProgressPayload>;
  statusMessage: string | null;
  disconnectedSessionIds: Set<string>;
  sendTo: SendToRequest | null;
  pendingSudoTransfers: Record<
    string,
    {
      fromSessionId: string;
      remotePath: string;
      toSessionId: string;
      remoteDir?: string | null;
    }
  >;
  openSendTo: (request: SendToRequest) => void;
  closeSendTo: () => void;
  transferRemote: (
    toSessionId: string,
    remoteDir?: string | null,
  ) => Promise<void>;
  startRemoteTransfer: (
    fromSessionId: string,
    remotePath: string,
    toSessionId: string,
    sudoPassword?: string,
    remoteDir?: string | null,
  ) => Promise<void>;
  takePendingSudoTransfer: (
    transferId: string,
  ) => {
    fromSessionId: string;
    remotePath: string;
    toSessionId: string;
    remoteDir?: string | null;
  } | null;
  clearPendingSudoTransfer: (transferId: string) => void;
  addTab: (info: SessionInfo) => void;
  addConnectingTab: (info: SessionInfo) => void;
  promoteConnectingTab: (pendingId: string, session: SessionInfo) => void;
  removeConnectingTab: (pendingId: string) => void;
  closeTab: (id: string) => Promise<void>;
  closeOtherTabs: (id: string) => Promise<void>;
  closeTabsToLeft: (id: string) => Promise<void>;
  closeTabsToRight: (id: string) => Promise<void>;
  setActiveTab: (id: string) => void;
  activateHome: () => void;
  reorderTabs: (
    dragId: string,
    targetId: string,
    position: "before" | "after",
  ) => void;
  updateSessionMetadata: (
    sessionId: string,
    patch: {
      os_id?: string | null;
      os_name?: string | null;
      remote_home?: string | null;
    },
  ) => void;
  loadSavedConnections: () => Promise<void>;
  loadDeviceHistory: () => Promise<void>;
  saveConnection: (
    name: string,
    request: SshConnectRequest,
    rememberPassword: boolean,
    osId?: string | null,
    osName?: string | null,
  ) => Promise<void>;
  updateSavedConnection: (
    id: string,
    name: string,
    request: SshConnectRequest,
    rememberPassword: boolean,
  ) => Promise<void>;
  deleteSavedConnection: (id: string) => Promise<void>;
  removeDeviceHistory: (id: string) => Promise<void>;
  createSshSession: (
    request: SshConnectRequest,
    cols: number,
    rows: number,
  ) => Promise<SshConnectResult>;
  connectSaved: (
    savedId: string,
    password: string | null,
    rememberPassword: boolean,
    cols: number,
    rows: number,
  ) => Promise<void>;
  connectDevice: (
    device: DeviceRecord,
    password: string | null,
    cols: number,
    rows: number,
  ) => Promise<void>;
  upsertTransfer: (progress: TransferProgressPayload) => void;
  removeTransfer: (transferId: string) => void;
  cancelTransfer: (transferId: string) => Promise<void>;
  setStatusMessage: (message: string | null) => void;
  setSessionDisconnected: (sessionId: string) => void;
  clearSessionDisconnected: (sessionId: string) => void;
  reconnectSession: (
    sessionId: string,
    cols: number,
    rows: number,
    options?: { silent?: boolean },
  ) => Promise<boolean>;
  /** Restore FE tabs from Rust sessions still alive after webview reload. */
  hydrateFromBackend: () => Promise<void>;
}

function mergeSessionOs(
  session: SessionInfo,
  result: Pick<SshConnectResult, "os_id" | "os_name">,
): SessionInfo {
  return {
    ...session,
    os_id: session.os_id ?? result.os_id ?? null,
    os_name: session.os_name ?? result.os_name ?? null,
  };
}

function notifyConnectError(err: unknown): never {
  useToastStore.getState().pushToast(formatConnectError(err), false);
  throw err;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  tabs: [],
  activeTabId: null,
  savedConnections: [],
  deviceHistory: [],
  activeTransfers: {},
  statusMessage: null,
  disconnectedSessionIds: new Set<string>(),
  sendTo: null,
  pendingSudoTransfers: {},

  takePendingSudoTransfer: (transferId) => {
    const entry = get().pendingSudoTransfers[transferId];
    if (!entry) return null;
    const { [transferId]: _, ...rest } = get().pendingSudoTransfers;
    set({ pendingSudoTransfers: rest });
    return entry;
  },

  clearPendingSudoTransfer: (transferId) => {
    const { [transferId]: _, ...rest } = get().pendingSudoTransfers;
    set({ pendingSudoTransfers: rest });
  },

  addTab: (info) => {
    set((state) => ({
      tabs: [
        ...state.tabs.map((tab) => ({ ...tab, active: false })),
        { ...info, active: true, connectionStatus: "ready" as const },
      ],
      activeTabId: info.id,
    }));
  },

  addConnectingTab: (info) => {
    set((state) => {
      const title = uniqueTabTitle(info.title, state.tabs, info.id);
      return {
        tabs: [
          ...state.tabs.map((tab) => ({ ...tab, active: false })),
          {
            ...info,
            title,
            active: true,
            connectionStatus: "connecting" as const,
          },
        ],
        activeTabId: info.id,
      };
    });
  },

  promoteConnectingTab: (pendingId, session) => {
    set((state) => {
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== pendingId) return tab;
        return {
          ...session,
          title: tab.title,
          active: tab.active,
          connectionStatus: "ready" as const,
        };
      });
      return {
        tabs,
        activeTabId:
          state.activeTabId === pendingId ? session.id : state.activeTabId,
      };
    });
  },

  removeConnectingTab: (pendingId) => {
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== pendingId);
      const activeTabId =
        state.activeTabId === pendingId
          ? tabs.length > 0
            ? tabs[tabs.length - 1].id
            : null
          : state.activeTabId;
      return {
        tabs: tabs.map((tab) => ({ ...tab, active: tab.id === activeTabId })),
        activeTabId,
      };
    });
  },

  closeTab: async (id) => {
    const tab = get().tabs.find((item) => item.id === id);
    if (tab && tabIsConnecting(tab)) {
      cancelledConnects.add(id);
      get().removeConnectingTab(id);
      return;
    }

    await invoke("close_session", { sessionId: id });
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      const activeTabId =
        state.activeTabId === id
          ? tabs.length > 0
            ? tabs[tabs.length - 1].id
            : null
          : state.activeTabId;
      const disconnectedSessionIds = new Set(state.disconnectedSessionIds);
      disconnectedSessionIds.delete(id);
      return {
        tabs: tabs.map((tab) => ({ ...tab, active: tab.id === activeTabId })),
        activeTabId,
        disconnectedSessionIds,
      };
    });
  },

  closeOtherTabs: async (id) => {
    const ids = get()
      .tabs.filter((tab) => tab.id !== id)
      .map((tab) => tab.id);
    for (const tabId of ids) {
      await get().closeTab(tabId);
    }
  },

  closeTabsToLeft: async (id) => {
    const tabs = get().tabs;
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index <= 0) return;
    const ids = tabs.slice(0, index).map((tab) => tab.id);
    for (const tabId of ids) {
      await get().closeTab(tabId);
    }
  },

  closeTabsToRight: async (id) => {
    const tabs = get().tabs;
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0 || index >= tabs.length - 1) return;
    const ids = tabs.slice(index + 1).map((tab) => tab.id);
    for (const tabId of ids) {
      await get().closeTab(tabId);
    }
  },

  setActiveTab: (id) => {
    set((state) => ({
      activeTabId: id,
      tabs: state.tabs.map((tab) => ({ ...tab, active: tab.id === id })),
    }));
  },

  activateHome: () => {
    set((state) => ({
      activeTabId: null,
      tabs: state.tabs.map((tab) => ({ ...tab, active: false })),
    }));
  },

  reorderTabs: (dragId, targetId, position) => {
    set((state) => {
      const tabs = [...state.tabs];
      const fromIndex = tabs.findIndex((tab) => tab.id === dragId);
      const targetIndex = tabs.findIndex((tab) => tab.id === targetId);
      if (fromIndex < 0 || targetIndex < 0 || fromIndex === targetIndex) {
        return state;
      }

      const [moved] = tabs.splice(fromIndex, 1);
      let insertIndex = targetIndex;
      if (fromIndex < targetIndex) {
        insertIndex -= 1;
      }
      if (position === "after") {
        insertIndex += 1;
      }
      tabs.splice(insertIndex, 0, moved);
      return { tabs };
    });
  },

  updateSessionMetadata: (sessionId, patch) => {
    set((state) => ({
      tabs: state.tabs.map((tab) => {
        if (tab.id !== sessionId) return tab;
        return {
          ...tab,
          os_id: patch.os_id ?? tab.os_id,
          os_name: patch.os_name ?? tab.os_name,
          remote_home: patch.remote_home ?? tab.remote_home,
        };
      }),
    }));
  },

  loadSavedConnections: async () => {
    const saved = await invoke<SavedConnection[]>("get_saved_connections");
    set({ savedConnections: saved });
  },

  loadDeviceHistory: async () => {
    const devices = await invoke<DeviceRecord[]>("get_device_history");
    set({ deviceHistory: devices });
  },

  saveConnection: async (name, request, rememberPassword, osId, osName) => {
    await invoke("save_connection", {
      name,
      request,
      rememberPassword,
      osId: osId ?? null,
      osName: osName ?? null,
    });
    await get().loadSavedConnections();
  },

  updateSavedConnection: async (id, name, request, rememberPassword) => {
    await invoke("update_saved_connection", {
      id,
      name,
      request,
      rememberPassword,
    });
    await get().loadSavedConnections();
  },

  deleteSavedConnection: async (id) => {
    await invoke("delete_saved_connection", { id });
    await get().loadSavedConnections();
  },

  removeDeviceHistory: async (id) => {
    await invoke("remove_device_history", { id });
    await get().loadDeviceHistory();
  },

  createSshSession: async (request, cols, rows) => {
    const pendingId = createPendingId();
    get().addConnectingTab({
      id: pendingId,
      title: sshTabTitle(request),
      kind: "ssh",
    });

    try {
      const result = await invoke<SshConnectResult>("create_ssh_session", {
        request,
        cols,
        rows,
      });
      const session = mergeSessionOs(result.session, result);
      if (await discardSessionIfCancelled(pendingId, session.id)) return result;
      get().promoteConnectingTab(pendingId, session);
      await get().loadDeviceHistory();
      return result;
    } catch (err) {
      get().removeConnectingTab(pendingId);
      notifyConnectError(err);
    }
  },

  connectSaved: async (savedId, password, rememberPassword, cols, rows) => {
    const saved = get().savedConnections.find((item) => item.id === savedId);
    const pendingId = createPendingId();
    get().addConnectingTab({
      id: pendingId,
      title: saved?.name ?? (saved ? `${saved.username}@${saved.host}` : "SSH"),
      kind: "ssh",
      os_id: saved?.os_id ?? null,
      os_name: saved?.os_name ?? null,
    });

    try {
      const result = await invoke<SshConnectResult>("connect_saved", {
        savedId,
        password,
        rememberPassword,
        cols,
        rows,
      });
      const session = mergeSessionOs(result.session, result);
      if (await discardSessionIfCancelled(pendingId, session.id)) return;
      get().promoteConnectingTab(pendingId, session);
      await get().loadSavedConnections();
      await get().loadDeviceHistory();
    } catch (err) {
      get().removeConnectingTab(pendingId);
      notifyConnectError(err);
    }
  },

  connectDevice: async (device, password, cols, rows) => {
    const pendingId = createPendingId();
    get().addConnectingTab({
      id: pendingId,
      title: `${device.username}@${device.host}`,
      kind: "ssh",
    });

    try {
      const result = await invoke<SshConnectResult>("connect_device", {
        device,
        password,
        cols,
        rows,
      });
      const session = mergeSessionOs(result.session, result);
      if (await discardSessionIfCancelled(pendingId, session.id)) return;
      get().promoteConnectingTab(pendingId, session);
      await get().loadDeviceHistory();
    } catch (err) {
      get().removeConnectingTab(pendingId);
      notifyConnectError(err);
    }
  },

  upsertTransfer: (progress) =>
    set((state) => ({
      activeTransfers: {
        ...state.activeTransfers,
        [progress.transfer_id]: progress,
      },
    })),

  removeTransfer: (transferId) =>
    set((state) => {
      if (!(transferId in state.activeTransfers)) return state;
      const next = { ...state.activeTransfers };
      delete next[transferId];
      return { activeTransfers: next };
    }),

  cancelTransfer: async (transferId) => {
    try {
      const cancelled = await invoke<boolean>("cancel_transfer", {
        transferId,
      });
      if (!cancelled) {
        useToastStore
          .getState()
          .pushToast(i18n.t("errors:noTransferToCancel"), false);
        return;
      }
      get().removeTransfer(transferId);
    } catch (err) {
      useToastStore.getState().pushToast(formatAppError(err), false);
    }
  },

  setStatusMessage: (message) => set({ statusMessage: message }),

  setSessionDisconnected: (sessionId) => {
    set((state) => {
      if (state.disconnectedSessionIds.has(sessionId)) return state;
      const disconnectedSessionIds = new Set(state.disconnectedSessionIds);
      disconnectedSessionIds.add(sessionId);
      return { disconnectedSessionIds };
    });
  },

  clearSessionDisconnected: (sessionId) =>
    set((state) => {
      if (!state.disconnectedSessionIds.has(sessionId)) return state;
      const disconnectedSessionIds = new Set(state.disconnectedSessionIds);
      disconnectedSessionIds.delete(sessionId);
      return { disconnectedSessionIds };
    }),

  reconnectSession: async (sessionId, cols, rows, options) => {
    try {
      await invoke("reconnect_ssh_session", { sessionId, cols, rows });
      get().clearSessionDisconnected(sessionId);
      return true;
    } catch (err) {
      if (!options?.silent) {
        useToastStore.getState().pushToast(formatConnectError(err), false);
      }
      return false;
    }
  },

  hydrateFromBackend: async () => {
    try {
      const sessions = await invoke<SessionInfo[]>("list_sessions");
      if (!sessions.length) return;
      set((state) => {
        const existing = new Set(state.tabs.map((tab) => tab.id));
        const missing = sessions.filter((session) => !existing.has(session.id));
        if (missing.length === 0) return state;

        const restored: TabSession[] = missing.map((session) => ({
          ...session,
          active: false,
          connectionStatus: "ready" as const,
        }));

        // Webview reload wiped FE tabs but Rust sessions survived.
        if (state.tabs.length === 0) {
          const activeTabId = restored[restored.length - 1]?.id ?? null;
          return {
            tabs: restored.map((tab) => ({
              ...tab,
              active: tab.id === activeTabId,
            })),
            activeTabId,
          };
        }

        return { tabs: [...state.tabs, ...restored] };
      });
    } catch {
      // Backend unavailable during early boot — ignore.
    }
  },

  openSendTo: (request) => set({ sendTo: request }),
  closeSendTo: () => set({ sendTo: null }),

  transferRemote: async (toSessionId, remoteDir) => {
    const sendTo = get().sendTo;
    if (!sendTo) return;
    const payload = {
      fromSessionId: sendTo.fromSessionId,
      remotePath: sendTo.remotePath,
    };
    set({ sendTo: null });
    await get().startRemoteTransfer(
      payload.fromSessionId,
      payload.remotePath,
      toSessionId,
      undefined,
      remoteDir ?? null,
    );
  },

  startRemoteTransfer: async (
    fromSessionId,
    remotePath,
    toSessionId,
    sudoPassword,
    remoteDir,
  ) => {
    if (fromSessionId === toSessionId) {
      useToastStore
        .getState()
        .pushToast(i18n.t("shell:toastCannotSendSameSession"), false);
      return;
    }

    const targetTab = get().tabs.find((tab) => tab.id === toSessionId);
    useToastStore
      .getState()
      .pushToast(
        targetTab
          ? i18n.t("shell:toastSendingTo", { title: targetTab.title })
          : i18n.t("shell:toastSending"),
        true,
      );

    const transferId = createTransferId();
    const downloadName =
      remotePath.split("/").pop() || remotePath.split("\\").pop() || remotePath;
    get().upsertTransfer({
      transfer_id: transferId,
      session_id: toSessionId,
      filename: downloadName,
      transferred: 0,
      total: 0,
      direction: "send",
    });

    if (!sudoPassword) {
      set((state) => ({
        pendingSudoTransfers: {
          ...state.pendingSudoTransfers,
          [transferId]: {
            fromSessionId,
            remotePath,
            toSessionId,
            remoteDir: remoteDir ?? null,
          },
        },
      }));
    }

    try {
      await invoke("transfer_remote_file", {
        request: {
          from_session_id: fromSessionId,
          remote_path: remotePath,
          to_session_id: toSessionId,
          remote_dir: remoteDir?.trim() || null,
          transfer_id: transferId,
          sudo_password: sudoPassword ?? null,
        },
      });
    } catch (err) {
      get().clearPendingSudoTransfer(transferId);
      get().removeTransfer(transferId);
      throw err;
    }
  },
}));
