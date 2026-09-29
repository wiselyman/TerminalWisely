import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { create } from "zustand";
import { formatAppError } from "../lib/formatAppError";
import {
  type BrowserBookmark,
  type BrowserHistoryEntry,
  isBookmarked,
  suggestHistory,
} from "../lib/browserHistory";
import {
  activeTab as pickActiveTab,
  applyBrowserPageEvent,
  createBrowserBucket,
  createBrowserTab,
  pushTabNav,
  tabCanGoBack,
  tabCanGoForward,
  type BrowserSessionBucket,
  type BrowserTab,
} from "../lib/browserTabs";
import {
  readWorkspacePanelWidth,
  setWorkspacePanelWidth,
  subscribeWorkspacePanelWidth,
} from "../lib/workspacePanelWidth";
import { isTauriRuntime } from "../lib/isTauri";

let browserTraceStart = 0;

function traceBrowser(phase: string) {
  const now =
    typeof performance !== "undefined" ? performance.now() : Date.now();
  if (!browserTraceStart) browserTraceStart = now;
  console.info(
    `[host-browser] ${phase} +${Math.round(now - browserTraceStart)}ms`,
  );
}

function resetBrowserTrace() {
  browserTraceStart =
    typeof performance !== "undefined" ? performance.now() : Date.now();
}

export interface BrowserEnsureResult {
  session_id: string;
  profile_key: string;
  socks_port: number;
  webview_label: string;
  /** Native surface was just created (about:blank) — must navigate. */
  created?: boolean;
}

export interface BrowserDockRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type { BrowserTab };

function readContentSlotBounds(): BrowserDockRect | null {
  const el = document.querySelector<HTMLElement>(
    '[data-testid="host-browser-content"]',
  );
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width < 32 || rect.height < 32) return null;
  return {
    x: rect.left,
    y: rect.top,
    width: rect.width,
    height: rect.height,
  };
}

interface BrowserPagePayload {
  webview_label: string;
  profile_key: string;
  tab_id: string;
  url: string;
  title: string;
  favicon?: string;
}

interface BrowserLoadPayload {
  webview_label: string;
  profile_key: string;
  tab_id: string;
  url: string;
  phase: "started" | "finished" | string;
}

async function setBrowserSurfaceVisible(
  webviewLabel: string | null,
  visible: boolean,
) {
  if (!webviewLabel || !isTauriRuntime()) return;
  try {
    await invoke("browser_set_visible", {
      request: { webview_label: webviewLabel, visible },
    });
  } catch {
    // best-effort hide/show
  }
}

/** Per-host tab sets — survive panel close until the SSH tab is discarded. */
const sessionBuckets = new Map<string, BrowserSessionBucket>();

function cloneBucket(bucket: BrowserSessionBucket): BrowserSessionBucket {
  return {
    activeTabId: bucket.activeTabId,
    webviewLabel: bucket.webviewLabel,
    profileKey: bucket.profileKey,
    socksPort: bucket.socksPort,
    warm: bucket.warm,
    tabs: bucket.tabs.map((t) => ({
      ...t,
      navStack: [...t.navStack],
    })),
  };
}

function bucketFor(sessionId: string): BrowserSessionBucket {
  let bucket = sessionBuckets.get(sessionId);
  if (!bucket) {
    bucket = createBrowserBucket();
    sessionBuckets.set(sessionId, bucket);
  }
  return bucket;
}

function flushLiveToBucket(state: {
  sessionId: string | null;
  tabs: BrowserTab[];
  activeTabId: string | null;
  url: string;
  pageTitle: string;
  webviewLabel?: string | null;
  profileKey?: string | null;
  socksPort?: number | null;
  warm?: boolean;
}) {
  if (!state.sessionId || !state.activeTabId) return;
  const prev = sessionBuckets.get(state.sessionId);
  const tabs = state.tabs.map((t) => {
    if (t.id !== state.activeTabId) return { ...t, navStack: [...t.navStack] };
    return {
      ...t,
      url: state.url,
      title: state.pageTitle || t.title,
      navStack: [...t.navStack],
    };
  });
  sessionBuckets.set(state.sessionId, {
    tabs,
    activeTabId: state.activeTabId,
    webviewLabel:
      state.webviewLabel !== undefined
        ? state.webviewLabel
        : (prev?.webviewLabel ?? null),
    profileKey:
      state.profileKey !== undefined
        ? state.profileKey
        : (prev?.profileKey ?? null),
    socksPort:
      state.socksPort !== undefined
        ? state.socksPort
        : (prev?.socksPort ?? null),
    warm: state.warm !== undefined ? state.warm : Boolean(prev?.warm),
  });
}

function liveFromBucket(bucket: BrowserSessionBucket) {
  const tab = pickActiveTab(bucket) ?? bucket.tabs[0];
  return {
    tabs: cloneBucket(bucket).tabs,
    activeTabId: tab.id,
    url: tab.url,
    pageTitle: tab.title,
    canGoBack: tabCanGoBack(tab),
    canGoForward: tabCanGoForward(tab),
    webviewLabel: bucket.webviewLabel,
    profileKey: bucket.profileKey,
    socksPort: bucket.socksPort,
  };
}

function markBucketWarm(
  sessionId: string,
  native: {
    webviewLabel: string;
    profileKey: string;
    socksPort: number;
  },
) {
  const bucket = bucketFor(sessionId);
  sessionBuckets.set(sessionId, {
    ...cloneBucket(bucket),
    webviewLabel: native.webviewLabel,
    profileKey: native.profileKey,
    socksPort: native.socksPort,
    warm: true,
  });
}

function patchActiveTab(
  tabs: BrowserTab[],
  activeTabId: string | null,
  patch: Partial<BrowserTab>,
): BrowserTab[] {
  if (!activeTabId) return tabs;
  return tabs.map((t) => (t.id === activeTabId ? { ...t, ...patch } : t));
}

interface BrowserState {
  open: boolean;
  minimized: boolean;
  width: number;
  sessionId: string | null;
  profileKey: string | null;
  socksPort: number | null;
  webviewLabel: string | null;
  tabs: BrowserTab[];
  activeTabId: string | null;
  url: string;
  pageTitle: string;
  error: string | null;
  ensuring: boolean;
  loading: boolean;
  docked: boolean;
  history: BrowserHistoryEntry[];
  bookmarks: BrowserBookmark[];
  suggestions: BrowserHistoryEntry[];
  canGoBack: boolean;
  canGoForward: boolean;
  openPanel: (sessionId: string) => Promise<void>;
  close: () => Promise<void>;
  minimize: () => Promise<void>;
  restore: () => Promise<void>;
  setWidth: (width: number) => void;
  setUrl: (url: string) => void;
  refreshSuggestions: (query?: string) => void;
  navigate: (url: string) => Promise<void>;
  goBack: () => Promise<void>;
  goForward: () => Promise<void>;
  reload: () => Promise<void>;
  toggleBookmark: () => Promise<void>;
  removeBookmark: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  loadChromeData: () => Promise<void>;
  ensureForSession: (
    sessionId: string,
    bounds?: BrowserDockRect | null,
  ) => Promise<void>;
  syncBounds: (bounds: BrowserDockRect) => Promise<void>;
  /** Hide or release the native webview without changing dock minimize state. */
  setNativeVisible: (visible: boolean) => void;
  newTab: (url?: string) => void;
  closeTab: (tabId: string) => void;
  selectTab: (tabId: string) => void;
  discardSessionBucket: (sessionId: string) => void;
  /** Hide native surfaces; keep SOCKS/webviews alive for host-tab switch. */
  park: () => Promise<void>;
}

async function shutdownBrowser(sessionId: string | null) {
  if (!sessionId || !isTauriRuntime()) return;
  try {
    await invoke("browser_shutdown", {
      request: { session_id: sessionId },
    });
  } catch {
    // best-effort
  }
}

let ensureInFlight: Promise<void> | null = null;
let ensureInFlightSession: string | null = null;
let pageUnlisten: UnlistenFn | null = null;
let loadUnlisten: UnlistenFn | null = null;
let boundsInFlight: Promise<void> | null = null;
let pendingBounds: BrowserDockRect | null = null;
/** While true, bounds sync must not show the native webview over other windows. */
let nativeHeld = false;

function syncNavFlagsFromTab(
  set: (partial: Partial<BrowserState>) => void,
  tab: BrowserTab | undefined,
) {
  set({
    canGoBack: tab ? tabCanGoBack(tab) : false,
    canGoForward: tab ? tabCanGoForward(tab) : false,
  });
}

async function ensurePageListener(
  set: (partial: Partial<BrowserState>) => void,
  get: () => BrowserState,
) {
  if (!isTauriRuntime()) return;
  if (!pageUnlisten) {
    try {
      pageUnlisten = await listen<BrowserPagePayload>("host-browser-page", (event) => {
        const payload = event.payload;
        const state = get();
        const tabId = (payload.tab_id || "").trim();
        if (!tabId) return;
        const applied = applyBrowserPageEvent(state.tabs, state.activeTabId, {
          tabId,
          url: payload.url,
          title: payload.title || payload.url,
          favicon: payload.favicon,
        });
        const patch: Partial<BrowserState> = {
          tabs: applied.tabs,
        };
        if (applied.activeUpdated) {
          patch.url = applied.url;
          patch.pageTitle = applied.pageTitle;
          patch.loading = false;
          const updated = applied.tabs.find((t) => t.id === tabId);
          if (updated) syncNavFlagsFromTab(set, updated);
        }
        set(patch);
        flushLiveToBucket({
          ...get(),
          tabs: applied.tabs,
          url: applied.activeUpdated ? (applied.url ?? get().url) : get().url,
          pageTitle: applied.activeUpdated
            ? (applied.pageTitle ?? get().pageTitle)
            : get().pageTitle,
        });
        if (payload.profile_key && isTauriRuntime()) {
          void invoke("browser_history_record", {
            request: {
              profile_key: payload.profile_key,
              url: payload.url,
              title: payload.title || payload.url,
            },
          }).then(() => get().loadChromeData());
        }
      });
    } catch {
      // non-Tauri / E2E
    }
  }
  if (!loadUnlisten) {
    try {
      loadUnlisten = await listen<BrowserLoadPayload>("host-browser-load", (event) => {
        const payload = event.payload;
        const state = get();
        if (
          state.webviewLabel &&
          payload.webview_label &&
          payload.webview_label !== state.webviewLabel
        ) {
          return;
        }
        if (payload.phase === "started") {
          traceBrowser("load-started");
          set({ loading: true, error: null });
        } else if (payload.phase === "finished") {
          traceBrowser("load-finished");
          set({ loading: false });
        }
      });
    } catch {
      // non-Tauri / E2E
    }
  }
}

let mainRestoredUnlisten: UnlistenFn | null = null;

async function ensureMainRestoredListener(get: () => BrowserState) {
  if (mainRestoredUnlisten || !isTauriRuntime()) return;
  try {
    mainRestoredUnlisten = await listen("host-browser-main-restored", () => {
      const state = get();
      if (!state.open || state.minimized || !state.webviewLabel) return;
      void (async () => {
        const bounds = readContentSlotBounds();
        if (bounds) await get().syncBounds(bounds);
        await setBrowserSurfaceVisible(state.webviewLabel, true);
        const again = readContentSlotBounds() ?? bounds;
        if (again) await get().syncBounds(again);
      })();
    });
  } catch {
    // non-Tauri / E2E
  }
}

const initialBucket = createBrowserBucket();
const initialTab = pickActiveTab(initialBucket)!;

export const useBrowserStore = create<BrowserState>((set, get) => {
  subscribeWorkspacePanelWidth((width) => {
    set({ width });
  });

  return {
    open: false,
    minimized: false,
    width: readWorkspacePanelWidth(),
    sessionId: null,
    profileKey: null,
    socksPort: null,
    webviewLabel: null,
    tabs: initialBucket.tabs,
    activeTabId: initialTab.id,
    url: initialTab.url,
    pageTitle: "",
    error: null,
    ensuring: false,
    loading: false,
    docked: false,
    history: [],
    bookmarks: [],
    suggestions: [],
    canGoBack: false,
    canGoForward: false,

    setWidth: (width) => {
      set({ width: setWorkspacePanelWidth(width) });
    },

    setUrl: (url) => {
      set({
        url,
        tabs: patchActiveTab(get().tabs, get().activeTabId, { url }),
      });
      get().refreshSuggestions(url);
    },

    refreshSuggestions: (query) => {
      const q = query ?? get().url;
      set({
        suggestions: suggestHistory(q, get().history, get().profileKey, 8),
      });
    },

    loadChromeData: async () => {
      if (!isTauriRuntime()) {
        const profileKey = get().profileKey ?? "e2e@mock:22";
        const history: BrowserHistoryEntry[] = [
          {
            url: "http://127.0.0.1:8080/",
            title: "Local",
            profile_key: profileKey,
            visited_at: Date.now(),
          },
        ];
        set({
          history,
          bookmarks: [],
          suggestions: suggestHistory(get().url, history, profileKey, 8),
        });
        return;
      }
      const profileKey = get().profileKey;
      try {
        const [history, bookmarks] = await Promise.all([
          invoke<BrowserHistoryEntry[]>("browser_history_list", {
            request: { profile_key: null },
          }),
          invoke<BrowserBookmark[]>("browser_bookmarks_list", {
            request: { profile_key: profileKey },
          }),
        ]);
        set({
          history,
          bookmarks,
          suggestions: suggestHistory(get().url, history, profileKey, 8),
        });
      } catch {
        // store plugin unavailable in some test harnesses
      }
    },

    openPanel: async (sessionId) => {
      resetBrowserTrace();
      traceBrowser("open");
      const prev = get();
      if (prev.open && prev.minimized && prev.sessionId === sessionId) {
        await get().restore();
        return;
      }
      if (prev.sessionId && prev.sessionId !== sessionId) {
        flushLiveToBucket(prev);
        if (isTauriRuntime() && prev.sessionId) {
          try {
            await invoke("browser_hide_session", {
              request: { session_id: prev.sessionId },
            });
          } catch {
            await setBrowserSurfaceVisible(prev.webviewLabel, false);
          }
        } else if (prev.webviewLabel) {
          await setBrowserSurfaceVisible(prev.webviewLabel, false);
        }
      }
      const bucket = bucketFor(sessionId);
      const live = liveFromBucket(bucket);
      // Warm = this SSH tab already has a native webview in Rust — never null out
      // handles just because we visited another host in between.
      const warm = Boolean(bucket.warm && bucket.webviewLabel);
      set({
        open: true,
        minimized: false,
        error: null,
        docked: false,
        loading: false,
        sessionId,
        profileKey: live.profileKey,
        socksPort: live.socksPort,
        webviewLabel: live.webviewLabel,
        tabs: live.tabs,
        activeTabId: live.activeTabId,
        url: live.url,
        pageTitle: live.pageTitle,
        canGoBack: live.canGoBack,
        canGoForward: live.canGoForward,
      });
      await ensurePageListener(set, get);
      await ensureMainRestoredListener(get);
      void get().loadChromeData();
      const bounds = readContentSlotBounds();
      const tabId = get().activeTabId ?? "default";
      if (warm && isTauriRuntime()) {
        try {
          const result = await invoke<BrowserEnsureResult>(
            "browser_activate_tab",
            {
              request: {
                session_id: sessionId,
                tab_id: tabId,
                x: bounds?.x,
                y: bounds?.y,
                width: bounds?.width,
                height: bounds?.height,
              },
            },
          );
          traceBrowser("webview-ready");
          set({
            webviewLabel: result.webview_label,
            profileKey: result.profile_key,
            socksPort: result.socks_port,
            docked: Boolean(bounds),
          });
          markBucketWarm(sessionId, {
            webviewLabel: result.webview_label,
            profileKey: result.profile_key,
            socksPort: result.socks_port,
          });
          // Recreated blank surface → must navigate. Existing surface → re-sync
          // bounds after layout so WK does not stay black after hide→show.
          if (result.created) {
            const target = get().url.trim();
            if (target) await get().navigate(target);
          } else {
            await new Promise<void>((r) =>
              requestAnimationFrame(() => requestAnimationFrame(() => r())),
            );
            const again = readContentSlotBounds() ?? bounds;
            if (again) {
              traceBrowser("bounds");
              await get().syncBounds(again);
            }
            await setBrowserSurfaceVisible(result.webview_label, true);
          }
          return;
        } catch {
          // fall through to ensure
        }
      }
      traceBrowser("webview-prepare");
      await get().ensureForSession(sessionId, bounds);
      traceBrowser("webview-ready");
      // ensure may have created a blank webview — reload the warm URL.
      const target = get().url.trim();
      if (target && (bucket.warm || (live.tabs.find((t) => t.id === live.activeTabId)?.navStack.length ?? 0) > 0)) {
        await get().navigate(target);
      }
    },

    minimize: async () => {
      if (!get().open) return;
      const label = get().webviewLabel;
      set({ minimized: true });
      await setBrowserSurfaceVisible(label, false);
    },

    restore: async () => {
      if (!get().open) return;
      set({ minimized: false });
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => resolve());
        });
      });
      const label = get().webviewLabel;
      let bounds = readContentSlotBounds();
      if (!bounds) {
        await new Promise((r) => setTimeout(r, 32));
        bounds = readContentSlotBounds();
      }
      if (bounds) {
        await get().syncBounds(bounds);
      }
      await setBrowserSurfaceVisible(label, true);
      bounds = readContentSlotBounds() ?? bounds;
      if (bounds) {
        await get().syncBounds(bounds);
      }
    },

    close: async () => {
      const state = get();
      flushLiveToBucket(state);
      const { sessionId, webviewLabel } = state;
      ensureInFlight = null;
      ensureInFlightSession = null;
      set({
        open: false,
        minimized: false,
        sessionId: null,
        profileKey: null,
        socksPort: null,
        webviewLabel: null,
        error: null,
        ensuring: false,
        loading: false,
        docked: false,
        pageTitle: "",
        canGoBack: false,
        canGoForward: false,
        suggestions: [],
      });
      await setBrowserSurfaceVisible(webviewLabel, false);
      await shutdownBrowser(sessionId);
      await setBrowserSurfaceVisible(webviewLabel, false);
    },

    park: async () => {
      const state = get();
      if (!state.open && !state.webviewLabel) {
        return;
      }
      flushLiveToBucket(state);
      const sessionId = state.sessionId;
      const label = state.webviewLabel;
      set({ open: false, minimized: false, docked: false });
      if (isTauriRuntime()) {
        if (sessionId) {
          try {
            await invoke("browser_hide_session", {
              request: { session_id: sessionId },
            });
          } catch {
            await setBrowserSurfaceVisible(label, false);
          }
        } else {
          await setBrowserSurfaceVisible(label, false);
        }
      }
    },

    discardSessionBucket: (sessionId) => {
      sessionBuckets.delete(sessionId);
    },

    selectTab: (tabId) => {
      const { tabs, activeTabId, sessionId } = get();
      if (tabId === activeTabId) return;
      flushLiveToBucket(get());
      const tab = tabs.find((t) => t.id === tabId);
      if (!tab) return;
      set({
        activeTabId: tabId,
        url: tab.url,
        pageTitle: tab.title,
        canGoBack: tabCanGoBack(tab),
        canGoForward: tabCanGoForward(tab),
      });
      if (sessionId) flushLiveToBucket(get());
      if (!get().open || get().minimized || !sessionId) return;
      // Activate existing tab webview — do not navigate (preserve page state).
      void (async () => {
        const bounds = readContentSlotBounds();
        if (!isTauriRuntime()) {
          set({ webviewLabel: get().webviewLabel ?? "host-browser-e2e" });
          return;
        }
        try {
          const result = await invoke<BrowserEnsureResult>(
            "browser_activate_tab",
            {
              request: {
                session_id: sessionId,
                tab_id: tabId,
                x: bounds?.x,
                y: bounds?.y,
                width: bounds?.width,
                height: bounds?.height,
              },
            },
          );
          set({
            webviewLabel: result.webview_label,
            profileKey: result.profile_key,
            socksPort: result.socks_port,
            docked: Boolean(bounds),
          });
        } catch (err) {
          set({ error: formatAppError(err) });
        }
      })();
    },

    closeTab: (tabId) => {
      const { tabs, activeTabId, sessionId } = get();
      if (tabs.length <= 1) return;
      const nextTabs = tabs.filter((t) => t.id !== tabId);
      let nextActive = activeTabId;
      if (activeTabId === tabId) {
        const idx = tabs.findIndex((t) => t.id === tabId);
        nextActive = nextTabs[Math.max(0, idx - 1)]?.id ?? nextTabs[0].id;
      }
      const tab = nextTabs.find((t) => t.id === nextActive)!;
      set({
        tabs: nextTabs,
        activeTabId: nextActive,
        url: tab.url,
        pageTitle: tab.title,
        canGoBack: tabCanGoBack(tab),
        canGoForward: tabCanGoForward(tab),
      });
      if (sessionId) flushLiveToBucket(get());
      if (sessionId && isTauriRuntime()) {
        void invoke("browser_close_tab", {
          request: { session_id: sessionId, tab_id: tabId },
        }).catch(() => undefined);
      }
      if (activeTabId === tabId && get().open && !get().minimized && sessionId) {
        void (async () => {
          const bounds = readContentSlotBounds();
          if (!isTauriRuntime()) return;
          try {
            const result = await invoke<BrowserEnsureResult>(
              "browser_activate_tab",
              {
                request: {
                  session_id: sessionId,
                  tab_id: nextActive!,
                  x: bounds?.x,
                  y: bounds?.y,
                  width: bounds?.width,
                  height: bounds?.height,
                },
              },
            );
            set({ webviewLabel: result.webview_label });
          } catch {
            // ignore
          }
        })();
      }
    },

    newTab: (url) => {
      const sessionId = get().sessionId;
      if (!sessionId) return;
      flushLiveToBucket(get());
      // Blank new tab — do not copy the previous tab's URL (avoids both tabs
      // showing the same title when a late page-load event races).
      const tab = createBrowserTab(url ?? "", "");
      const tabs = [...get().tabs, tab];
      set({
        tabs,
        activeTabId: tab.id,
        url: tab.url,
        pageTitle: "",
        canGoBack: false,
        canGoForward: false,
      });
      flushLiveToBucket(get());
      if (url) {
        void get().navigate(url);
        return;
      }
      void (async () => {
        const bounds = readContentSlotBounds();
        if (!isTauriRuntime()) {
          set({ webviewLabel: get().webviewLabel ?? "host-browser-e2e" });
          return;
        }
        try {
          const result = await invoke<BrowserEnsureResult>(
            "browser_activate_tab",
            {
              request: {
                session_id: sessionId,
                tab_id: tab.id,
                x: bounds?.x,
                y: bounds?.y,
                width: bounds?.width,
                height: bounds?.height,
              },
            },
          );
          set({
            webviewLabel: result.webview_label,
            profileKey: result.profile_key,
            socksPort: result.socks_port,
            docked: Boolean(bounds),
          });
        } catch (err) {
          set({ error: formatAppError(err) });
        }
      })();
    },
    ensureForSession: async (sessionId, bounds) => {
      if (!sessionId) return;
      if (ensureInFlight && ensureInFlightSession === sessionId && !bounds) {
        await ensureInFlight;
        return;
      }

      const run = (async () => {
        const prev = get();
        if (prev.sessionId && prev.sessionId !== sessionId) {
          flushLiveToBucket(prev);
          // Keep the other host's SOCKS/webviews alive — only hide.
          if (isTauriRuntime()) {
            try {
              await invoke("browser_hide_session", {
                request: { session_id: prev.sessionId },
              });
            } catch {
              await setBrowserSurfaceVisible(prev.webviewLabel, false);
            }
          }
        }
        const live = liveFromBucket(bucketFor(sessionId));
        const tabId = live.activeTabId ?? "default";
        set({ ensuring: true, error: null, sessionId, ...live });
        try {
          if (!isTauriRuntime()) {
            set({
              ensuring: false,
              profileKey: `e2e@mock:22`,
              socksPort: 0,
              webviewLabel: "host-browser-e2e",
              docked: true,
            });
            await get().loadChromeData();
            return;
          }
          await ensurePageListener(set, get);
          await ensureMainRestoredListener(get);
          const result = await invoke<BrowserEnsureResult>("browser_ensure", {
            request: {
              session_id: sessionId,
              tab_id: tabId,
              x: bounds?.x,
              y: bounds?.y,
              width: bounds?.width,
              height: bounds?.height,
            },
          });
          // Hide siblings; show this tab.
          try {
            await invoke("browser_activate_tab", {
              request: {
                session_id: sessionId,
                tab_id: tabId,
                x: bounds?.x,
                y: bounds?.y,
                width: bounds?.width,
                height: bounds?.height,
              },
            });
          } catch {
            // first tab — ensure already showed it
          }
          set({
            ensuring: false,
            sessionId: result.session_id,
            profileKey: result.profile_key,
            socksPort: result.socks_port,
            webviewLabel: result.webview_label,
            error: null,
            docked: Boolean(
              bounds && bounds.width >= 32 && bounds.height >= 32,
            ),
          });
          markBucketWarm(sessionId, {
            webviewLabel: result.webview_label,
            profileKey: result.profile_key,
            socksPort: result.socks_port,
          });
          flushLiveToBucket(get());
          await get().loadChromeData();
        } catch (err) {
          set({
            ensuring: false,
            error: formatAppError(err),
          });
        }
      })();

      ensureInFlightSession = sessionId;
      ensureInFlight = run.finally(() => {
        if (ensureInFlightSession === sessionId) {
          ensureInFlight = null;
          ensureInFlightSession = null;
        }
      });
      await ensureInFlight;
    },

    navigate: async (url) => {
      resetBrowserTrace();
      traceBrowser("navigate");
      const trimmed = url.trim();
      if (!trimmed) return;
      if (get().minimized) {
        await get().restore();
      }
      const withScheme = /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(trimmed)
        ? trimmed
        : `http://${trimmed}`;

      const state = get();
      const activeId = state.activeTabId;
      let nextTabs = state.tabs;
      if (activeId) {
        const current = state.tabs.find((t) => t.id === activeId);
        if (current) {
          const updated = pushTabNav(current, withScheme);
          nextTabs = state.tabs.map((t) => (t.id === activeId ? updated : t));
          set({
            url: withScheme,
            error: null,
            loading: true,
            tabs: nextTabs,
            pageTitle: updated.title,
          });
          syncNavFlagsFromTab(set, updated);
        } else {
          set({ url: withScheme, error: null, loading: true });
        }
      } else {
        set({ url: withScheme, error: null, loading: true });
      }
      flushLiveToBucket(get());

      const { sessionId, profileKey } = get();
      if (!sessionId) {
        set({
          loading: false,
          error: "No SSH session — connect a host first",
        });
        return;
      }
      if (!isTauriRuntime()) {
        set({ loading: false });
        return;
      }

      if (!profileKey) {
        const b = readContentSlotBounds();
        await get().ensureForSession(sessionId, b);
      }

      const bounds = readContentSlotBounds();
      if (!bounds) {
        set({
          loading: false,
          error: "Browser panel is too small to dock — widen the panel",
        });
        return;
      }

      try {
        const label = get().webviewLabel;
        if (label) {
          traceBrowser("bounds");
          await invoke("browser_set_webview_bounds", {
            request: {
              webview_label: label,
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: bounds.height,
            },
          });
        }

        traceBrowser("navigate-issued");
        await invoke("browser_navigate", {
          request: {
            session_id: sessionId,
            profile_key: get().profileKey ?? "",
            tab_id: get().activeTabId ?? "default",
            url: withScheme,
            x: bounds.x,
            y: bounds.y,
            width: bounds.width,
            height: bounds.height,
          },
        });
        const native = get();
        if (native.webviewLabel && native.profileKey != null && native.socksPort != null) {
          markBucketWarm(sessionId, {
            webviewLabel: native.webviewLabel,
            profileKey: native.profileKey,
            socksPort: native.socksPort,
          });
        }
        flushLiveToBucket({ ...get(), warm: true });
        // Keep loading until host-browser-load finished / host-browser-page —
        // navigate IPC returns when WKWebView starts loading, not when paint completes.
        set({ docked: true, error: null });
      } catch (err) {
        set({ loading: false, error: formatAppError(err) });
      }
    },

    goBack: async () => {
      const label = get().webviewLabel;
      if (!label || !get().canGoBack) return;
      const activeId = get().activeTabId;
      const tab = get().tabs.find((t) => t.id === activeId);
      if (!tab || tab.navIndex <= 0) return;
      const navIndex = tab.navIndex - 1;
      const url = tab.navStack[navIndex] ?? tab.url;
      const updated = { ...tab, navIndex, url };
      set({
        tabs: patchActiveTab(get().tabs, activeId, updated),
        url,
        loading: true,
      });
      syncNavFlagsFromTab(set, updated);
      flushLiveToBucket(get());
      if (!isTauriRuntime()) {
        set({ loading: false });
        return;
      }
      try {
        await invoke("browser_back", {
          request: { webview_label: label },
        });
      } catch (err) {
        set({ error: formatAppError(err), loading: false });
      }
    },

    goForward: async () => {
      const label = get().webviewLabel;
      if (!label || !get().canGoForward) return;
      const activeId = get().activeTabId;
      const tab = get().tabs.find((t) => t.id === activeId);
      if (!tab || tab.navIndex >= tab.navStack.length - 1) return;
      const navIndex = tab.navIndex + 1;
      const url = tab.navStack[navIndex] ?? tab.url;
      const updated = { ...tab, navIndex, url };
      set({
        tabs: patchActiveTab(get().tabs, activeId, updated),
        url,
        loading: true,
      });
      syncNavFlagsFromTab(set, updated);
      flushLiveToBucket(get());
      if (!isTauriRuntime()) {
        set({ loading: false });
        return;
      }
      try {
        await invoke("browser_forward", {
          request: { webview_label: label },
        });
      } catch (err) {
        set({ error: formatAppError(err), loading: false });
      }
    },

    reload: async () => {
      const label = get().webviewLabel;
      if (!label) return;
      if (!isTauriRuntime()) return;
      set({ loading: true });
      try {
        await invoke("browser_reload", {
          request: { webview_label: label },
        });
        // loading cleared by host-browser-load finished
      } catch (err) {
        set({ loading: false, error: formatAppError(err) });
      }
    },

    toggleBookmark: async () => {
      const { url, profileKey, pageTitle, bookmarks } = get();
      if (!profileKey || !url) return;
      const existing = isBookmarked(bookmarks, url, profileKey);
      if (!isTauriRuntime()) {
        if (existing) {
          set({
            bookmarks: bookmarks.filter((b) => b.id !== existing.id),
          });
        } else {
          set({
            bookmarks: [
              {
                id: `e2e-${Date.now()}`,
                url,
                title: pageTitle || url,
                profile_key: profileKey,
                created_at: Date.now(),
              },
              ...bookmarks,
            ],
          });
        }
        return;
      }
      try {
        if (existing) {
          await invoke("browser_bookmark_remove", {
            request: { id: existing.id },
          });
        } else {
          await invoke("browser_bookmark_upsert", {
            request: {
              profile_key: profileKey,
              url,
              title: pageTitle || url,
            },
          });
        }
        await get().loadChromeData();
      } catch (err) {
        set({ error: formatAppError(err) });
      }
    },

    removeBookmark: async (id) => {
      if (!isTauriRuntime()) {
        set({ bookmarks: get().bookmarks.filter((b) => b.id !== id) });
        return;
      }
      try {
        await invoke("browser_bookmark_remove", { request: { id } });
        await get().loadChromeData();
      } catch (err) {
        set({ error: formatAppError(err) });
      }
    },

    clearHistory: async () => {
      const profileKey = get().profileKey;
      if (!isTauriRuntime()) {
        set({ history: [], suggestions: [] });
        return;
      }
      try {
        await invoke("browser_history_clear", {
          request: { profile_key: profileKey },
        });
        await get().loadChromeData();
      } catch (err) {
        set({ error: formatAppError(err) });
      }
    },

    syncBounds: async (bounds) => {
      if (!isTauriRuntime()) return;
      if (nativeHeld || get().minimized) return;
      if (bounds.width < 32 || bounds.height < 32) return;
      pendingBounds = bounds;
      if (!boundsInFlight) {
        boundsInFlight = (async () => {
          while (pendingBounds) {
            if (nativeHeld || get().minimized) {
              pendingBounds = null;
              break;
            }
            const next = pendingBounds;
            pendingBounds = null;
            const { sessionId, webviewLabel } = get();
            if (sessionId && !webviewLabel) {
              await get().ensureForSession(sessionId, next);
            }
            if (nativeHeld || get().minimized) break;
            const label = get().webviewLabel;
            if (!label) continue;
            try {
              await invoke("browser_set_webview_bounds", {
                request: {
                  webview_label: label,
                  x: next.x,
                  y: next.y,
                  width: next.width,
                  height: next.height,
                },
              });
              if (!nativeHeld && !get().minimized) {
                set({ docked: true });
              }
            } catch (err) {
              set({ error: formatAppError(err) });
            }
          }
        })().finally(() => {
          boundsInFlight = null;
          const leftover = pendingBounds;
          if (leftover && !nativeHeld && !get().minimized) {
            void get().syncBounds(leftover);
          }
        });
      }
    },

    setNativeVisible: (visible) => {
      nativeHeld = !visible;
      if (!visible) {
        pendingBounds = null;
        void setBrowserSurfaceVisible(get().webviewLabel, false);
      }
    },
  };
});
