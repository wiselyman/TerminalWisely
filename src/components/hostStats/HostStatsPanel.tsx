import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import {
  formatBytes,
  formatUptime,
  percentUsed,
} from "../../lib/hostStatsFormat";
import { useHostStatsStore } from "../../stores/hostStatsStore";
import { ServerOsIcon } from "../ServerOsIcon";
import { HostStatsDiskList } from "./HostStatsDiskList";
import { HostStatsMetricCard } from "./HostStatsMetricCard";
import { HostStatsNetworkCard } from "./HostStatsNetworkCard";
import { HostStatsUserList } from "./HostStatsUserList";

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
    history,
    close,
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
      <div className="host-stats-backdrop open" onClick={close} aria-hidden="true" />
      <aside className="host-stats-panel open" style={{ width }} aria-hidden={false}>
        <div
          className="host-stats-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整服务器资源面板宽度"
          onMouseDown={startResize}
        />
        <div className="host-stats-head">
          <div className="host-stats-title-wrap">
            <h2 className="host-stats-title">服务器资源</h2>
            <p className="host-stats-session">{sessionTitle}</p>
          </div>
          <button
            type="button"
            className="host-stats-close"
            onClick={close}
            aria-label="关闭服务器资源"
          >
            ×
          </button>
        </div>

        <div className="host-stats-body">
          {loading && !snapshot ? (
            <p className="host-stats-empty">正在采集…</p>
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
                    <dt>内核</dt>
                    <dd>{snapshot.kernel_version ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>架构</dt>
                    <dd>{snapshot.arch}</dd>
                  </div>
                  <div>
                    <dt>时区</dt>
                    <dd>{snapshot.timezone ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>运行时间</dt>
                    <dd>{formatUptime(snapshot.uptime_secs)}</dd>
                  </div>
                  <div>
                    <dt>负载</dt>
                    <dd>
                      {snapshot.load_avg.map((value) => value.toFixed(2)).join(" / ")}
                    </dd>
                  </div>
                  <div>
                    <dt>进程数</dt>
                    <dd>{snapshot.process_count}</dd>
                  </div>
                </dl>
              </section>

              <div className="host-stats-metrics-block">
                <div className="host-stats-metrics-top">
                  <HostStatsMetricCard
                    label="CPU"
                    value={snapshot.cpu_usage_percent}
                    detail={`${snapshot.cpu_core_count} 核`}
                    values={cpuHistory}
                  />
                  <HostStatsMetricCard
                    label="内存"
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
              </div>

              <HostStatsUserList users={snapshot.logged_in_users} />

              <section className="host-stats-section">
                <h3 className="host-stats-section-title">磁盘</h3>
                <HostStatsDiskList disks={snapshot.disks} />
              </section>

              {lastUpdatedLabel ? (
                <p className="host-stats-updated">更新于 {lastUpdatedLabel}</p>
              ) : null}
            </>
          ) : null}
        </div>
      </aside>
    </>
  );
}
