import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import {
  formatBytes,
  formatUptime,
  percentUsed,
} from "../../lib/hostStatsFormat";
import { useHostStatsStore } from "../../stores/hostStatsStore";
import { ServerOsIcon } from "../ServerOsIcon";
import { HostStatsDiskIoCard } from "./HostStatsDiskIoCard";
import { HostStatsDiskList } from "./HostStatsDiskList";
import { HostStatsMetricCard } from "./HostStatsMetricCard";
import { HostStatsNetworkCard } from "./HostStatsNetworkCard";
import { HostStatsUserList } from "./HostStatsUserList";
import { WorkspacePanelBackdrop } from "../WorkspacePanelBackdrop";

interface HostStatsPanelProps {
  sessionId: string;
  sessionTitle: string;
  osId?: string | null;
  osName?: string | null;
}

export function HostStatsPanel({
  sessionTitle,
  osId,
  osName,
}: HostStatsPanelProps) {
  const { t } = useTranslation("tools");
  const {
    width,
    setWidth,
    snapshot,
    loading,
    error,
    lastUpdated,
    networkRates,
    totalRxBytes,
    totalTxBytes,
    diskIoRates,
    totalDiskReadBytes,
    totalDiskWriteBytes,
    history,
  } = useHostStatsStore();

  const memPercent = snapshot
    ? percentUsed(snapshot.memory_used_bytes, snapshot.memory_total_bytes)
    : 0;
  const swapPercent = snapshot
    ? percentUsed(snapshot.swap_used_bytes, snapshot.swap_total_bytes)
    : 0;

  const cpuHistory = useMemo(() => history.map((point) => point.cpu), [history]);
  const memHistory = useMemo(() => history.map((point) => point.mem), [history]);

  const lastUpdatedLabel = lastUpdated
    ? new Date(lastUpdated).toLocaleTimeString()
    : null;

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    document.body.classList.add("host-stats-resizing");

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      setWidth(startWidth + delta);
    };

    const onMouseUp = () => {
      document.body.classList.remove("host-stats-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  return (
    <>
      <WorkspacePanelBackdrop />
      <aside className="host-stats-panel open" style={{ width }} aria-hidden={false}>
        <div
          className="host-stats-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("hostStats.resizeAria")}
          onMouseDown={startResize}
        />
        <div className="host-stats-head">
          <div className="host-stats-title-wrap">
            <h2 className="host-stats-title">{t("hostStats.title")}</h2>
            <p className="host-stats-session">{sessionTitle}</p>
          </div>
        </div>

        <div className="host-stats-body">
          {loading && !snapshot ? (
            <p className="host-stats-empty">{t("hostStats.collecting")}</p>
          ) : null}
          {error ? <p className="host-stats-error">{error}</p> : null}

          {snapshot ? (
            <>
              <section className="host-stats-section host-stats-info-card">
                <div className="host-stats-info-head">
                  <ServerOsIcon osId={osId} osName={osName ?? snapshot.os_name} size={20} />
                  <div>
                    <p className="host-stats-info-hostname">{snapshot.hostname}</p>
                    <p className="host-stats-info-os">
                      {snapshot.os_name}
                      {snapshot.os_version ? ` ${snapshot.os_version}` : ""}
                    </p>
                  </div>
                </div>
                <dl className="host-stats-info-grid">
                  <div>
                    <dt>{t("hostStats.kernel")}</dt>
                    <dd>{snapshot.kernel_version ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("hostStats.arch")}</dt>
                    <dd>{snapshot.arch}</dd>
                  </div>
                  <div>
                    <dt>{t("hostStats.timezone")}</dt>
                    <dd>{snapshot.timezone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>{t("hostStats.uptime")}</dt>
                    <dd>{formatUptime(snapshot.uptime_secs)}</dd>
                  </div>
                  <div>
                    <dt>{t("hostStats.load")}</dt>
                    <dd>
                      {snapshot.load_avg.map((value) => value.toFixed(2)).join(" / ")}
                    </dd>
                  </div>
                  <div>
                    <dt>{t("hostStats.processCount")}</dt>
                    <dd>{snapshot.process_count}</dd>
                  </div>
                </dl>
              </section>

              <div className="host-stats-metrics-block">
                <div className="host-stats-metrics-top">
                  <HostStatsMetricCard
                    label={t("hostStats.cpu")}
                    value={snapshot.cpu_usage_percent}
                    detail={t("hostStats.cpuCores", { n: snapshot.cpu_core_count })}
                    values={cpuHistory}
                  />
                  <HostStatsMetricCard
                    label={t("hostStats.memory")}
                    value={memPercent}
                    detail={
                      snapshot.swap_total_bytes > 0
                        ? `${formatBytes(snapshot.memory_used_bytes)} / ${formatBytes(snapshot.memory_total_bytes)} · Swap ${swapPercent.toFixed(0)}%`
                        : `${formatBytes(snapshot.memory_used_bytes)} / ${formatBytes(snapshot.memory_total_bytes)}`
                    }
                    values={memHistory}
                    sparklineColor="#3fb950"
                  />
                </div>
                <HostStatsNetworkCard
                  networkRates={networkRates}
                  totalRxBytes={totalRxBytes}
                  totalTxBytes={totalTxBytes}
                />
                <HostStatsDiskIoCard
                  diskIoRates={diskIoRates}
                  totalReadBytes={totalDiskReadBytes}
                  totalWriteBytes={totalDiskWriteBytes}
                />
              </div>

              <HostStatsUserList users={snapshot.logged_in_users} />

              <section className="host-stats-section">
                <h3 className="host-stats-section-title">{t("hostStats.disk")}</h3>
                <HostStatsDiskList disks={snapshot.disks} />
              </section>

              {lastUpdatedLabel ? (
                <p className="host-stats-updated">
                  {t("common:updatedAt", { time: lastUpdatedLabel })}
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
