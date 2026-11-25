import { useEffect, useLayoutEffect, useRef, useState, useMemo, useCallback, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { listen } from "@tauri-apps/api/event";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { LocaleSwitcher } from "./components/LocaleSwitcher";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { AppSettingsDialog } from "./components/AppSettingsDialog";
import { UpdateAvailableDialog } from "./components/UpdateAvailableDialog";
import { SudoPasswordModal } from "./components/SudoPasswordModal";
import { SendToDialog } from "./components/SendToDialog";
import { PreviewPanel } from "./components/PreviewPanel";
import { HostStatsStatusBar } from "./components/hostStats/HostStatsStatusBar";
import { AiEngineerTool } from "./components/aiEngineer/AiEngineerTool";
import { AiEngineerPanel } from "./components/aiEngineer/AiEngineerPanel";
import { HomeWorkspace } from "./components/home/HomeWorkspace";
import { HomeHostDirectory } from "./components/home/HomeHostDirectory";
import { LocalFsTool } from "./components/LocalFsTool";
import { BrowserPanel } from "./components/browser/BrowserPanel";
import { DesktopAiWindow } from "./components/desktop/DesktopAiWindow";
import { MarkWiselyWindow } from "./components/desktop/MarkWiselyWindow";
import { EditorWiselyWindow } from "./components/desktop/EditorWiselyWindow";
import { FileWiselyWindow } from "./components/desktop/FileWiselyWindow";
import { DesktopPanel } from "./components/desktop/DesktopPanel";
import { DesktopTerminalWindow } from "./components/desktop/DesktopTerminalWindow";
import { FileManagerPanel } from "./components/desktop/FileManagerPanel";
import { ProcessManagerPanel } from "./components/desktop/ProcessManagerPanel";
import { TerminalView } from "./components/TerminalView";
import { LOCAL_CHAT_SESSION } from "./lib/aiEngineer/localTarget";
import { setDesktopChromeHost } from "./lib/desktopChromeHost";
import { useSidebarViewStore } from "./stores/sidebarViewStore";
import { useManagedEntityStore } from "./stores/managedEntityStore";
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
import {
  shouldKeepAiEngineerPanelMounted,
  shouldShowAiEngineerPanel,
} from "./lib/aiEngineer/panelVisibility";
import { useAiFiberSessions } from "./lib/aiEngineer/useAiFiberSessions";
import {
  closeDesktopRemembering,
  markHostAiShell,
} from "./stores/hostWorkspaceMemory";
import { useHostStatsStore } from "./stores/hostStatsStore";
import { switchWorkspacePanel, switchToAiEngineerPanel } from "./stores/workspacePanelSwitch";
import { useFindStore } from "./stores/findStore";
import { useTaskManagerStore } from "./stores/taskManagerStore";
import { useLocalFsStore } from "./stores/localFsStore";
import { useBrowserStore } from "./stores/browserStore";
import { useDesktopStore } from "./stores/desktopStore";
import { selectEntitySections, useEntityLayoutStore } from "./stores/entityLayoutStore";
import { useMarkWiselyStore } from "./stores/markWiselyStore";
import { useEditorWiselyStore } from "./stores/editorWiselyStore";
import { createFileOpenDrain } from "./lib/markdownOpenQueue";
import { openLocalFileInDesktop } from "./lib/localFileOpen";
import { isSshDesktopTarget } from "./lib/desktopTarget";
import { useToastStore } from "./stores/toastStore";
import { splitStartupNotice } from "./lib/startupNotice";
import type { SavedConnection, TransferCompletePayload, TransferProgressPayload, SessionMetadataUpdatedPayload } from "./types";
import { resolveSessionOsProfile } from "./lib/sessionOsProfile";
import { TabContextMenu } from "./components/TabContextMenu";
import { ServerOsIcon } from "./components/ServerOsIcon";
import {
  TabHomeIcon,
  ChromePlusIcon,
} from "./components/SidebarIcons";
import { SystemInfoIcon } from "./components/WorkspaceToolIcons";
import { getPlatformShellClass, isMacHost } from "./lib/hostOs";
import { isTauriRuntime } from "./lib/isTauri";
import { showManualUpdateCheckResult } from "./lib/updateCheckFeedback";
import { useAppUpdateStore } from "./stores/appUpdateStore";
import { openAppSettings } from "./stores/downloadSettingsStore";
import { WindowControls } from "./components/WindowControls";
import { suppressBrowserContextMenu } from "./lib/suppressBrowserContextMenu";
import { resolveTabContextMenuTarget } from "./lib/tabContextMenuTarget";
import { bindOutsideTerminalMouseCleanup, armChromeClickSuppress, clearChromeClickSuppress, noteIntentionalTabLeftMouseDown, isIntentionalTabLeftClick } from "./lib/terminalSelectionDrag";
import "./App.css";
import "./styles/tokens.css";
import "./styles/primitives.css";
import "./styles/shell.css";
import "./styles/home.css";
import "./styles/management.css";
import "./styles/ai-chat.css";
import "./styles/desktop.css";
import "./styles/files.css";
import "./styles/dialogs.css";

function App() {
  const { t } = useTranslation(["shell"]);
  const platformClass = getPlatformShellClass();
  const macWindowChrome = isMacHost();
  const tauriDragRegion = isTauriRuntime() ? true : undefined;
  const {
    tabs,
    activeTabId,
    savedConnections,
    savedConnectionsLoaded,
    closeTab,
    closeOtherTabs,
    closeTabsToLeft,
    closeTabsToRight,
    setActiveTab,
    activateHome,
    reorderTabs,
    upsertTransfer,
    removeTransfer,
    startRemoteTransfer,
  } = useSessionStore();
  const pushToast = useToastStore((s) => s.pushToast);
  useEffect(() => {
    void invoke<string[]>("take_catalog_restore_notice")
      .then((names) => {
        const notice = splitStartupNotice(names);
        if (notice.cleanupFailures.length > 0) {
          pushToast(t("catalogCleanupIncomplete", { items: notice.cleanupFailures.join(", ") }), false);
        }
        if (notice.restored.length > 0) {
          pushToast(t("catalogRestored", { files: notice.restored.join(", ") }), true);
        }
      })
      .catch(() => undefined);
  }, [pushToast, t]);
  const updateDialog = useAppUpdateStore((s) => s.dialog);
  const closeUpdateDialog = useAppUpdateStore((s) => s.closeDialog);
  const markUpdateInstalled = useAppUpdateStore((s) => s.markInstalled);
  const quietUpdateCheck = useAppUpdateStore((s) => s.quietCheck);
  const manualUpdateCheck = useAppUpdateStore((s) => s.manualCheck);

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

  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    const drainPendingFiles = createFileOpenDrain(
      () => invoke<string[]>("take_pending_file_opens"),
      async (path) => {
        if (cancelled) return;
        await openLocalFileInDesktop(path, {
          activateLocalDesktop: () => {
            useSessionStore.getState().activateHome();
            useManagedEntityStore.getState().showHomeWorkspace();
            useSidebarViewStore.getState().setView("hosts");
            useDesktopStore.getState().openDesktopTarget({ kind: "local" });
          },
          showMarkWisely: () => {
            useDesktopStore.getState().launchApp("markwisely");
            useDesktopStore.getState().setAppMaximized("markwisely", true);
          },
          openMarkdown: async (filePath) => {
            try {
              await useMarkWiselyStore.getState().openDocument({
                target: { kind: "local" }, hostKey: "local", path: filePath,
              });
            } catch (error) {
              pushToast(formatAppError(error), false);
            }
          },
          showEditorWisely: () => {
            useDesktopStore.getState().launchApp("editorwisely");
          },
          openText: async (filePath) => {
            await useEditorWiselyStore.getState().open({ kind: "local" }, filePath);
          },
        });
      },
    );
    void (async () => {
      unlisten = await listen("tw://local-file-open", () => {
        void drainPendingFiles().catch(() => undefined);
      });
      try {
        await drainPendingFiles();
      } catch {
        // The command is unavailable in browser previews and older dev builds.
      }
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [pushToast]);

  // Check for updates after the UI settles and show the dialog when one is available.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void quietUpdateCheck().then(() => {
        if (cancelled) return;
      });
    }, 4_000);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [quietUpdateCheck]);

  // Native menu: Check for Updates / Settings.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlistenCheck: (() => void) | undefined;
    let unlistenSettings: (() => void) | undefined;
    void (async () => {
      unlistenCheck = await listen("tw://menu-check-for-updates", () => {
        pushToast(t("updateChecking"), true);
        void manualUpdateCheck()
          .then((result) => showManualUpdateCheckResult(result))
          .catch((err) =>
            showManualUpdateCheckResult({
              status: "error",
              message: formatAppError(err),
            }),
          );
      });
      unlistenSettings = await listen("tw://menu-open-settings", () => {
        openAppSettings();
      });
    })();
    return () => {
      unlistenCheck?.();
      unlistenSettings?.();
    };
  }, [manualUpdateCheck, pushToast, t]);

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
  const [windowFullscreen, setWindowFullscreen] = useState(false);
  const [terminalSize, setTerminalSize] = useState({ cols: 120, rows: 32 });
  const homeTerminalTabs = [
    { id: "home-terminal-1", title: t("localTerminalTabTitle", { ns: "terminal", number: 1 }) },
  ];
  const activeHomeTerminalId = "home-terminal-1";
  const tabBarRef = useRef<HTMLDivElement>(null);
  const openNewRemoteRef = useRef<() => void>(() => {});
  const registerNewRemote = useCallback((open: () => void) => {
    openNewRemoteRef.current = open;
  }, []);
  const aiEngineerOpen = useAiEngineerStore((s) => s.open);
  const aiEngineerSessionId = useAiEngineerStore((s) => s.sessionId);
  const aiEngineerServerId = useAiEngineerStore((s) => s.serverId);
  const sidebarView = useSidebarViewStore((s) => s.view);
  const setSidebarView = useSidebarViewStore((s) => s.setView);
  const homeOpen = useManagedEntityStore((s) => s.homeOpen);
  const homeDirectoryOpen = useManagedEntityStore((s) => s.homeDirectoryOpen);
  const homeDesktopTabs = useManagedEntityStore((s) => s.homeDesktopTabs);
  const activeHomeDesktopTabId = useManagedEntityStore((s) => s.activeHomeDesktopTabId);
  const homeChatOpen = useManagedEntityStore((s) => s.homeChatOpen);
  const toggleHomeChat = useManagedEntityStore((s) => s.toggleHomeChat);
  const homeWasOpen = useRef(false);
  useLayoutEffect(() => {
    if (homeOpen) {
      useAiEngineerStore.getState().bindLocalContext();
    } else if (homeWasOpen.current) {
      useAiEngineerStore.getState().restoreChatAfterHome();
    }
    homeWasOpen.current = homeOpen;
  }, [homeOpen]);
  const leaveHome = useManagedEntityStore((s) => s.leaveHome);
  const openSavedHostRef = useRef<(saved: (typeof savedConnections)[number]) => void>(() => {});
  const registerOpenSavedHost = useCallback((open: (saved: (typeof savedConnections)[number]) => void) => {
    openSavedHostRef.current = open;
  }, []);
  const editSavedHostRef = useRef<(saved: SavedConnection) => void>(() => {});
  const registerEditSavedHost = useCallback((edit: (saved: SavedConnection) => void) => {
    editSavedHostRef.current = edit;
  }, []);
  const deleteSavedHostRef = useRef<(saved: SavedConnection) => void>(() => {});
  const registerDeleteSavedHost = useCallback((remove: (saved: SavedConnection) => void) => {
    deleteSavedHostRef.current = remove;
  }, []);
  const hostEntityIds = useMemo(() => savedConnections.map((host) => host.id), [savedConnections]);
  const hostLayout = useEntityLayoutStore((s) => s.layouts.hosts);
  const ensureEntityScope = useEntityLayoutStore((s) => s.ensureScope);
  const handleEntityItemDrop = useEntityLayoutStore((s) => s.handleItemDrop);
  const addEntityGroup = useEntityLayoutStore((s) => s.addGroup);
  const renameEntityGroup = useEntityLayoutStore((s) => s.renameGroup);
  const deleteEntityGroup = useEntityLayoutStore((s) => s.deleteGroup);
  useEffect(() => {
    ensureEntityScope("hosts", hostEntityIds);
  }, [ensureEntityScope, hostEntityIds]);
  const homeHostSections = useMemo(
    () => selectEntitySections(hostLayout, hostEntityIds, t("entityUngrouped"))
      .map((section) => ({ key: section.key, name: section.group.name, hostIds: section.itemIds })),
    [hostLayout, hostEntityIds, t],
  );
  const showHostsSession = sidebarView === "hosts" && !homeOpen;
  const aiPanelSessionId = aiEngineerSessionId;
  const showAiEngineerPanel = shouldShowAiEngineerPanel({
    open: aiEngineerOpen,
    sessionId: aiPanelSessionId,
    sidebarView,
    activeTabId: sidebarView === "hosts" ? activeTabId : null,
    homeOpen,
  });
  const aiFiberSessions = useAiFiberSessions();
  const aiPanelsToMount = useMemo(() => {
    const ids = new Set<string>(
      aiFiberSessions.filter((id) => id !== LOCAL_CHAT_SESSION),
    );
    if (aiPanelSessionId && aiPanelSessionId !== LOCAL_CHAT_SESSION) {
      ids.add(aiPanelSessionId);
    }
    return [...ids];
  }, [aiFiberSessions, aiPanelSessionId]);
  // Soft-hide on host switch keeps the fiber tree warm (see AiEngineerPanel).
  const keepAiPanelMounted =
    aiPanelsToMount.length > 0 &&
    (showAiEngineerPanel ||
      (homeOpen && aiEngineerOpen) ||
      shouldKeepAiEngineerPanelMounted({
        sessionId: aiPanelSessionId,
        show: showAiEngineerPanel,
        sidebarView,
        open: aiEngineerOpen,
      }) ||
      aiFiberSessions.length > 0);
  const desktopOpen = useDesktopStore((s) => s.open);
  const desktopTarget = useDesktopStore((s) => s.target);
  const desktopTerminalOpen = useDesktopStore((s) => s.apps.terminal.open);
  const desktopTerminalMinimized = useDesktopStore(
    (s) => s.apps.terminal.minimized,
  );
  const desktopAiOpen = useDesktopStore((s) => s.apps.aiLinux.open);
  const desktopAiMinimized = useDesktopStore((s) => s.apps.aiLinux.minimized);
  const desktopAiLocalOpen = useDesktopStore((s) => s.apps.aiLocal.open);
  const desktopAiLocalMinimized = useDesktopStore((s) => s.apps.aiLocal.minimized);
  const desktopFilesOpen = useDesktopStore((s) => s.apps.files.open);
  const markWiselyOpen = useDesktopStore((s) => s.apps.markwisely.open);
  const editorWiselyOpen = useDesktopStore((s) => s.apps.editorwisely.open);
  const desktopFilesMinimized = useDesktopStore((s) => s.apps.files.minimized);
  const desktopProcessesOpen = useDesktopStore((s) => s.apps.processes.open);
  const desktopProcessesMinimized = useDesktopStore(
    (s) => s.apps.processes.minimized,
  );
  const browserOpen = useBrowserStore((s) => s.open);
  const fetchProcesses = useTaskManagerStore((s) => s.fetchProcesses);
  const loadSessionCwd = useFindStore((s) => s.loadSessionCwd);
  const fetchHostStats = useHostStatsStore((s) => s.fetchStats);
  const resetHostStats = useHostStatsStore((s) => s.resetForSession);
  const workspacePanelWidth = useDesktopStore((s) => s.width);
  const desktopHasMaximizedApp = useDesktopStore((s) =>
    Object.values(s.apps).some(
      (app) => app.open && !app.minimized && app.maximized,
    ),
  );
  const desktopMode =
    desktopOpen && (isSshDesktopTarget(desktopTarget)
      ? sidebarView === "hosts" && activeTabId === desktopTarget.sessionId
      : desktopTarget?.kind === "local" && homeOpen && !homeDirectoryOpen);
  useEffect(() => {
    if (!homeDirectoryOpen) return;
    const desktop = useDesktopStore.getState();
    if (desktop.open && desktop.target?.kind === "local") closeDesktopRemembering();
  }, [homeDirectoryOpen]);
  const desktopTerminalShown =
    desktopMode && Boolean(desktopTarget) && desktopTerminalOpen && !desktopTerminalMinimized;
  const desktopAiShown = desktopMode && desktopAiOpen && !desktopAiMinimized;
  const desktopAiLocalShown =
    desktopMode &&
    desktopTarget?.kind === "local" &&
    desktopAiLocalOpen &&
    !desktopAiLocalMinimized;
  const workspacePanelOpen = showAiEngineerPanel && !desktopMode;
  const desktopAppChromeMode = desktopMode && desktopHasMaximizedApp;

  const sidebarWidth = 0;

  const terminalLayoutRevision = useMemo(
    () =>
      `no-sidebar-${workspacePanelOpen}-${workspacePanelWidth}-${desktopMode ? "desktop" : "term"}-${desktopTerminalShown ? "embed" : "stack"}`,
    [
      sidebarWidth,
      workspacePanelOpen,
      workspacePanelWidth,
      desktopMode,
      desktopTerminalShown,
    ],
  );

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

  // Host tab changed while AI still bound to another session — soft-hide so
  // the previous host's transcript cannot paint over the new terminal.
  useEffect(() => {
    if (sidebarView !== "hosts") return;
    if (!activeTabId) return;
    const ai = useAiEngineerStore.getState();
    if (!ai.open || !ai.sessionId) return;
    if (ai.sessionId === activeTabId) return;
    markHostAiShell(ai.sessionId);
    useAiEngineerStore.setState({ open: false });
  }, [sidebarView, activeTabId]);

  useEffect(() => {
    const updateSize = () => {
      const panelReserve = workspacePanelOpen ? workspacePanelWidth : 0;
      const width = Math.max(
        window.innerWidth - sidebarWidth - panelReserve - 32,
        400,
      );
      const height = Math.max(window.innerHeight - 96, 300);
      setTerminalSize({
        cols: Math.floor(width / 9),
        rows: Math.floor(height / 18),
      });
    };

    updateSize();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
  }, [sidebarWidth, workspacePanelOpen, workspacePanelWidth]);

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
    event: Pick<
      React.PointerEvent,
      "button" | "clientX" | "clientY" | "target" | "pointerId"
    >,
  ) => {
    if (event.button !== 0) return;
    if (
      (event.target as HTMLElement).closest(
        ".tab-close",
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
      pointerId: event.pointerId,
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
    if (tabReorderDragId) return;
    const activeTab = tabBarRef.current?.querySelector(".tab.active");
    // Prefer center so a focused host tab is not left clipped off-screen.
    activeTab?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [activeTabId, tabs.length, tabReorderDragId]);

  const activeSessionTitle =
    activeTabId != null ? sessionTitles[activeTabId] : undefined;
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [activeTabId, tabs],
  );
  const activeTabReady =
    activeTab != null && (activeTab.connectionStatus ?? "ready") === "ready";
  // Never fall back to connecting `pending:…` tab ids — that creates orphan
  // `server:pending:…` chat buckets and makes recent history look "missing".
  const activeTabServerId = (activeTab?.server_id ?? "").trim();
  const activeTabDisconnected = useSessionStore((state) =>
    activeTabId != null ? state.disconnectedSessionIds.has(activeTabId) : false,
  );

  useEffect(() => {
    const processesVisible =
      desktopProcessesOpen && !desktopProcessesMinimized;
    if (
      !processesVisible ||
      !activeTabId ||
      !activeTab ||
      activeTabDisconnected
    ) {
      if (activeTabDisconnected && processesVisible) {
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
  }, [
    activeTab,
    activeTabDisconnected,
    activeTabId,
    fetchProcesses,
    desktopProcessesOpen,
    desktopProcessesMinimized,
  ]);

  useEffect(() => {
    const findVisible =
      desktopFilesOpen && !desktopFilesMinimized;
    if (!findVisible || !activeTabId) return;

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
  }, [
    activeTabId,
    loadSessionCwd,
    desktopFilesOpen,
    desktopFilesMinimized,
  ]);

  useEffect(() => {
    if (!browserOpen || !activeTabId || desktopTarget?.kind === "local") return;
    // Panel owns measure→ensure→dock; only rebind session on tab switch.
    const { sessionId, ensureForSession } = useBrowserStore.getState();
    if (sessionId !== activeTabId) {
      void ensureForSession(activeTabId, null);
    }
  }, [browserOpen, activeTabId]);

  useEffect(() => {
    if (!desktopOpen || !activeTabId) return;
    const desktop = useDesktopStore.getState();
    if (desktop.sessionId !== activeTabId) {
      desktop.openDesktop(activeTabId);
    }
    const { sessionId, activateSession } = useLocalFsStore.getState();
    if (sessionId !== activeTabId) {
      activateSession(activeTabId);
    }
  }, [activeTabId, desktopOpen]);


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
      switchWorkspacePanel("localFs", activeTabId, undefined, "find");
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeTabId]);

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
      className={`app-shell sidebar-collapsed ${platformClass} ${homeOpen ? "home-space " : ""}${windowFullscreen ? " window-fullscreen" : ""}${workspacePanelOpen ? " workspace-panel-open" : ""}${desktopMode ? " desktop-mode" : ""}${desktopAppChromeMode ? " desktop-app-chrome-mode" : ""}${homeOpen ? "" : " has-host-stats-statusbar"}`}
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
            <div
              className="chrome-sidebar-slot chrome-sidebar-slot--collapsed"
            >
              {macWindowChrome ? (
                <div
                  className="chrome-titlebar-macos-controls chrome-titlebar-macos-traffic-spacer"
                  aria-hidden
                />
              ) : null}
            </div>
            <div className="chrome-titlebar-main">
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
                <button
                  type="button"
                  className={`chrome-home-button${homeOpen && homeDirectoryOpen ? " active" : ""}`}
                  data-testid="home-directory-button"
                  aria-label={t("homeDirectoryTab")}
                  aria-pressed={homeOpen && homeDirectoryOpen}
                  title={t("homeDirectoryTab")}
                  onClick={() => activateHome()}
                >
                  <TabHomeIcon />
                </button>
                {homeDesktopTabs.map((tab) => {
                  const active = homeOpen && !homeDirectoryOpen && tab.id === activeHomeDesktopTabId;
                  return (
                    <div
                      key={tab.id}
                      className={`tab${active ? " active" : ""}`}
                      data-testid="local-desktop-tab"
                      data-desktop-tab-id={tab.id}
                      onClick={() => {
                        useSessionStore.getState().activateHome();
                        closeDesktopRemembering();
                        useManagedEntityStore.getState().activateHomeDesktopTab(tab.id);
                        useDesktopStore.getState().openDesktopTarget({ kind: "local" });
                      }}
                    >
                      {active ? <><span className="tab-curve tab-curve-start" aria-hidden="true" /><span className="tab-curve tab-curve-end" aria-hidden="true" /></> : null}
                      <span className="tab-kind desktop-tab-icon"><SystemInfoIcon /></span>
                      <span className="tab-title" title={tab.title}>{tab.title}</span>
                    </div>
                  );
                })}
                {tabs.map((tab) => {
            const tabConnecting = (tab.connectionStatus ?? "ready") === "connecting";
            const tabOs = resolveSessionOsProfile(tab, savedConnections);
            return (
            <div
              key={tab.id}
              className={`tab ${!homeOpen && tab.active ? "active" : ""} ${
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
                setSidebarView("hosts");
                setActiveTab(tab.id);
              }}
              onPointerDown={(event) => {
                tabPointerButtonRef.current = event.button;
                if (event.button === 0) {
                  clearChromeClickSuppress();
                  suppressTabClickUntilRef.current = 0;
                  noteIntentionalTabLeftMouseDown(tab.id);
                  setSidebarView("hosts");
                  setActiveTab(tab.id);
                  startTabReorder(tab.id, event);
                }
              }}
              onMouseDown={(event) => {
                // Right/middle still tracked here; left reorder uses pointerdown.
                tabPointerButtonRef.current = event.button;
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
              {!homeOpen && tab.active ? (
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
              <button
                type="button"
                className="tab-close"
                onPointerDown={(event) => event.stopPropagation()}
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
                  data-testid="chrome-new-session"
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
                <div
                  ref={setDesktopChromeHost}
                  className="chrome-maximized-app-slot"
                  data-testid="desktop-maximized-app-controls-slot"
                />
                {!homeDirectoryOpen ? <AiEngineerTool
                  active={homeOpen ? homeChatOpen : showAiEngineerPanel}
                  disabled={!homeOpen && !activeTabReady}
                  onClick={() => {
                    if (homeOpen) {
                      if (desktopMode && desktopTarget?.kind === "local") {
                        useDesktopStore.getState().close();
                        useManagedEntityStore.getState().setHomeChatOpen(true);
                        return;
                      }
                      toggleHomeChat();
                      return;
                    }
                    if (activeTabId) {
                      leaveHome();
                      switchToAiEngineerPanel({
                        kind: "server",
                        id: activeTabServerId || activeTabId,
                        label: activeSessionTitle || activeTabId,
                        sessionId: activeTabId,
                        serverId: activeTabServerId,
                      });
                    }
                  }}
                /> : null}
                {!homeDirectoryOpen && (homeOpen || sidebarView === "hosts") ? (
                <LocalFsTool
                  active={desktopMode}
                  disabled={!homeOpen && !activeTabReady}
                  onClick={() => {
                    if (homeOpen) {
                      const desk = useDesktopStore.getState();
                      if (desk.open && desk.target?.kind === "local") {
                        desk.close();
                      } else {
                        desk.openDesktopTarget({ kind: "local" });
                      }
                      return;
                    }
                    if (!activeTabId) return;
                    if (useDesktopStore.getState().open) {
                      closeDesktopRemembering();
                      return;
                    }
                    switchWorkspacePanel("desktop", activeTabId);
                  }}
                />
                ) : null}
                <ThemeSwitcher />
                <LocaleSwitcher />
              </div>

          {!macWindowChrome ? <WindowControls layout="windows" /> : null}
            </div>
          </header>

      <div className="app-body">
        <ConnectionPanel
          cols={terminalSize.cols}
          rows={terminalSize.rows}
          collapsed={true}
          expandedWidth={240}
          onExpandedWidthChange={() => {}}
          onRegisterNewRemote={registerNewRemote}
          onRegisterOpenSavedHost={registerOpenSavedHost}
          onRegisterEditSavedHost={registerEditSavedHost}
          onRegisterDeleteSavedHost={registerDeleteSavedHost}
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
                {homeOpen && homeDirectoryOpen ? (
                  <HomeHostDirectory
                    groups={homeHostSections}
                    savedConnections={savedConnections}
                    loading={!savedConnectionsLoaded}
                    onOpenHost={(saved) => openSavedHostRef.current(saved)}
                    onEditHost={(saved) => editSavedHostRef.current(saved)}
                    onDeleteHost={(saved) => deleteSavedHostRef.current(saved)}
                    onAddHost={() => openNewRemoteRef.current()}
                    onAddGroup={() => addEntityGroup("hosts", hostEntityIds, t("entityGroupDefaultName"))}
                    onRenameGroup={(groupId, name) => renameEntityGroup("hosts", hostEntityIds, groupId, name)}
                    onDeleteGroup={(groupId) => deleteEntityGroup("hosts", hostEntityIds, groupId, undefined, t("entityUngrouped"))}
                    onItemDrop={(dragId, target) =>
                      handleEntityItemDrop(
                        "hosts",
                        hostEntityIds,
                        dragId,
                        target,
                        undefined,
                        t("entityUngrouped"),
                      )
                    }
                  />
                ) : null}
                {homeOpen && !homeDirectoryOpen ? (
                  <HomeWorkspace
                    terminalTabs={homeTerminalTabs}
                    activeTerminalId={activeHomeTerminalId}
                    chatOpen={homeChatOpen && !desktopMode}
                  />
                ) : null}
                {tabs.map((tab) => (
                  <TerminalView
                    key={tab.id}
                    sessionId={tab.id}
                    kind={tab.kind}
                    active={showHostsSession && tab.id === activeTabId}
                    connectionStatus={tab.connectionStatus ?? "ready"}
                    title={tab.title}
                    layoutRevision={terminalLayoutRevision}
                  />
                ))}
              </div>
            </div>

          </main>
        </div>
      </div>
      <SendToDialog />
      {activeTabId && showHostsSession ? (
        <PreviewPanel
          sessionId={activeTabId}
          sessionTitle={activeSessionTitle}
        />
      ) : null}
      <SudoPasswordModal />
      <AppSettingsDialog />
      {updateDialog ? (
        <UpdateAvailableDialog
          update={updateDialog.update}
          currentVersion={updateDialog.currentVersion}
          needsPrivilege={updateDialog.needsPrivilege}
          onDismiss={() => closeUpdateDialog()}
          onInstalled={() => markUpdateInstalled()}
        />
      ) : null}
      {keepAiPanelMounted
        ? aiPanelsToMount.map((fiberSessionId) => {
            const tab = tabs.find((t) => t.id === fiberSessionId);
            return (
              <AiEngineerPanel
                key={fiberSessionId}
                sessionId={fiberSessionId}
                homeOpen={homeOpen}
                serverId={tab?.server_id ?? (fiberSessionId === aiPanelSessionId ? aiEngineerServerId ?? undefined : undefined)}
                surfaceActive={
                  showAiEngineerPanel && fiberSessionId === aiPanelSessionId
                }
              />
            );
          })
        : null}
      {desktopMode && desktopTarget ? (
        <DesktopPanel
          target={desktopTarget}
        />
      ) : null}
      {desktopTerminalShown ? (
        <DesktopTerminalWindow subtitle={isSshDesktopTarget(desktopTarget) ? activeSessionTitle : "This computer"} />
      ) : null}
      {desktopAiShown && activeTabId ? (
        <DesktopAiWindow target="ssh" subtitle={activeSessionTitle} />
      ) : null}
      {desktopAiLocalShown ? (
        <DesktopAiWindow target="local" subtitle={t("desktop.localComputer", { ns: "tools" })} />
      ) : null}
      {markWiselyOpen && desktopMode && desktopTarget ? (
        <MarkWiselyWindow
          target={desktopTarget}
          sessionId={desktopTarget.kind === "ssh" ? activeTabId ?? undefined : undefined}
          hostKey={desktopTarget.kind === "ssh" ? activeTabServerId || activeTabId || undefined : undefined}
          sessionTitle={desktopTarget.kind === "ssh" ? activeSessionTitle : "This computer"}
        />
      ) : sidebarView === "hosts" && activeTabId && markWiselyOpen ? (
        <MarkWiselyWindow
          target={desktopTarget ?? { kind: "ssh", sessionId: activeTabId }}
          sessionId={activeTabId}
          hostKey={activeTabServerId || activeTabId}
          sessionTitle={activeSessionTitle}
        />
      ) : null}
      {editorWiselyOpen && desktopMode && desktopTarget ? <FileWiselyWindow target={desktopTarget} /> : sidebarView === "hosts" && activeTabId && editorWiselyOpen ? <EditorWiselyWindow target={desktopTarget ?? { kind: "ssh", sessionId: activeTabId }} /> : null}
      {desktopMode && desktopTarget && desktopFilesOpen && (
        desktopTarget.kind === "local" || (sidebarView === "hosts" && activeTabId)
      ) ? (
        <FileManagerPanel
          target={desktopTarget}
          sessionId={desktopTarget.kind === "ssh" ? desktopTarget.sessionId : undefined}
          sessionTitle={desktopTarget.kind === "ssh" ? activeSessionTitle ?? undefined : undefined}
        />
      ) : null}
      {desktopMode && desktopTarget && desktopProcessesOpen && (
        desktopTarget.kind === "local" || (sidebarView === "hosts" && activeTabId)
      ) ? (
        <ProcessManagerPanel
          target={desktopTarget}
          sessionTitle={desktopTarget.kind === "ssh" ? activeSessionTitle ?? undefined : "This computer"}
        />
      ) : null}
      {desktopMode && desktopTarget && browserOpen ? (
        <BrowserPanel
          target={desktopTarget}
          sessionTitle={desktopTarget.kind === "ssh" ? activeSessionTitle ?? undefined : "This computer"}
        />
      ) : null}
      {!homeOpen ? (
        activeTabId && !activeTabDisconnected ? (
          <HostStatsStatusBar sessionId={activeTabId} />
        ) : (
          <HostStatsStatusBar sessionId={null} />
        )
      ) : null}
    </div>
  );
}

export default App;
