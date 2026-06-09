import { useCallback, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { ProcessEntry } from "../types";
import { formatFileSize } from "../lib/fileType";

export type ProcessSortKey = "name" | "cpu" | "memory" | "port";
export type SortDirection = "asc" | "desc";

type ResizableColumnKey = "name" | "port" | "memory" | "cpu";

const COLUMN_WIDTHS_KEY = "terminal-wisely.task-manager-columns";
const ACTIONS_COLUMN_WIDTH = 28;

const DEFAULT_COLUMN_WIDTHS = {
  port: 56,
  memory: 52,
  cpu: 44,
} as const;

const MIN_COLUMN_WIDTHS: Record<ResizableColumnKey, number> = {
  name: 80,
  port: 48,
  memory: 48,
  cpu: 40,
};

const MAX_COLUMN_WIDTHS = {
  memory: 64,
  cpu: 52,
} as const;

interface ColumnWidths {
  name: number | null;
  port: number;
  memory: number;
  cpu: number;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function loadColumnWidths(): ColumnWidths {
  try {
    const raw = localStorage.getItem(COLUMN_WIDTHS_KEY);
    if (!raw) {
      return { name: null, ...DEFAULT_COLUMN_WIDTHS };
    }
    const parsed = JSON.parse(raw) as Partial<ColumnWidths>;
    return {
      name: typeof parsed.name === "number" ? parsed.name : null,
      port: parsed.port ?? DEFAULT_COLUMN_WIDTHS.port,
      memory: clamp(
        parsed.memory ?? DEFAULT_COLUMN_WIDTHS.memory,
        MIN_COLUMN_WIDTHS.memory,
        MAX_COLUMN_WIDTHS.memory,
      ),
      cpu: clamp(
        parsed.cpu ?? DEFAULT_COLUMN_WIDTHS.cpu,
        MIN_COLUMN_WIDTHS.cpu,
        MAX_COLUMN_WIDTHS.cpu,
      ),
    };
  } catch {
    return { name: null, ...DEFAULT_COLUMN_WIDTHS };
  }
}

interface TaskManagerTableProps {
  processes: ProcessEntry[];
  loading: boolean;
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
  sortKey,
  sortDirection,
  onKill,
  onSort,
}: TaskManagerTableProps) {
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

  const persistColumnWidths = useCallback((next: ColumnWidths) => {
    localStorage.setItem(COLUMN_WIDTHS_KEY, JSON.stringify(next));
  }, []);

  const startColumnResize = useCallback(
    (column: ResizableColumnKey, event: ReactMouseEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const table = (event.currentTarget as HTMLElement).closest("table");
      const startWidth =
        column === "name" && columnWidths.name == null
          ? (table?.querySelector(".task-manager-col-name")?.getBoundingClientRect().width ??
            160)
          : columnWidths[column] ?? MIN_COLUMN_WIDTHS[column];

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
        const next = Math.max(
          MIN_COLUMN_WIDTHS[state.column],
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

  const renderHeader = (
    column: ResizableColumnKey,
    label: string,
    sort: ProcessSortKey,
    extraClass = "",
  ) => (
    <th
      className={`task-manager-th-resizable ${extraClass}`.trim()}
      style={
        column === "name" && columnWidths.name == null
          ? undefined
          : { width: columnWidths[column] ?? undefined }
      }
    >
      <button type="button" className="task-manager-sort" onClick={() => onSort(sort)}>
        {label} {sortIndicator(sortKey === sort, sortDirection)}
      </button>
      <span
        className="task-manager-col-resizer"
        role="separator"
        aria-orientation="vertical"
        aria-label={`调整${label}列宽`}
        onMouseDown={(event) => startColumnResize(column, event)}
      />
    </th>
  );

  if (loading && processes.length === 0) {
    return <div className="task-manager-empty">正在加载进程…</div>;
  }

  if (processes.length === 0) {
    return <div className="task-manager-empty">暂无进程数据</div>;
  }

  return (
    <div className="task-manager-table-wrap">
      <table className="task-manager-table">
        <colgroup>
          <col
            className="task-manager-col-name"
            style={columnWidths.name != null ? { width: columnWidths.name } : undefined}
          />
          <col style={{ width: columnWidths.port }} />
          <col style={{ width: columnWidths.memory }} />
          <col style={{ width: columnWidths.cpu }} />
          <col style={{ width: ACTIONS_COLUMN_WIDTH }} />
        </colgroup>
        <thead>
          <tr>
            {renderHeader("name", "进程名", "name", "task-manager-col-name")}
            {renderHeader("port", "端口", "port")}
            {renderHeader("memory", "内存", "memory", "task-manager-th-compact")}
            {renderHeader("cpu", "CPU", "cpu", "task-manager-th-compact")}
            <th className="task-manager-th-actions" aria-label="操作" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((process) => (
            <tr key={process.pid}>
              <td className="task-manager-cell-truncate task-manager-col-name" title={process.name}>
                {process.name}
              </td>
              <td
                className="task-manager-ports task-manager-cell-truncate"
                title={formatPorts(process.ports)}
              >
                {formatPorts(process.ports)}
              </td>
              <td className="task-manager-cell-truncate task-manager-cell-compact">
                {formatFileSize(process.memory_bytes)}
              </td>
              <td className="task-manager-cell-truncate task-manager-cell-compact">
                {process.cpu_percent.toFixed(1)}%
              </td>
              <td className="task-manager-actions">
                {confirmPid === process.pid ? (
                  <div className="task-manager-kill-confirm">
                    <span className="task-manager-kill-confirm-text">
                      结束 {process.name} ({process.pid})？
                    </span>
                    <div className="task-manager-kill-confirm-actions">
                      <button
                        type="button"
                        className="task-manager-confirm-cancel"
                        aria-label="取消"
                        onClick={() => setConfirmPid(null)}
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        className="task-manager-confirm-kill"
                        aria-label="确认结束"
                        onClick={() => {
                          setConfirmPid(null);
                          onKill(process);
                        }}
                      >
                        结束
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="task-manager-kill"
                    aria-label={`结束进程 ${process.name} (${process.pid})`}
                    title={`结束 ${process.name}`}
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
