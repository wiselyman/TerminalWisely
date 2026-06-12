import { useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import {
  TaskManagerTable,
} from "./TaskManagerTable";
import type { ProcessEntry } from "../types";
import { useTaskManagerStore } from "../stores/taskManagerStore";

interface TaskManagerPanelProps {
  sessionId: string;
  sessionTitle: string;
}

function matchesFilter(process: ProcessEntry, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return true;

  const lower = trimmed.toLowerCase();
  const portQuery = trimmed.replace(/^:/, "");
  if (/^\d+$/.test(portQuery)) {
    return process.ports.includes(Number(portQuery));
  }

  if (process.name.toLowerCase().includes(lower)) {
    return true;
  }

  if (process.command?.toLowerCase().includes(lower)) {
    return true;
  }

  return false;
}

export function TaskManagerPanel({
  sessionId,
  sessionTitle,
}: TaskManagerPanelProps) {
  const {
    width,
    setWidth,
    processes,
    loading,
    error,
    lastUpdated,
    filterQuery,
    setFilterQuery,
    sortKey,
    sortDirection,
    setSort,
    close,
    killProcess,
  } = useTaskManagerStore();

  const resizeStateRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  const filteredProcesses = useMemo(
    () => processes.filter((process) => matchesFilter(process, filterQuery)),
    [filterQuery, processes],
  );

  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString()
    : null;

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    resizeStateRef.current = {
      startX: event.clientX,
      startWidth: width,
    };
    document.body.classList.add("task-manager-resizing");

    const onMouseMove = (moveEvent: MouseEvent) => {
      const state = resizeStateRef.current;
      if (!state) return;
      const delta = state.startX - moveEvent.clientX;
      setWidth(state.startWidth + delta);
    };

    const onMouseUp = () => {
      resizeStateRef.current = null;
      document.body.classList.remove("task-manager-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <>
      <div
        className="task-manager-backdrop open"
        onClick={close}
        aria-hidden="true"
      />
      <aside className="task-manager-panel open" style={{ width }} aria-hidden={false}>
        <div
          className="task-manager-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整任务管理器宽度"
          onMouseDown={startResize}
        />
        <div className="task-manager-head">
          <div className="task-manager-title-wrap">
            <h2 className="task-manager-title">任务管理器</h2>
            <p className="task-manager-session">{sessionTitle}</p>
            {lastUpdatedLabel ? (
              <p className="task-manager-meta">更新于 {lastUpdatedLabel}</p>
            ) : null}
          </div>
          <div className="task-manager-head-actions">
            <button
              type="button"
              className="task-manager-close"
              onClick={close}
              aria-label="关闭任务管理器"
            >
              ×
            </button>
          </div>
        </div>

        <div className="task-manager-toolbar">
          <input
            type="search"
            className="task-manager-search"
            placeholder="按进程名或端口过滤…"
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
          />
        </div>

        {error ? <div className="task-manager-error">{error}</div> : null}

        <TaskManagerTable
          processes={filteredProcesses}
          loading={loading}
          sortKey={sortKey}
          sortDirection={sortDirection}
          onSort={setSort}
          onKill={(process) =>
            void killProcess(sessionId, process.pid, process.name)
          }
        />
      </aside>
    </>
  );
}
