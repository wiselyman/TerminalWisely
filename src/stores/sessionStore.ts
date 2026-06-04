import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { formatConnectError } from "../lib/connectError";
import { useToastStore } from "./toastStore";
import type {
  DeviceRecord,
  SavedConnection,
  SessionInfo,
  SshConnectRequest,
  TabSession,
  TransferProgressPayload,
} from "../types";

interface SessionState {
  tabs: TabSession[];
  activeTabId: string | null;
  savedConnections: SavedConnection[];
  deviceHistory: DeviceRecord[];
  transferProgress: TransferProgressPayload | null;
  statusMessage: string | null;
  addTab: (info: SessionInfo) => void;
  closeTab: (id: string) => Promise<void>;
  setActiveTab: (id: string) => void;
  loadSavedConnections: () => Promise<void>;
  loadDeviceHistory: () => Promise<void>;
  saveConnection: (
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
  ) => Promise<void>;
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
  setTransferProgress: (progress: TransferProgressPayload | null) => void;
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
  transferProgress: null,
  statusMessage: null,

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

  loadSavedConnections: async () => {
    const saved = await invoke<SavedConnection[]>("get_saved_connections");
    set({ savedConnections: saved });
  },

  loadDeviceHistory: async () => {
    const devices = await invoke<DeviceRecord[]>("get_device_history");
    set({ deviceHistory: devices });
  },

  saveConnection: async (name, request, rememberPassword) => {
    await invoke("save_connection", { name, request, rememberPassword });
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
      const info = await invoke<SessionInfo>("create_ssh_session", {
        request,
        cols,
        rows,
      });
      get().addTab(info);
      await get().loadDeviceHistory();
    } catch (err) {
      notifyConnectError(err);
    }
  },

  connectSaved: async (savedId, password, rememberPassword, cols, rows) => {
    try {
      const info = await invoke<SessionInfo>("connect_saved", {
        savedId,
        password,
        rememberPassword,
        cols,
        rows,
      });
      get().addTab(info);
      await get().loadSavedConnections();
      await get().loadDeviceHistory();
    } catch (err) {
      notifyConnectError(err);
    }
  },

  connectDevice: async (device, password, cols, rows) => {
    const info = await invoke<SessionInfo>("connect_device", {
      device,
      password,
      cols,
      rows,
    });
    get().addTab(info);
    await get().loadDeviceHistory();
  },

  setTransferProgress: (progress) => set({ transferProgress: progress }),
  setStatusMessage: (message) => set({ statusMessage: message }),
}));
