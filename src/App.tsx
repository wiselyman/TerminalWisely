import { useEffect, useRef, useState, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { SendToDialog } from "./components/SendToDialog";
import { PreviewPanel } from "./components/PreviewPanel";
import { FindPanel } from "./components/FindPanel";
import { FindTool } from "./components/FindTool";
import { HostStatsPanel } from "./components/hostStats/HostStatsPanel";
import { HostStatsTool } from "./components/HostStatsTool";
import { TaskManagerTool } from "./components/TaskManagerTool";
import { WorkspaceToolRail } from "./components/WorkspaceToolRail";
import { TaskManagerPanel } from "./components/TaskManagerPanel";
import { TransferPanel } from "./components/TransferPanel";
import { TerminalView } from "./components/TerminalView";
import { ToastContainer } from "./components/ToastContainer";
import { WorkspaceWelcome } from "./components/WorkspaceWelcome";
import { extractDroppedPaths } from "./lib/terminalLinks";
import {
  hasLocalFileDrop,
  hasRemoteDrag,
  parseRemoteDrag,
} from "./lib/remoteDrag";
import { dropEffectForKind } from "./lib/dragVisual";
import { uploadLocalPathsToSession } from "./lib/sessionUpload";
import { startTabPointerReorder } from "./lib/tabPointerReorder";
import { useSessionStore } from "./stores/sessionStore";
import { usePreviewStore } from "./stores/previewStore";
import { useHostStatsStore } from "./stores/hostStatsStore";
import { useFindStore } from "./stores/findStore";
import { useTaskManagerStore } from "./stores/taskManagerStore";
import { useToastStore } from "./stores/toastStore";
import type { TransferCompletePayload, TransferProgressPayload } from "./types";
import { TabDirectoryShortcuts } from "./components/TabShortcutMenu";
import { TabContextMenu } from "./components/TabContextMenu";
import { ServerOsIcon } from "./components/ServerOsIcon";
import { TabHomeIcon } from "./components/SidebarIcons";
import { productIntro } from "./content/productIntro";
import "./App.css";

const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 56;
const SIDEBAR_STORAGE_KEY = "terminal-wisely.sidebar-collapsed";

function App() {
  const {
    tabs,
    activeTabId,
    closeTab,
    closeOtherTabs,
    closeTabsToLeft,
    closeTabsToRight,
    setActiveTab,
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
      pushToast(String(err), false);
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
    let disposed = false;
    const unlisteners: Array<() => void> = [];

    void (async () => {
      const [progressUnlisten, completeUnlisten] = await Promise.all([
        listen<TransferProgressPayload>("transfer-progress", (event) => {
          upsertTransfer(event.payload);
        }),
        listen<TransferCompletePayload>("transfer-complete", (event) => {
          removeTransfer(event.payload.transfer_id);
          pushToast(event.payload.message, event.payload.success);
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
  const [tabReorderTarget, setTabReorderTarget] = useState<{
    id: string;
    position: "before" | "after";
  } | null>(null);
  const [tabContextMenu, setTabContextMenu] = useState<{
    tabId: string;
    x: number;
    y: number;
  } | null>(null);
  const tabReorderCleanupRef = useRef<(() => void) | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1",
  );
  const [terminalSize, setTerminalSize] = useState({ cols: 120, rows: 32 });
  const tabBarRef = useRef<HTMLDivElement>(null);
  const previewOpen = usePreviewStore((s) => s.open);
  const previewWidth = usePreviewStore((s) => s.width);
  const setPreviewWidth = usePreviewStore((s) => s.setWidth);
  const taskManagerOpen = useTaskManagerStore((s) => s.open);
  const toggleTaskManager = useTaskManagerStore((s) => s.toggleOpen);
  const fetchProcesses = useTaskManagerStore((s) => s.fetchProcesses);
  const findOpen = useFindStore((s) => s.open);
  const toggleFind = useFindStore((s) => s.toggleOpen);
  const openFind = useFindStore((s) => s.openFind);
  const loadSessionCwd = useFindStore((s) => s.loadSessionCwd);
  const resetFindResults = useFindStore((s) => s.resetResults);
  const hostStatsOpen = useHostStatsStore((s) => s.open);
  const toggleHostStats = useHostStatsStore((s) => s.toggleOpen);
  const fetchHostStats = useHostStatsStore((s) => s.fetchStats);
  const resetHostStats = useHostStatsStore((s) => s.resetForSession);
  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  const sidebarWidth = sidebarCollapsed
    ? SIDEBAR_COLLAPSED_WIDTH
    : SIDEBAR_WIDTH;

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, sidebarCollapsed ? "1" : "0");
  }, [sidebarCollapsed]);

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
    setTabReorderTarget(null);
  };

  useEffect(() => {
    return () => {
      tabReorderCleanupRef.current?.();
      tabReorderCleanupRef.current = null;
    };
  }, []);

  const startTabReorder = (tabId: string, event: ReactMouseEvent) => {
    if (event.button !== 0) return;
    if (
      (event.target as HTMLElement).closest(
        ".tab-close, .tab-home, .tab-shortcut-folder, .tab-shortcut-add, .tab-shortcut-wrap, .tab-shortcut-icons",
      )
    ) {
      return;
    }

    tabReorderCleanupRef.current?.();
    tabReorderCleanupRef.current = startTabPointerReorder({
      tabId,
      startX: event.clientX,
      startY: event.clientY,
      onPreview: (target) => {
        setTabReorderDragId(tabId);
        setTabReorderTarget(target);
      },
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

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const delta = state.startX - event.clientX;
      setPreviewWidth(state.startWidth + delta);
    };

    const onMouseUp = () => {
      resizeStateRef.current = null;
      document.body.classList.remove("workspace-resizing");
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [setPreviewWidth]);

  const startPreviewResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: previewWidth,
    };
    document.body.classList.add("workspace-resizing");
  };

  const activeSessionTitle =
    activeTabId != null ? sessionTitles[activeTabId] : undefined;
  const activeTab = useMemo(
    () => tabs.find((tab) => tab.id === activeTabId),
    [activeTabId, tabs],
  );
  const activeTabReady =
    activeTab != null && (activeTab.connectionStatus ?? "ready") === "ready";

  useEffect(() => {
    if (!taskManagerOpen || !activeTabId) return;

    void fetchProcesses(activeTabId, { initial: true });
    const timer = window.setInterval(() => {
      void fetchProcesses(activeTabId);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [activeTabId, fetchProcesses, taskManagerOpen]);

  useEffect(() => {
    if (!findOpen || !activeTabId) return;

    useFindStore.setState({ activeSessionId: activeTabId });
    resetFindResults();
    void loadSessionCwd(activeTabId);
  }, [activeTabId, findOpen, loadSessionCwd, resetFindResults]);

  useEffect(() => {
    if (!hostStatsOpen || !activeTabId) return;

    resetHostStats();
    void fetchHostStats(activeTabId, { initial: true });
    const timer = window.setInterval(() => {
      void fetchHostStats(activeTabId);
    }, 2000);

    return () => window.clearInterval(timer);
  }, [activeTabId, fetchHostStats, hostStatsOpen, resetHostStats]);

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

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`,
        } as CSSProperties
      }
    >
      <ConnectionPanel
        cols={terminalSize.cols}
        rows={terminalSize.rows}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed((value) => !value)}
      />

      <main className="workspace">
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
          {tabs.length === 0 && (
            <div className="empty-workspace">{productIntro.name}</div>
          )}
          {tabs.map((tab) => {
            const tabConnecting = (tab.connectionStatus ?? "ready") === "connecting";
            return (
            <div
              key={tab.id}
              className={`tab ${tab.active ? "active" : ""} ${
                tabConnecting ? "tab-connecting" : ""
              } ${
                tabDropTargetId === tab.id ? "tab-drop-target" : ""
              } ${tabDropTargetId === tab.id && tabDropKind === "remote" ? "tab-drop-target-remote" : ""} ${
                tabReorderTarget?.id === tab.id
                  ? `tab-reorder-${tabReorderTarget.position}`
                  : ""
              } ${tabReorderDragId === tab.id ? "tab-reorder-dragging" : ""}`}
              data-session-id={tab.id}
              data-tab-kind={tab.kind}
              data-drop-kind={
                tabDropTargetId === tab.id ? tabDropKind ?? undefined : undefined
              }
              onClick={() => setActiveTab(tab.id)}
              onContextMenu={(event) => {
                event.preventDefault();
                event.stopPropagation();
                setActiveTab(tab.id);
                setTabContextMenu({
                  tabId: tab.id,
                  x: event.clientX,
                  y: event.clientY,
                });
              }}
              onMouseDown={(event) => startTabReorder(tab.id, event)}
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
                    pushToast("不能发送到同一个 SSH 会话", false);
                    return;
                  }
                  setActiveTab(tab.id);
                  void startRemoteTransfer(
                    remotePayload.fromSessionId,
                    remotePayload.remotePath,
                    tab.id,
                  ).catch((err) => {
                    pushToast(String(err), false);
                  });
                  return;
                }

                const paths = extractDroppedPaths(event);
                if (paths.length === 0) return;
                setActiveTab(tab.id);
                void uploadLocalPathsToSession(tab.id, paths)
                  .then((results) => {
                    const names = results.map((item) => item.filename).join(", ");
                    pushToast(`已上传到 ${tab.title}: ${names}`, true);
                  })
                  .catch((err) => {
                    pushToast(String(err), false);
                  });
              }}
            >
              <span
                className={`tab-kind ${tab.kind}`}
                title={
                  tab.kind === "ssh"
                    ? tab.os_name ?? tab.os_id ?? "SSH"
                    : "本地终端"
                }
              >
                {tab.kind === "ssh" ? (
                  <ServerOsIcon
                    osId={tab.os_id}
                    osName={tab.os_name}
                    size={14}
                    showTitle={false}
                  />
                ) : (
                  "本地"
                )}
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
                    title="回到用户目录 ~"
                    aria-label={`回到用户目录 ${tab.title}`}
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
                    serverId={
                      tab.server_id ??
                      (tab.kind === "local" ? "local" : tab.title)
                    }
                    onActivateTab={() => setActiveTab(tab.id)}
                  />
                </span>
              ) : null}
              <button
                type="button"
                className="tab-close"
                onMouseDown={(event) => event.stopPropagation()}
                aria-label={`关闭 ${tab.title}`}
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

        <div
          className={`workspace-split${previewOpen ? " workspace-split-preview-open" : ""}`}
          style={
            previewOpen
              ? ({
                  "--preview-width": `${previewWidth}px`,
                } as CSSProperties)
              : undefined
          }
        >
          <div className="terminal-stack">
            {tabs.length === 0 ? (
              <WorkspaceWelcome />
            ) : (
              tabs.map((tab) => (
                <TerminalView
                  key={tab.id}
                  sessionId={tab.id}
                  kind={tab.kind}
                  active={tab.id === activeTabId}
                  connectionStatus={tab.connectionStatus ?? "ready"}
                  title={tab.title}
                />
              ))
            )}
          </div>

          {previewOpen ? (
            <>
              <div
                className="workspace-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="调整预览面板宽度"
                onMouseDown={startPreviewResize}
              />
              <PreviewPanel sessionTitle={activeSessionTitle} />
            </>
          ) : null}
        </div>

        <TransferPanel
          transfers={transferList}
          sessionTitles={sessionTitles}
          onCancel={(transferId) => void cancelTransfer(transferId)}
        />
      </main>
      <SendToDialog />
      <ToastContainer />
      <WorkspaceToolRail>
        <TaskManagerTool
          active={taskManagerOpen}
          disabled={!activeTabReady}
          onClick={toggleTaskManager}
        />
        <FindTool
          active={findOpen}
          disabled={!activeTabReady}
          onClick={() => {
            if (activeTabId) toggleFind(activeTabId);
          }}
        />
        <HostStatsTool
          active={hostStatsOpen}
          disabled={!activeTabReady}
          onClick={toggleHostStats}
        />
      </WorkspaceToolRail>
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
      {activeTabId && hostStatsOpen ? (
        <HostStatsPanel
          sessionId={activeTabId}
          sessionTitle={activeSessionTitle ?? activeTabId}
          osId={activeTab?.os_id}
          osName={activeTab?.os_name}
        />
      ) : null}
    </div>
  );
}

export default App;
