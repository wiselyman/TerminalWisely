import { useEffect, useRef, useState, useMemo, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { SendToDialog } from "./components/SendToDialog";
import { PreviewPanel } from "./components/PreviewPanel";
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
import { useToastStore } from "./stores/toastStore";
import type { TransferCompletePayload, TransferProgressPayload } from "./types";
import { TabDirectoryShortcuts } from "./components/TabShortcutMenu";
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
  const tabReorderCleanupRef = useRef<(() => void) | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1",
  );
  const [terminalSize, setTerminalSize] = useState({ cols: 120, rows: 32 });
  const tabBarRef = useRef<HTMLDivElement>(null);
  const previewOpen = usePreviewStore((s) => s.open);
  const previewWidth = usePreviewStore((s) => s.width);
  const setPreviewWidth = usePreviewStore((s) => s.setWidth);
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
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className={`tab ${tab.active ? "active" : ""} ${
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
              onMouseDown={(event) => startTabReorder(tab.id, event)}
              onDragOver={(event) => {
                if (tabReorderDragId) return;

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
                {tab.title}
              </span>
              {tab.active ? (
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
          ))}
        </div>

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
    </div>
  );
}

export default App;
