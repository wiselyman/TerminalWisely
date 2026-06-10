import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import type { HostStatsSnapshot } from "../types";
import { useFindStore } from "./findStore";
import { useTaskManagerStore } from "./taskManagerStore";

const HOST_STATS_WIDTH_KEY = "terminal-wisely.host-stats-width";
const DEFAULT_HOST_STATS_WIDTH = 400;
const HISTORY_LIMIT = 30;

export interface HostStatsHistoryPoint {
  cpu: number;
  mem: number;
  rx: number;
  tx: number;
}

export interface NetworkRates {
  rxBps: number;
  txBps: number;
}

interface NetworkSample {
  rxBytes: number;
  txBytes: number;
  sampledAt: number;
}

interface HostStatsState {
  open: boolean;
  width: number;
  snapshot: HostStatsSnapshot | null;
  loading: boolean;
  error: string | null;
  lastUpdated: number | null;
  networkRates: NetworkRates | null;
  totalRxBytes: number;
  totalTxBytes: number;
  history: HostStatsHistoryPoint[];
  activeSessionId: string | null;
  prevNetworkSample: NetworkSample | null;
  setWidth: (width: number) => void;
  toggleOpen: () => void;
  close: () => void;
  resetForSession: () => void;
  fetchStats: (sessionId: string, options?: { initial?: boolean }) => Promise<void>;
}

function sumNetworkBytes(snapshot: HostStatsSnapshot) {
  return snapshot.networks.reduce(
    (acc, item) => ({
      rx: acc.rx + item.rx_bytes,
      tx: acc.tx + item.tx_bytes,
    }),
    { rx: 0, tx: 0 },
  );
}

export const useHostStatsStore = create<HostStatsState>((set, get) => ({
  open: false,
  width: Number(localStorage.getItem(HOST_STATS_WIDTH_KEY)) || DEFAULT_HOST_STATS_WIDTH,
  snapshot: null,
  loading: false,
  error: null,
  lastUpdated: null,
  networkRates: null,
  totalRxBytes: 0,
  totalTxBytes: 0,
  history: [],
  activeSessionId: null,
  prevNetworkSample: null,

  setWidth: (width) => {
    const next = Math.max(320, Math.min(width, 720));
    localStorage.setItem(HOST_STATS_WIDTH_KEY, String(next));
    set({ width: next });
  },

  toggleOpen: () => {
    set((state) => {
      const next = !state.open;
      if (next) {
        useTaskManagerStore.getState().close();
        useFindStore.getState().close();
      }
      return { open: next };
    });
  },

  close: () =>
    set({
      open: false,
      loading: false,
      error: null,
    }),

  resetForSession: () =>
    set({
      snapshot: null,
      error: null,
      lastUpdated: null,
      networkRates: null,
      totalRxBytes: 0,
      totalTxBytes: 0,
      history: [],
      prevNetworkSample: null,
    }),

  fetchStats: async (sessionId, options) => {
    const initial = options?.initial ?? get().snapshot == null;
    if (initial) {
      set({ loading: true, error: null, activeSessionId: sessionId });
    }

    try {
      const snapshot = await invoke<HostStatsSnapshot>("get_host_stats", {
        request: { session_id: sessionId },
      });
      const totals = sumNetworkBytes(snapshot);
      const memPercent =
        snapshot.memory_total_bytes > 0
          ? (snapshot.memory_used_bytes / snapshot.memory_total_bytes) * 100
          : 0;

      const prev = get().prevNetworkSample;
      let networkRates: NetworkRates | null = null;
      if (prev && snapshot.sampled_at > prev.sampledAt) {
        const deltaSec = (snapshot.sampled_at - prev.sampledAt) / 1000;
        if (deltaSec > 0) {
          networkRates = {
            rxBps: Math.max(0, (totals.rx - prev.rxBytes) / deltaSec),
            txBps: Math.max(0, (totals.tx - prev.txBytes) / deltaSec),
          };
        }
      }

      const historyPoint: HostStatsHistoryPoint = {
        cpu: snapshot.cpu_usage_percent,
        mem: memPercent,
        rx: networkRates?.rxBps ?? 0,
        tx: networkRates?.txBps ?? 0,
      };

      set((state) => ({
        snapshot,
        loading: false,
        error: null,
        lastUpdated: Date.now(),
        networkRates,
        totalRxBytes: totals.rx,
        totalTxBytes: totals.tx,
        prevNetworkSample: {
          rxBytes: totals.rx,
          txBytes: totals.tx,
          sampledAt: snapshot.sampled_at,
        },
        history: [...state.history, historyPoint].slice(-HISTORY_LIMIT),
        activeSessionId: sessionId,
      }));
    } catch (err) {
      set({
        loading: false,
        error: String(err),
      });
    }
  },
}));
