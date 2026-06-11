import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { formatConnectError } from "../lib/connectError";
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
  openSendTo: (request: SendToRequest) => void;
  closeSendTo: () => void;
  transferRemote: (toSessionId: string) => Promise<void>;
  startRemoteTransfer: (
    fromSessionId: string,
    remotePath: string,
    toSessionId: string,
  ) => Promise<void>;
  addTab: (info: SessionInfo) => void;
  addConnectingTab: (info: SessionInfo) => void;
  promoteConnectingTab: (pendingId: string, session: SessionInfo) => void;
  removeConnectingTab: (pendingId: string) => void;
  closeTab: (id: string) => Promise<void>;
  closeOtherTabs: (id: string) => Promise<void>;
  closeTabsToLeft: (id: string) => Promise<void>;
  closeTabsToRight: (id: string) => Promise<void>;
  setActiveTab: (id: string) => void;
  reorderTabs: (
    dragId: string,
    targetId: string,
    position: "before" | "after",
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
  createLocalSession: (cols: number, rows: number) => Promise<void>;
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
  ) => Promise<void>;
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
    set((state) => ({
      tabs: [
        ...state.tabs.map((tab) => ({ ...tab, active: false })),
        {
          ...info,
          active: true,
          connectionStatus: "connecting" as const,
        },
      ],
      activeTabId: info.id,
    }));
  },

  promoteConnectingTab: (pendingId, session) => {
    set((state) => {
      const tabs = state.tabs.map((tab) => {
        if (tab.id !== pendingId) return tab;
        return {
          ...session,
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

  createLocalSession: async (cols, rows) => {
    const pendingId = createPendingId();
    get().addConnectingTab({
      id: pendingId,
      title: "本地终端",
      kind: "local",
    });

    try {
      const info = await invoke<SessionInfo>("create_local_session", { cols, rows });
      if (await discardSessionIfCancelled(pendingId, info.id)) return;
      get().promoteConnectingTab(pendingId, info);
    } catch (err) {
      get().removeConnectingTab(pendingId);
      notifyConnectError(err);
    }
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
          .pushToast("当前没有可取消的传输任务", false);
        return;
      }
      get().removeTransfer(transferId);
    } catch (err) {
      useToastStore.getState().pushToast(String(err), false);
    }
  },

  setStatusMessage: (message) => set({ statusMessage: message }),

  setSessionDisconnected: (sessionId) =>
    set((state) => {
      if (state.disconnectedSessionIds.has(sessionId)) return state;
      const disconnectedSessionIds = new Set(state.disconnectedSessionIds);
      disconnectedSessionIds.add(sessionId);
      return { disconnectedSessionIds };
    }),

  clearSessionDisconnected: (sessionId) =>
    set((state) => {
      if (!state.disconnectedSessionIds.has(sessionId)) return state;
      const disconnectedSessionIds = new Set(state.disconnectedSessionIds);
      disconnectedSessionIds.delete(sessionId);
      return { disconnectedSessionIds };
    }),

  reconnectSession: async (sessionId, cols, rows) => {
    try {
      await invoke("reconnect_ssh_session", { sessionId, cols, rows });
      get().clearSessionDisconnected(sessionId);
    } catch (err) {
      useToastStore.getState().pushToast(formatConnectError(err), false);
    }
  },

  openSendTo: (request) => set({ sendTo: request }),
  closeSendTo: () => set({ sendTo: null }),

  transferRemote: async (toSessionId) => {
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
    );
  },

  startRemoteTransfer: async (fromSessionId, remotePath, toSessionId) => {
    if (fromSessionId === toSessionId) {
      useToastStore.getState().pushToast("不能发送到同一个 SSH 会话", false);
      return;
    }

    const targetTab = get().tabs.find((tab) => tab.id === toSessionId);
    useToastStore
      .getState()
      .pushToast(
        targetTab ? `正在发送到 ${targetTab.title}…` : "正在发送…",
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

    try {
      await invoke("transfer_remote_file", {
        request: {
          from_session_id: fromSessionId,
          remote_path: remotePath,
          to_session_id: toSessionId,
          remote_dir: null,
          transfer_id: transferId,
        },
      });
    } catch (err) {
      get().removeTransfer(transferId);
      throw err;
    }
  },
}));
