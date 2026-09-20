import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { ProcessEntry } from "../types";
import { formatFileSize } from "../lib/fileType";
import {
  clampTaskManagerColWidth,
  emptyTaskManagerColumnWidths,
  parseTaskManagerColumnWidths,
  resolveTaskManagerColWidth,
  TASK_MANAGER_ACTIONS_COL_WIDTH,
  TASK_MANAGER_COL_MIN,
  TASK_MANAGER_COL_PERCENTS,
  TASK_MANAGER_COLUMNS_STORAGE_KEY,
  type TaskManagerColKey,
  type TaskManagerColumnWidths,
} from "../lib/taskManagerColumns";

export type ProcessSortKey = "name" | "cpu" | "memory" | "port";
export type SortDirection = "asc" | "desc";

type ResizableColumnKey = TaskManagerColKey;

function loadColumnWidths(): TaskManagerColumnWidths {
  try {
    return parseTaskManagerColumnWidths(
      localStorage.getItem(TASK_MANAGER_COLUMNS_STORAGE_KEY),
    );
  } catch {
    return emptyTaskManagerColumnWidths();
  }
}

interface TaskManagerTableProps {
  processes: ProcessEntry[];
  loading: boolean;
  syncing?: boolean;
  portsLoading?: boolean;
  sortKey: ProcessSortKey;
  sortDirection: SortDirection;
  onSort: (key: ProcessSortKey) => void;
  onKill: (process: ProcessEntry) => void;
}

function sortIndicator(active: boolean, direction: SortDirection) {
  if (!active) return "↕";
  return direction === "asc" ? "↑" : "↓";
}

function portSortValue(ports: number[]) {
  if (ports.length === 0) return Number.MAX_SAFE_INTEGER;
  return Math.min(...ports);
}

function formatPorts(ports: number[]) {
  if (ports.length === 0) return "—";
  return ports.join(", ");
}

export function TaskManagerTable({
  processes,
  loading,
  syncing = false,
  portsLoading = false,
  sortKey,
  sortDirection,
  onKill,
  onSort,
}: TaskManagerTableProps) {
  const { t } = useTranslation("tools");
  const [confirmPid, setConfirmPid] = useState<number | null>(null);
  const [columnWidths, setColumnWidths] = useState(loadColumnWidths);
  const resizeRef = useRef<{
    column: ResizableColumnKey;
    startX: number;
    startWidth: number;
  } | null>(null);

  const sorted = useMemo(() => {
    const next = [...processes];
    next.sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name":
          cmp = a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
          break;
        case "cpu":
          cmp = a.cpu_percent - b.cpu_percent;
          break;
        case "memory":
          cmp = Number(a.memory_bytes - b.memory_bytes);
          break;
        case "port":
          cmp = portSortValue(a.ports) - portSortValue(b.ports);
          break;
      }
      if (cmp === 0) {
        cmp = a.pid - b.pid;
      }
      return sortDirection === "asc" ? cmp : -cmp;
    });
    return next;
  }, [processes, sortDirection, sortKey]);

  const persistColumnWidths = useCallback((next: TaskManagerColumnWidths) => {
    localStorage.setItem(TASK_MANAGER_COLUMNS_STORAGE_KEY, JSON.stringify(next));
  }, []);

  const startColumnResize = useCallback(
    (column: ResizableColumnKey, event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const table = (event.currentTarget as HTMLElement).closest("table");
      const measured =
        table
          ?.querySelector(
            column === "name"
              ? ".task-manager-col-name"
              : `.task-manager-col-${column}`,
          )
          ?.getBoundingClientRect().width ?? TASK_MANAGER_COL_MIN[column];
      const startWidth =
        columnWidths[column] != null ? columnWidths[column]! : measured;

      resizeRef.current = {
        column,
        startX: event.clientX,
        startWidth,
      };
      document.body.classList.add("task-manager-col-resizing");

      const onMouseMove = (moveEvent: MouseEvent) => {
        const state = resizeRef.current;
        if (!state) return;
        const delta = moveEvent.clientX - state.startX;
        const next = clampTaskManagerColWidth(
          state.column,
          state.startWidth + delta,
        );
        setColumnWidths((current) => ({
          ...current,
          [state.column]: next,
        }));
      };

      const onMouseUp = () => {
        resizeRef.current = null;
        document.body.classList.remove("task-manager-col-resizing");
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        setColumnWidths((current) => {
          persistColumnWidths(current);
          return current;
        });
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [columnWidths, persistColumnWidths],
  );

  const headerWidth = (column: ResizableColumnKey) => {
    const resolved = resolveTaskManagerColWidth(column, columnWidths);
    return typeof resolved === "number" ? { width: resolved } : undefined;
  };

  const renderHeader = (
    column: ResizableColumnKey,
    label: string,
    sort: ProcessSortKey,
    extraClass = "",
    showSpinner = false,
  ) => (
    <th
      className={`task-manager-th-resizable task-manager-col-${column} ${extraClass}`.trim()}
      style={headerWidth(column)}
    >
      <button type="button" className="task-manager-sort" onClick={() => onSort(sort)}>
        {label} {sortIndicator(sortKey === sort, sortDirection)}
        {showSpinner ? (
          <span
            className="task-manager-port-spinner"
            aria-label={t("taskManager.portsLoadingAria")}
          />
        ) : null}
      </button>
      <span
        className="task-manager-col-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={t("taskManager.resizeColAria", { label })}
        onMouseDown={(event) => startColumnResize(column, event)}
      />
    </th>
  );

  if (loading && processes.length === 0) {
    return (
      <div className="task-manager-table-wrap task-manager-table-wrap-loading">
        <table className="task-manager-table task-manager-table-skeleton" aria-busy="true">
          <colgroup>
            <col style={{ width: TASK_MANAGER_COL_PERCENTS.name }} />
            <col style={{ width: TASK_MANAGER_COL_PERCENTS.port }} />
            <col style={{ width: TASK_MANAGER_COL_PERCENTS.memory }} />
            <col style={{ width: TASK_MANAGER_COL_PERCENTS.cpu }} />
            <col style={{ width: TASK_MANAGER_ACTIONS_COL_WIDTH }} />
          </colgroup>
          <thead>
            <tr>
              <th>{t("taskManager.colName")}</th>
              <th>{t("taskManager.colPort")}</th>
              <th>{t("taskManager.colMemory")}</th>
              <th>{t("taskManager.colCpu")}</th>
              <th className="task-manager-th-actions" />
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }, (_, index) => (
              <tr key={index}>
                <td><span className="task-manager-skeleton-bar task-manager-skeleton-name" /></td>
                <td><span className="task-manager-skeleton-bar task-manager-skeleton-short" /></td>
                <td><span className="task-manager-skeleton-bar task-manager-skeleton-short" /></td>
                <td><span className="task-manager-skeleton-bar task-manager-skeleton-short" /></td>
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (processes.length === 0) {
    return <div className="task-manager-empty">{t("taskManager.empty")}</div>;
  }

  return (
    <div
      className={`task-manager-table-wrap${syncing ? " task-manager-table-wrap-syncing" : ""}`}
    >
      <table className="task-manager-table">
        <colgroup>
          <col
            className="task-manager-col-name"
            style={{ width: resolveTaskManagerColWidth("name", columnWidths) }}
          />
          <col
            className="task-manager-col-port"
            style={{ width: resolveTaskManagerColWidth("port", columnWidths) }}
          />
          <col
            className="task-manager-col-memory"
            style={{ width: resolveTaskManagerColWidth("memory", columnWidths) }}
          />
          <col
            className="task-manager-col-cpu"
            style={{ width: resolveTaskManagerColWidth("cpu", columnWidths) }}
          />
          <col
            className="task-manager-col-actions"
            style={{ width: TASK_MANAGER_ACTIONS_COL_WIDTH }}
          />
        </colgroup>
        <thead>
          <tr>
            {renderHeader("name", t("taskManager.colName"), "name", "task-manager-col-name")}
            {renderHeader("port", t("taskManager.colPort"), "port", "", portsLoading)}
            {renderHeader("memory", t("taskManager.colMemory"), "memory", "task-manager-th-compact")}
            {renderHeader("cpu", t("taskManager.colCpu"), "cpu", "task-manager-th-compact")}
            <th className="task-manager-th-actions" aria-label={t("taskManager.colActionsAria")} />
          </tr>
        </thead>
        <tbody>
          {sorted.map((process) => (
            <tr key={process.pid}>
              <td className="task-manager-cell-truncate task-manager-col-name" title={process.command ?? process.name}>
                {process.name}
              </td>
              <td
                className="task-manager-ports task-manager-cell-truncate"
                title={formatPorts(process.ports)}
              >
                {formatPorts(process.ports)}
              </td>
              <td className="task-manager-cell-compact" title={formatFileSize(process.memory_bytes)}>
                {formatFileSize(process.memory_bytes)}
              </td>
              <td className="task-manager-cell-compact" title={`${process.cpu_percent.toFixed(1)}%`}>
                {process.cpu_percent.toFixed(1)}%
              </td>
              <td className="task-manager-actions">
                {confirmPid === process.pid ? (
                  <div className="task-manager-kill-confirm">
                    <span className="task-manager-kill-confirm-text">
                      {t("taskManager.killConfirm", {
                        name: process.name,
                        pid: process.pid,
                      })}
                    </span>
                    <div className="task-manager-kill-confirm-actions">
                      <button
                        type="button"
                        className="task-manager-confirm-cancel"
                        aria-label={t("common:cancel")}
                        onClick={() => setConfirmPid(null)}
                      >
                        {t("common:cancel")}
                      </button>
                      <button
                        type="button"
                        className="task-manager-confirm-kill"
                        aria-label={t("taskManager.confirmKill")}
                        onClick={() => {
                          setConfirmPid(null);
                          onKill(process);
                        }}
                      >
                        {t("taskManager.kill")}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="task-manager-kill"
                    aria-label={t("taskManager.killAria", {
                      name: process.name,
                      pid: process.pid,
                    })}
                    title={t("taskManager.killTitle", { name: process.name })}
                    onClick={() => setConfirmPid(process.pid)}
                  >
                    ×
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
