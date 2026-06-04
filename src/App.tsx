import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ConnectionPanel } from "./components/ConnectionPanel";
import { TerminalView } from "./components/TerminalView";
import { ToastContainer } from "./components/ToastContainer";
import { WorkspaceWelcome } from "./components/WorkspaceWelcome";
import { useSessionStore } from "./stores/sessionStore";
import { productIntro } from "./content/productIntro";
import "./App.css";

const SIDEBAR_WIDTH = 260;
const SIDEBAR_COLLAPSED_WIDTH = 56;
const SIDEBAR_STORAGE_KEY = "terminal-wisely.sidebar-collapsed";

function App() {
  const { tabs, activeTabId, closeTab, setActiveTab, transferProgress } =
    useSessionStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem(SIDEBAR_STORAGE_KEY) === "1",
  );
  const [terminalSize, setTerminalSize] = useState({ cols: 120, rows: 32 });
  const tabBarRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const activeTab = tabBarRef.current?.querySelector(".tab.active");
    activeTab?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeTabId, tabs.length]);

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
          className="tab-bar"
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
              className={`tab ${tab.active ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <span className={`tab-kind ${tab.kind}`}>
                {tab.kind === "ssh" ? "SSH" : "本地"}
              </span>
              <span className="tab-title">{tab.title}</span>
              <button
                type="button"
                className="tab-close"
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

        {transferProgress && (
          <div className="transfer-bar">
            {transferProgress.direction}: {transferProgress.filename} (
            {transferProgress.transferred}/{transferProgress.total || "?"})
          </div>
        )}
      </main>
      <ToastContainer />
    </div>
  );
}

export default App;
