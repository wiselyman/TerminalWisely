import { useEffect, useRef, useState, useMemo, useCallback, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { SudoPasswordModal } from "./components/SudoPasswordModal";
import { SendToDialog } from "./components/SendToDialog";
import { PreviewPanel } from "./components/PreviewPanel";
import { FindPanel } from "./components/FindPanel";
import { FindTool } from "./components/FindTool";
import { HostStatsStatusBar } from "./components/hostStats/HostStatsStatusBar";
import { CommandNavigatorPanel } from "./components/CommandNavigatorPanel";
import { CommandNavigatorTool } from "./components/CommandNavigatorTool";
import { TaskManagerTool } from "./components/TaskManagerTool";
import { AiEngineerTool } from "./components/aiEngineer/AiEngineerTool";
import { AiEngineerPanel } from "./components/aiEngineer/AiEngineerPanel";
import { TaskManagerPanel } from "./components/TaskManagerPanel";
import { TransferPanel } from "./components/TransferPanel";
import { TerminalView } from "./components/TerminalView";
import { ToastContainer } from "./components/ToastContainer";
import { WorkspaceWelcome } from "./components/WorkspaceWelcome";
import { extractDroppedPaths } from "./lib/terminalLinks";
import { getTerminalFontFamily, ensureTerminalFontsLoaded } from "./lib/terminalFont";
import {
  hasLocalFileDrop,
  hasRemoteDrag,
  parseRemoteDrag,
} from "./lib/remoteDrag";
import { dropEffectForKind } from "./lib/dragVisual";
import { uploadLocalPathsToSession } from "./lib/sessionUpload";
import { formatTransferError } from "./lib/transferError";
import { formatAppError } from "./lib/formatAppError";
import { startTabPointerReorder } from "./lib/tabPointerReorder";
import { isSudoRequiredError } from "./stores/previewStore";
import {
  extractPathFromSudoError,
  requestSudoPassword,
} from "./stores/sudoPromptStore";
import { useSessionStore } from "./stores/sessionStore";
import { useAiEngineerStore } from "./stores/aiEngineerStore";
import { useHostStatsStore } from "./stores/hostStatsStore";
import { switchWorkspacePanel } from "./stores/workspacePanelSwitch";
import { useCommandNavigatorStore } from "./stores/commandNavigatorStore";
import { useFindStore } from "./stores/findStore";
import { useTaskManagerStore } from "./stores/taskManagerStore";
import { useToastStore } from "./stores/toastStore";
import type { TransferCompletePayload, TransferProgressPayload, SessionMetadataUpdatedPayload } from "./types";
import { resolveSessionOsProfile } from "./lib/sessionOsProfile";
import { TabDirectoryShortcuts } from "./components/TabShortcutMenu";
import { TabContextMenu } from "./components/TabContextMenu";
import { ServerOsIcon } from "./components/ServerOsIcon";
import {
  TabHomeIcon,
  ChromePlusIcon,
  SidebarToggleIcon,
} from "./components/SidebarIcons";
import { getPlatformShellClass, isMacHost } from "./lib/hostOs";
import { isTauriRuntime } from "./lib/isTauri";
import { WindowControls } from "./components/WindowControls";
import { suppressBrowserContextMenu } from "./lib/suppressBrowserContextMenu";
import { resolveTabContextMenuTarget } from "./lib/tabContextMenuTarget";
import { bindOutsideTerminalMouseCleanup, armChromeClickSuppress, clearChromeClickSuppress, noteIntentionalTabLeftMouseDown, isIntentionalTabLeftClick } from "./lib/terminalSelectionDrag";
import {
  SIDEBAR_COLLAPSED_STORAGE_KEY,
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_WIDTH_STORAGE_KEY,
  clampSidebarWidth,
  loadSidebarWidth,
} from "./lib/sidebarLayout";
import "./App.css";

const SIDEBAR_STORAGE_KEY = SIDEBAR_COLLAPSED_STORAGE_KEY;

function App() {
  const { t } = useTranslation("shell");
  const platformClass = getPlatformShellClass();
  const macWindowChrome = isMacHost();
  const tauriDragRegion = isTauriRuntime() ? true : undefined;
  const {
    tabs,
    activeTabId,
    savedConnections,
    closeTab,
    closeOtherTabs,
    closeTabsToLeft,
    closeTabsToRight,
    setActiveTab,
    activateHome,
    reorderTabs,
    activeTransfers,
    upsertTransfer,
    removeTransfer,
    cancelTransfer,
    startRemoteTransfer,
  } = useSessionStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const goToHomeDirectory = (sessionId: string) => {
    void invoke("enter_directory", {
      request: { session_id: sessionId, path: "~" },
    }).catch((err) => {
      pushToast(formatAppError(err), false);
    });
  };
  const transferList = useMemo(
    () => Object.values(activeTransfers),
    [activeTransfers],
  );
  const sessionTitles = useMemo(
    () =>
      Object.fromEntries(tabs.map((tab) => [tab.id, tab.title])) as Record<
        string,
        string
      >,
    [tabs],
  );

  useEffect(() => {
    void useSessionStore.getState().hydrateFromBackend();
  }, []);

  // Do NOT prewarm AI sidecar here. First launch creates a private venv + pip
  // install (1–3 min) and a sync ensure_ai_sidecar would starve other IPC —
  // white window + busy cursor until done. Sidecar starts when the AI panel opens.

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void listen<SessionMetadataUpdatedPayload>(
      "session-metadata-updated",
      (event) => {
        const payload = event.payload;
        useSessionStore.getState().updateSessionMetadata(payload.session_id, {
          os_id: payload.os_id,
          os_name: payload.os_name,
          remote_home: payload.remote_home,
        });
        void useSessionStore.getState().loadSavedConnections();
      },
    ).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    void ensureTerminalFontsLoaded().then(() => {
      document.documentElement.style.setProperty(
        "--tw-mono-font",
        getTerminalFontFamily(),
      );
    });
  }, []);

  useEffect(() => {
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void (async () => {
      const [progressUnlisten, completeUnlisten] = await Promise.all([
        listen<TransferProgressPayload>("transfer-progress", (event) => {
          upsertTransfer(event.payload);
        }),
        listen<TransferCompletePayload>("transfer-complete", (event) => {
          const payload = event.payload;
          if (
            !payload.success &&
            payload.direction === "send" &&
            isSudoRequiredError(payload.message)
          ) {
            const ctx = useSessionStore
              .getState()
              .takePendingSudoTransfer(payload.transfer_id);
            removeTransfer(payload.transfer_id);
            if (ctx) {
              void (async () => {
                try {
                  const password = await requestSudoPassword({
                    action: t("sudoActionSend"),
                    path:
                      extractPathFromSudoError(payload.message) || ctx.remotePath,
                  });
                  await useSessionStore
                    .getState()
                    .startRemoteTransfer(
                      ctx.fromSessionId,
                      ctx.remotePath,
                      ctx.toSessionId,
                      password,
                      ctx.remoteDir ?? null,
                    );
                } catch {
                  pushToast(t("toastSudoCancelled"), false);
                }
              })();
              return;
            }
          }
          useSessionStore
            .getState()
            .clearPendingSudoTransfer(payload.transfer_id);
          removeTransfer(payload.transfer_id);
          pushToast(formatAppError(payload.message), payload.success);
        }),
      ]);

      if (disposed) {
        progressUnlisten();
        completeUnlisten();
        return;
      }

      unlisteners.push(progressUnlisten, completeUnlisten);
    })();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [pushToast, removeTransfer, upsertTransfer]);
  const [tabDropTargetId, setTabDropTargetId] = useState<string | null>(null);
  const [tabDropKind, setTabDropKind] = useState<"local" | "remote" | null>(
    null,
  );
  const [tabReorderDragId, setTabReorderDragId] = useState<string | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const tabReorderCleanupRef = useRef<(() => void) | null>(null);
  const suppressTabClickUntilRef = useRef(0);
  const tabPointerButtonRef = useRef(0);
  const skipTabBarContextMenuRef = useRef(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1",
  );
  const [sidebarExpandedWidth, setSidebarExpandedWidth] = useState(loadSidebarWidth);
  const [windowFullscreen, setWindowFullscreen] = useState(false);
  const [terminalSize, setTerminalSize] = useState({ cols: 120, rows: 32 });
  const tabBarRef = useRef<HTMLDivElement>(null);
  const openNewRemoteRef = useRef<() => void>(() => {});
  const registerNewRemote = useCallback((open: () => void) => {
    openNewRemoteRef.current = open;
  }, []);
  const aiEngineerOpen = useAiEngineerStore((s) => s.open);
  const taskManagerOpen = useTaskManagerStore((s) => s.open);
  const fetchProcesses = useTaskManagerStore((s) => s.fetchProcesses);
  const findOpen = useFindStore((s) => s.open);
  const openFind = useFindStore((s) => s.openFind);
  const loadSessionCwd = useFindStore((s) => s.loadSessionCwd);
  const fetchHostStats = useHostStatsStore((s) => s.fetchStats);
  const resetHostStats = useHostStatsStore((s) => s.resetForSession);
  const commandNavOpen = useCommandNavigatorStore((s) => s.open);
  const workspacePanelWidth = useTaskManagerStore((s) => s.width);
  const workspacePanelOpen =
    aiEngineerOpen || taskManagerOpen || findOpen || commandNavOpen;

  const sidebarWidth = sidebarCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : sidebarExpandedWidth;

  const terminalLayoutRevision = useMemo(
    () => `${sidebarCollapsed}-${sidebarWidth}`,
    [sidebarCollapsed, sidebarWidth],
  );

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!isTauriRuntime()) return;
    const win = getCurrentWindow();
    let disposed = false;
    const sync = () => {
      void win.isFullscreen().then((fs) => {
        if (!disposed) setWindowFullscreen(fs);
      });
    };
    sync();
    let unlisten: (() => void) | undefined;
    void win.onResized(() => sync()).then((fn) => {
      if (disposed) fn();
      else unlisten = fn;
    });
    const onVis = () => sync();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      disposed = true;
      unlisten?.();
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  useEffect(() => {
    if (!sidebarCollapsed) {
      localStorage.setItem(
        SIDEBAR_WIDTH_STORAGE_KEY,
        String(clampSidebarWidth(sidebarExpandedWidth)),
      );
    }
  }, [sidebarCollapsed, sidebarExpandedWidth]);

  useEffect(() => {
    const updateSize = () => {
      const width = Math.max(window.innerWidth - sidebarWidth - 32, 400);
      const height = Math.max(window.innerHeight - 96, 300);
      setTerminalSize({
        cols: Math.floor(width / 9),
        rows: Math.floor(height / 18),
      });
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [sidebarWidth]);

  const clearTabReorderState = () => {
    setTabReorderDragId(null);
  };

  useEffect(() => {
    return () => {
      tabReorderCleanupRef.current?.();
      tabReorderCleanupRef.current = null;
    };
  }, []);

  const startTabReorder = (
    tabId: string,
    event: Pick<ReactMouseEvent, "button" | "clientX" | "clientY" | "target">,
  ) => {
    if (event.button !== 0) return;
    if (
      (event.target as HTMLElement).closest(
        ".tab-close, .tab-home, .tab-shortcut-folder, .tab-shortcut-add, .tab-shortcut-wrap, .tab-shortcut-icons",
      )
    ) {
      return;
    }

    const tabElement = (event.target as HTMLElement).closest<HTMLElement>(
      ".tab[data-session-id]",
    );
    if (!tabElement) return;

    tabReorderCleanupRef.current?.();
    tabReorderCleanupRef.current = startTabPointerReorder({
      tabId,
      tabElement,
      startX: event.clientX,
      startY: event.clientY,
      onDragStart: () => {
        setTabReorderDragId(tabId);
      },
      onPreview: (_target) => {},
      onReorder: (dragId, targetId, position) => {
        reorderTabs(dragId, targetId, position);
      },
      onEnd: () => {
        tabReorderCleanupRef.current = null;
        clearTabReorderState();
      },
    });
  };

  useEffect(() => {
    const activeTab = tabBarRef.current?.querySelector(".tab.active");
    activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

  const activeSessionTitle =
    activeTabId != null ? sessionTitles[activeTabId] : undefined;
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [activeTabId, tabs],
  );
  const activeTabReady =
    activeTab != null && (activeTab.connectionStatus ?? "ready") === "ready";
  const activeTabServerId =
    activeTab?.server_id ?? activeTabId ?? "";
  const activeTabDisconnected = useSessionStore((state) =>
    activeTabId != null ? state.disconnectedSessionIds.has(activeTabId) : false,
  );

  useEffect(() => {
    if (!taskManagerOpen || !activeTabId || !activeTab || activeTabDisconnected) {
      if (activeTabDisconnected && taskManagerOpen) {
        useTaskManagerStore.setState({
          loading: false,
          portsLoading: false,
        });
      }
      return;
    }

    void fetchProcesses(activeTabId, {
      initial: true,
      kind: activeTab.kind,
    });

    const basicTimer = window.setInterval(() => {
      void fetchProcesses(activeTabId, {
        kind: activeTab.kind,
        refresh: "basic",
      });
    }, 2000);

    const portsTimer = window.setInterval(() => {
      void fetchProcesses(activeTabId, {
        kind: activeTab.kind,
        refresh: "ports",
      });
    }, 8000);

    return () => {
      window.clearInterval(basicTimer);
      window.clearInterval(portsTimer);
    };
  }, [activeTab, activeTabDisconnected, activeTabId, fetchProcesses, taskManagerOpen]);

  useEffect(() => {
    if (!findOpen || !activeTabId) return;

    const { activeSessionId, activateSession } = useFindStore.getState();
    if (activeSessionId !== activeTabId) {
      activateSession(activeTabId);
    } else {
      void loadSessionCwd(activeTabId);
    }

    const timer = window.setInterval(() => {
      const { followTerminalCwd } = useFindStore.getState();
      if (followTerminalCwd) {
        void loadSessionCwd(activeTabId);
      }
    }, 2000);

    return () => window.clearInterval(timer);
  }, [activeTabId, findOpen, loadSessionCwd]);


  useEffect(() => {
    if (!activeTabId || activeTabDisconnected) {
      resetHostStats();
      return;
    }

    resetHostStats();
    void fetchHostStats(activeTabId, { initial: true });
    const timer = window.setInterval(() => {
      void fetchHostStats(activeTabId);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [
    activeTabDisconnected,
    activeTabId,
    fetchHostStats,
    resetHostStats,
  ]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "f") {
        return;
      }

      const target = event.target;
      if (
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target.closest("input, textarea, select, [contenteditable='true']"))
      ) {
        return;
      }

      if (!activeTabId) return;

      event.preventDefault();
      openFind(activeTabId);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId, openFind]);

  useEffect(() => {
    document.addEventListener("contextmenu", suppressBrowserContextMenu);
    return () =>
      document.removeEventListener("contextmenu", suppressBrowserContextMenu);
  }, []);

  useEffect(() => {
    const onArmTabRightClick = (event: MouseEvent) => {
      if (event.button !== 2) return;
      if (!resolveTabContextMenuTarget(event.target)) return;
      tabPointerButtonRef.current = 2;
      armChromeClickSuppress(1000);
      suppressTabClickUntilRef.current = Date.now() + 1000;
    };

    document.addEventListener("mousedown", onArmTabRightClick, true);
    return () =>
      document.removeEventListener("mousedown", onArmTabRightClick, true);
  }, []);

  useEffect(() => {
    const blockSpuriousTabClick = (event: MouseEvent) => {
      if (Date.now() >= suppressTabClickUntilRef.current) return;
      if (isIntentionalTabLeftClick(event.target)) return;
      if (!(event.target instanceof HTMLElement)) return;
      if (!event.target.closest(".tab[data-session-id]")) return;
      event.preventDefault();
      event.stopImmediatePropagation();
    };

    document.addEventListener("click", blockSpuriousTabClick, true);
    return () =>
      document.removeEventListener("click", blockSpuriousTabClick, true);
  }, []);

  useEffect(() => bindOutsideTerminalMouseCleanup(), []);

  useEffect(() => {
    const bar = tabBarRef.current;
    if (!bar) return;

    const openTabContextMenu = (event: MouseEvent, tabEl: HTMLElement) => {
      const tabId = tabEl.dataset.sessionId;
      if (!tabId) return;

      event.preventDefault();
      event.stopPropagation();

      tabPointerButtonRef.current = 2;
      armChromeClickSuppress(1000);
      suppressTabClickUntilRef.current = Date.now() + 1000;
      setActiveTab(tabId);
      setTabContextMenu({
        tabId,
        x: event.clientX,
        y: event.clientY,
      });
    };

    const onTabBarMouseDown = (event: MouseEvent) => {
      if (event.button !== 2) return;

      const tabEl = resolveTabContextMenuTarget(event.target);
      if (!tabEl) return;

      skipTabBarContextMenuRef.current = true;
      openTabContextMenu(event, tabEl);
    };

    const onTabBarContextMenu = (event: MouseEvent) => {
      if (skipTabBarContextMenuRef.current) {
        event.preventDefault();
        event.stopPropagation();
        skipTabBarContextMenuRef.current = false;
        return;
      }

      const tabEl = resolveTabContextMenuTarget(event.target);
      if (!tabEl) return;

      openTabContextMenu(event, tabEl);
    };

    bar.addEventListener("mousedown", onTabBarMouseDown, true);
    bar.addEventListener("contextmenu", onTabBarContextMenu, true);
    return () => {
      bar.removeEventListener("mousedown", onTabBarMouseDown, true);
      bar.removeEventListener("contextmenu", onTabBarContextMenu, true);
    };
  }, [setActiveTab, tabs.length]);

  const onTitlebarDoubleClick = () => {
    if (!isTauriRuntime()) return;
    void getCurrentWindow().toggleMaximize();
  };

  return (
    <div
      className={`app-shell ${platformClass} ${sidebarCollapsed ? "sidebar-collapsed" : ""}${windowFullscreen ? " window-fullscreen" : ""}${activeTabId && !activeTabDisconnected ? " has-host-stats-statusbar" : ""}`}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
          ...(workspacePanelOpen
            ? { "--workspace-panel-width": `${workspacePanelWidth}px` }
            : {}),
        } as CSSProperties
      }
    >
      <header className="chrome-titlebar">
            {macWindowChrome ? (
              <div
                className="chrome-titlebar-macos-controls chrome-titlebar-macos-traffic-spacer"
                aria-hidden
              />
            ) : null}
            <div className="chrome-titlebar-main">
              <button
                type="button"
                className="chrome-sidebar-toggle"
                onClick={() => setSidebarCollapsed((value) => !value)}
                aria-label={
                  sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")
                }
                title={
                  sidebarCollapsed ? t("expandSidebar") : t("collapseSidebar")
                }
              >
                <SidebarToggleIcon />
              </button>
              <div
                className={`tab-bar${tabReorderDragId ? " tab-bar-reordering" : ""}`}
                ref={tabBarRef}
                onWheel={(event) => {
                  if (!tabBarRef.current) return;
                  const bar = tabBarRef.current;
                  if (bar.scrollWidth <= bar.clientWidth) return;
                  bar.scrollLeft += event.deltaY + event.deltaX;
                  event.preventDefault();
                }}
              >
                <div
                  className={`tab tab-home-entry ${activeTabId === null ? "active" : ""}`}
                  data-tab-role="home"
                  onClick={() => {
                    if (tabPointerButtonRef.current !== 0) {
                      tabPointerButtonRef.current = 0;
                      return;
                    }
                    if (Date.now() < suppressTabClickUntilRef.current) return;
                    activateHome();
                  }}
                  onContextMenu={(event) => event.preventDefault()}
                >
                  {activeTabId === null ? (
                    <>
                      <span className="tab-curve tab-curve-start" aria-hidden="true" />
                      <span className="tab-curve tab-curve-end" aria-hidden="true" />
                    </>
                  ) : null}
                  <span className="tab-kind home" title={t("homeTabTitle")}>
                    <TabHomeIcon />
                  </span>
                  <span className="tab-title">{t("homeTabTitle")}</span>
                </div>
          {tabs.map((tab) => {
            const tabConnecting = (tab.connectionStatus ?? "ready") === "connecting";
            const tabOs = resolveSessionOsProfile(tab, savedConnections);
            return (
            <div
              key={tab.id}
              className={`tab ${tab.active ? "active" : ""} ${
                tabConnecting ? "tab-connecting" : ""
              } ${
                tabDropTargetId === tab.id ? "tab-drop-target" : ""
              } ${tabDropTargetId === tab.id && tabDropKind === "remote" ? "tab-drop-target-remote" : ""} ${
                tabReorderDragId === tab.id ? "tab-reorder-dragging" : ""
              }`}
              data-session-id={tab.id}
              data-tab-kind={tab.kind}
              data-drop-kind={
                tabDropTargetId === tab.id ? tabDropKind ?? undefined : undefined
              }
              onClick={() => {
                if (tabPointerButtonRef.current !== 0) {
                  tabPointerButtonRef.current = 0;
                  return;
                }
                if (Date.now() < suppressTabClickUntilRef.current) return;
                setActiveTab(tab.id);
              }}
              onMouseDown={(event) => {
                tabPointerButtonRef.current = event.button;
                if (event.button === 0) {
                  clearChromeClickSuppress();
                  suppressTabClickUntilRef.current = 0;
                  noteIntentionalTabLeftMouseDown(tab.id);
                  setActiveTab(tab.id);
                  startTabReorder(tab.id, event);
                }
              }}
              onContextMenu={(event) => {
                // Handled by native tab-bar listener; block duplicate React path.
                event.preventDefault();
              }}
              onAuxClick={(event) => {
                if (event.button !== 0) {
                  event.preventDefault();
                  tabPointerButtonRef.current = event.button;
                  suppressTabClickUntilRef.current = Date.now() + 1000;
                }
              }}
              onDragOver={(event) => {
                if (tabReorderDragId) return;
                if (tabConnecting) return;

                const dataTransfer = event.dataTransfer;
                if (!dataTransfer) return;
                if (tab.kind !== "ssh") return;

                const remote = hasRemoteDrag(dataTransfer);
                const local = hasLocalFileDrop(dataTransfer);
                if (!remote && !local) return;

                event.preventDefault();
                event.stopPropagation();
                const kind = remote ? "remote" : "local";
                dataTransfer.dropEffect = dropEffectForKind(kind);
                setTabDropTargetId(tab.id);
                setTabDropKind(kind);
              }}
              onDragLeave={() => {
                setTabDropTargetId((current) => {
                  if (current === tab.id) {
                    setTabDropKind(null);
                    return null;
                  }
                  return current;
                });
              }}
              onDrop={(event) => {
                if (tabReorderDragId) return;
                if (tabConnecting) return;

                event.preventDefault();
                event.stopPropagation();
                setTabDropTargetId(null);
                setTabDropKind(null);
                if (tab.kind !== "ssh") return;

                const dataTransfer = event.dataTransfer;
                if (!dataTransfer) return;

                const remotePayload = parseRemoteDrag(dataTransfer);
                if (remotePayload) {
                  if (remotePayload.fromSessionId === tab.id) {
                    pushToast(t("toastCannotSendSameSession"), false);
                    return;
                  }
                  setActiveTab(tab.id);
                  void startRemoteTransfer(
                    remotePayload.fromSessionId,
                    remotePayload.remotePath,
                    tab.id,
                  ).catch((err) => {
                    pushToast(formatAppError(err), false);
                  });
                  return;
                }

                const paths = extractDroppedPaths(event);
                if (paths.length === 0) return;
                setActiveTab(tab.id);
                void uploadLocalPathsToSession(tab.id, paths)
                  .then((results) => {
                    const names = results.map((item) => item.filename).join(", ");
                    pushToast(t("toastUploadedTo", { title: tab.title, names }), true);
                  })
                  .catch((err) => {
                    pushToast(formatTransferError(err), false);
                  });
              }}
            >
              {tab.active ? (
                <>
                  <span className="tab-curve tab-curve-start" aria-hidden="true" />
                  <span className="tab-curve tab-curve-end" aria-hidden="true" />
                </>
              ) : null}
              <span
                className={`tab-kind ${tab.kind}`}
                title={tabOs.osName ?? tabOs.osId ?? "SSH"}
              >
                <ServerOsIcon
                  osId={tabOs.osId}
                  osName={tabOs.osName}
                  size={16}
                  showTitle={false}
                />
              </span>
              <span className="tab-title" title={tab.title}>
                {tabConnecting ? (
                  <span className="tab-connecting-dot" aria-hidden="true" />
                ) : null}
                {tab.title}
              </span>
              {tab.active && !tabConnecting ? (
                <span className="tab-actions">
                  <button
                    type="button"
                    className="tab-home"
                    title={t("goHomeTitle")}
                    aria-label={t("goHomeAria", { title: tab.title })}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setActiveTab(tab.id);
                      goToHomeDirectory(tab.id);
                    }}
                  >
                    <TabHomeIcon />
                  </button>
                  <TabDirectoryShortcuts
                    sessionId={tab.id}
                    tabKind={tab.kind}
                    serverId={tab.server_id ?? tab.title}
                    onActivateTab={() => setActiveTab(tab.id)}
                  />
                </span>
              ) : null}
              <button
                type="button"
                className="tab-close"
                onMouseDown={(event) => event.stopPropagation()}
                aria-label={t("closeTabAria", { title: tab.title })}
                onClick={(event) => {
                  event.stopPropagation();
                  void closeTab(tab.id);
                }}
              >
                ×
              </button>
            </div>
            );
          })}
              </div>
              <button
                type="button"
                className="chrome-new-session"
                aria-label={t("newSsh")}
                title={t("newSsh")}
                onClick={() => openNewRemoteRef.current()}
              >
                <ChromePlusIcon />
              </button>

          <div
            className="chrome-titlebar-drag"
            data-tauri-drag-region={tauriDragRegion ? "" : undefined}
            onDoubleClick={onTitlebarDoubleClick}
          />

              <div className="chrome-titlebar-actions">
                <AiEngineerTool
                  active={aiEngineerOpen}
                  disabled={!activeTabReady}
                  onClick={() => {
                    if (activeTabId) {
                      switchWorkspacePanel(
                        "aiEngineer",
                        activeTabId,
                        activeTabServerId,
                      );
                    }
                  }}
                />
                <TaskManagerTool
                  active={taskManagerOpen}
                  disabled={!activeTabReady}
                  onClick={() => {
                    if (activeTabId) {
                      switchWorkspacePanel("taskManager", activeTabId);
                    }
                  }}
                />
                <FindTool
                  active={findOpen}
                  disabled={!activeTabReady}
                  onClick={() => {
                    if (activeTabId) {
                      switchWorkspacePanel("find", activeTabId);
                    }
                  }}
                />
                <CommandNavigatorTool
                  active={commandNavOpen}
                  disabled={!activeTabReady}
                  onClick={() => {
                    if (activeTabId) {
                      switchWorkspacePanel("commandNav", activeTabId);
                    }
                  }}
                />
                <LocaleSwitcher />
              </div>

          {!macWindowChrome ? <WindowControls layout="windows" /> : null}
            </div>
          </header>

      <div className="app-body">
        <ConnectionPanel
          cols={terminalSize.cols}
          rows={terminalSize.rows}
          collapsed={sidebarCollapsed}
          expandedWidth={sidebarExpandedWidth}
          onExpandedWidthChange={setSidebarExpandedWidth}
          onRequestCollapse={() => setSidebarCollapsed(true)}
          onRegisterNewRemote={registerNewRemote}
        />

        <div className="workspace-frame">
          {tabContextMenu ? (
            <TabContextMenu
              x={tabContextMenu.x}
              y={tabContextMenu.y}
              tabIndex={tabs.findIndex((tab) => tab.id === tabContextMenu.tabId)}
              tabCount={tabs.length}
              onClose={() => setTabContextMenu(null)}
              onCloseTab={() => void closeTab(tabContextMenu.tabId)}
              onCloseOthers={() => void closeOtherTabs(tabContextMenu.tabId)}
              onCloseLeft={() => void closeTabsToLeft(tabContextMenu.tabId)}
              onCloseRight={() => void closeTabsToRight(tabContextMenu.tabId)}
            />
          ) : null}

          <main className="workspace">
            <div className="workspace-split">
              <div className="terminal-stack">
                {activeTabId === null ? <WorkspaceWelcome /> : null}
                {tabs.map((tab) => (
                  <TerminalView
                    key={tab.id}
                    sessionId={tab.id}
                    kind={tab.kind}
                    active={tab.id === activeTabId}
                    connectionStatus={tab.connectionStatus ?? "ready"}
                    title={tab.title}
                    layoutRevision={terminalLayoutRevision}
                  />
                ))}
              </div>
            </div>

            <TransferPanel
              transfers={transferList}
              sessionTitles={sessionTitles}
              onCancel={(transferId) => void cancelTransfer(transferId)}
            />
          </main>
        </div>
      </div>
      <SendToDialog />
      {activeTabId ? (
        <PreviewPanel
          sessionId={activeTabId}
          sessionTitle={activeSessionTitle}
        />
      ) : null}
      <ToastContainer />
      <SudoPasswordModal />
      {activeTabId && aiEngineerOpen ? (
        <AiEngineerPanel sessionId={activeTabId} serverId={activeTabServerId} />
      ) : null}
      {activeTabId && taskManagerOpen ? (
        <TaskManagerPanel
          sessionId={activeTabId}
          sessionTitle={activeSessionTitle ?? activeTabId}
        />
      ) : null}
      {activeTabId && findOpen ? (
        <FindPanel
          sessionId={activeTabId}
          sessionTitle={activeSessionTitle ?? activeTabId}
        />
      ) : null}
      {activeTabId && activeTab && commandNavOpen ? (
        <CommandNavigatorPanel
          sessionId={activeTabId}
          sessionTitle={activeSessionTitle ?? activeTabId}
          osId={activeTab.os_id}
          tabKind={activeTab.kind}
          serverId={activeTabServerId}
        />
      ) : null}
      {activeTabId && !activeTabDisconnected ? (
        <HostStatsStatusBar sessionId={activeTabId} />
      ) : null}
    </div>
  );
}

export default App;
