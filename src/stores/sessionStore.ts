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

interface SessionState {
  tabs: TabSession[];
  activeTabId: string | null;
  savedConnections: SavedConnection[];
  deviceHistory: DeviceRecord[];
  activeTransfers: Record<string, TransferProgressPayload>;
  statusMessage: string | null;
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
  closeTab: (id: string) => Promise<void>;
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
  sendTo: null,

  addTab: (info) => {
    set((state) => ({
      tabs: [
        ...state.tabs.map((tab) => ({ ...tab, active: false })),
        { ...info, active: true },
      ],
      activeTabId: info.id,
    }));
  },

  closeTab: async (id) => {
    await invoke("close_session", { sessionId: id });
    set((state) => {
      const tabs = state.tabs.filter((tab) => tab.id !== id);
      const activeTabId =
        state.activeTabId === id
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
    const info = await invoke<SessionInfo>("create_local_session", { cols, rows });
    get().addTab(info);
  },

  createSshSession: async (request, cols, rows) => {
    try {
      const result = await invoke<SshConnectResult>("create_ssh_session", {
        request,
        cols,
        rows,
      });
      get().addTab(result.session);
      await get().loadDeviceHistory();
      return result;
    } catch (err) {
      notifyConnectError(err);
    }
  },

  connectSaved: async (savedId, password, rememberPassword, cols, rows) => {
    try {
      const result = await invoke<SshConnectResult>("connect_saved", {
        savedId,
        password,
        rememberPassword,
        cols,
        rows,
      });
      get().addTab(result.session);
      await get().loadSavedConnections();
      await get().loadDeviceHistory();
    } catch (err) {
      notifyConnectError(err);
    }
  },

  connectDevice: async (device, password, cols, rows) => {
    const result = await invoke<SshConnectResult>("connect_device", {
      device,
      password,
      cols,
      rows,
    });
    get().addTab(result.session);
    await get().loadDeviceHistory();
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
