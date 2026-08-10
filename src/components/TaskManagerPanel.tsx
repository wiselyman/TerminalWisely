import { useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  TaskManagerTable,
} from "./TaskManagerTable";
import type { ProcessEntry } from "../types";
import { useTaskManagerStore } from "../stores/taskManagerStore";
import { WorkspacePanelBackdrop } from "./WorkspacePanelBackdrop";

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
  sessionTitle: _sessionTitle,
}: TaskManagerPanelProps) {
  const { t } = useTranslation("tools");
  const {
    width,
    setWidth,
    processes,
    loading,
    syncing,
    portsLoading,
    error,
    lastUpdated,
    filterQuery,
    setFilterQuery,
    sortKey,
    sortDirection,
    setSort,
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
      <WorkspacePanelBackdrop />
      <aside className="task-manager-panel open" style={{ width }} aria-hidden={false}>
        <div
          className="task-manager-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("taskManager.resizeAria")}
          onMouseDown={startResize}
        />
        <div className="task-manager-head">
          <div className="task-manager-title-wrap">
            <h2 className="task-manager-title">{t("taskManager.title")}</h2>
            {lastUpdatedLabel ? (
              <span className="task-manager-meta">
                {t("common:updatedAt", { time: lastUpdatedLabel })}
              </span>
            ) : null}
          </div>
        </div>

        <div className="task-manager-toolbar">
          <input
            type="search"
            className="task-manager-search"
            placeholder={t("taskManager.filterPlaceholder")}
            value={filterQuery}
            onChange={(event) => setFilterQuery(event.target.value)}
          />
        </div>

        {error ? <div className="task-manager-error">{error}</div> : null}

        <TaskManagerTable
          processes={filteredProcesses}
          loading={loading}
          syncing={syncing}
          portsLoading={portsLoading}
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
