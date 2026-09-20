import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useTaskManagerStore } from "../../stores/taskManagerStore";
import type { ProcessEntry } from "../../types";
import { TaskManagerTable } from "../TaskManagerTable";
import { DesktopAppWindow } from "./DesktopAppWindow";

type Props = {
  sessionId: string;
  sessionTitle?: string | null;
};

function matchesFilter(process: ProcessEntry, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  const portQuery = trimmed.replace(/^:/, "");
  if (/^\d+$/.test(portQuery)) {
    return process.ports.includes(Number(portQuery));
  }
  if (process.name.toLowerCase().includes(lower)) return true;
  if (process.command?.toLowerCase().includes(lower)) return true;
  return false;
}

export function ProcessManagerPanel({ sessionId, sessionTitle }: Props) {
  const { t } = useTranslation(["tools", "common"]);

  const {
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

  const filteredProcesses = useMemo(
    () => processes.filter((process) => matchesFilter(process, filterQuery)),
    [filterQuery, processes],
  );

  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString()
    : null;

  const subtitle =
    sessionTitle ??
    (lastUpdatedLabel
      ? t("common:updatedAt", { time: lastUpdatedLabel })
      : null);

  return (
    <DesktopAppWindow
      appId="processes"
      title={t("desktop.appProcesses")}
      subtitle={subtitle}
      panelTestId="host-process-manager-panel"
      floatTestId="host-process-manager-float"
      minimizeTestId="host-process-manager-minimize"
      maximizeTestId="host-process-manager-maximize"
      closeTestId="host-process-manager-close"
      bodyClassName="process-manager-float-body task-manager-panel open"
    >
      <div className="task-manager-toolbar">
        <input
          type="search"
          className="task-manager-search"
          placeholder={t("taskManager.filterPlaceholder")}
          value={filterQuery}
          onChange={(event) => setFilterQuery(event.target.value)}
          data-testid="host-process-manager-filter"
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
    </DesktopAppWindow>
  );
}
