import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Activity,
  Boxes,
  Cpu,
  Disc3,
  HardDrive,
  MemoryStick,
  Network,
  Server,
} from "lucide-react";
import {
  formatBytes,
  formatRateCompact,
  formatUptime,
  percentUsed,
} from "../../lib/hostStatsFormat";
import { useHostStatsStore } from "../../stores/hostStatsStore";
import type { DiskUsageEntry } from "../../types";
import { StatusBarToasts } from "../StatusBarToasts";
import { StatusBarTransfers } from "../StatusBarTransfers";

function pickPrimaryDisk(disks: DiskUsageEntry[]): DiskUsageEntry | null {
  if (disks.length === 0) return null;
  const root = disks.find((d) => d.mount_point === "/");
  if (root) return root;
  return disks.reduce((best, disk) => {
    const bestPct = percentUsed(best.used_bytes, best.total_bytes);
    const pct = percentUsed(disk.used_bytes, disk.total_bytes);
    return pct > bestPct ? disk : best;
  });
}

function toneClass(percent: number): string {
  if (percent >= 90) return "is-critical";
  if (percent >= 75) return "is-warn";
  return "";
}

function StatItem({
  icon,
  children,
  className = "",
  title,
}: {
  icon: ReactNode;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <span
      className={`host-stats-statusbar-item ${className}`.trim()}
      title={title}
    >
      <span className="host-stats-statusbar-icon" aria-hidden>
        {icon}
      </span>
      <span className="host-stats-statusbar-value">{children}</span>
    </span>
  );
}

const iconProps = { size: 14, strokeWidth: 1.5 } as const;

type Props = {
  /** When null/undefined, only transfers + toasts (Home / disconnected). */
  sessionId?: string | null;
};

export function HostStatsStatusBar({ sessionId }: Props) {
  const { t } = useTranslation("tools");
  const snapshot = useHostStatsStore((s) => s.snapshot);
  const activeSessionId = useHostStatsStore((s) => s.activeSessionId);
  const networkRates = useHostStatsStore((s) => s.networkRates);
  const diskIoRates = useHostStatsStore((s) => s.diskIoRates);
  const loading = useHostStatsStore((s) => s.loading);
  const error = useHostStatsStore((s) => s.error);

  const forSession =
    sessionId && activeSessionId === sessionId ? snapshot : null;

  const memPercent = forSession
    ? percentUsed(forSession.memory_used_bytes, forSession.memory_total_bytes)
    : 0;
  const disk = forSession ? pickPrimaryDisk(forSession.disks) : null;
  const diskPercent = disk
    ? percentUsed(disk.used_bytes, disk.total_bytes)
    : 0;

  const tooltip = useMemo(() => {
    if (!forSession) return t("hostStats.collecting");
    const lines = [
      `${forSession.hostname} · ${forSession.os_name}${forSession.os_version ? ` ${forSession.os_version}` : ""}`,
      forSession.kernel_version
        ? `${t("hostStats.kernel")}: ${forSession.kernel_version}`
        : null,
      `${t("hostStats.arch")}: ${forSession.arch}`,
      `${t("hostStats.uptime")}: ${formatUptime(forSession.uptime_secs)}`,
      forSession.timezone
        ? `${t("hostStats.timezone")}: ${forSession.timezone}`
        : null,
      `${t("hostStats.cpu")}: ${forSession.cpu_usage_percent.toFixed(1)}% (${t("hostStats.cpuCores", { n: forSession.cpu_core_count })})`,
      `${t("hostStats.memory")}: ${formatBytes(forSession.memory_used_bytes)} / ${formatBytes(forSession.memory_total_bytes)}`,
      forSession.swap_total_bytes > 0
        ? `Swap: ${formatBytes(forSession.swap_used_bytes)} / ${formatBytes(forSession.swap_total_bytes)}`
        : null,
      `${t("hostStats.load")}: ${forSession.load_avg.map((v) => v.toFixed(2)).join(" / ")}`,
      ...forSession.disks.map(
        (d) =>
          `${d.mount_point}: ${formatBytes(d.used_bytes)} / ${formatBytes(d.total_bytes)} (${percentUsed(d.used_bytes, d.total_bytes).toFixed(0)}%)`,
      ),
    ];
    return lines.filter(Boolean).join("\n");
  }, [forSession, t]);

  const metrics =
    !sessionId ? null : !forSession ? (
      <StatItem
        icon={<Server {...iconProps} />}
        className="is-muted"
        title={error || t("hostStats.collecting")}
      >
        …
      </StatItem>
    ) : (
      <>
        <StatItem
          icon={<Server {...iconProps} />}
          className="is-host"
          title={tooltip}
        >
          {forSession.hostname}
        </StatItem>
        <StatItem
          icon={<Cpu {...iconProps} />}
          className={`is-cpu ${toneClass(forSession.cpu_usage_percent)}`}
          title={`${t("hostStats.cpu")} ${forSession.cpu_usage_percent.toFixed(1)}%`}
        >
          {`${forSession.cpu_usage_percent.toFixed(0)}%`}
        </StatItem>
        <StatItem
          icon={<MemoryStick {...iconProps} />}
          className={`is-mem ${toneClass(memPercent)}`}
          title={`${t("hostStats.memory")} ${formatBytes(forSession.memory_used_bytes)} / ${formatBytes(forSession.memory_total_bytes)}`}
        >
          {`${memPercent.toFixed(0)}%`}
        </StatItem>
        <StatItem
          icon={<Activity {...iconProps} />}
          className="is-load"
          title={`${t("hostStats.load")} ${forSession.load_avg.map((v) => v.toFixed(2)).join(" / ")}`}
        >
          {forSession.load_avg[0].toFixed(2)}
        </StatItem>
        <StatItem
          icon={<Network {...iconProps} />}
          className="is-net"
          title={t("hostStats.network")}
        >
          {networkRates
            ? `↓${formatRateCompact(networkRates.rxBps)} ↑${formatRateCompact(networkRates.txBps)}`
            : "…"}
        </StatItem>
        <StatItem
          icon={<HardDrive {...iconProps} />}
          className="is-diskio"
          title={t("hostStats.diskIo")}
        >
          {diskIoRates
            ? t("hostStats.statusDiskIo", {
                read: formatRateCompact(diskIoRates.readBps),
                write: formatRateCompact(diskIoRates.writeBps),
              })
            : "…"}
        </StatItem>
        {disk ? (
          <StatItem
            icon={<Disc3 {...iconProps} />}
            className={`is-disk ${toneClass(diskPercent)}`}
            title={`${disk.mount_point}: ${formatBytes(disk.used_bytes)} / ${formatBytes(disk.total_bytes)}`}
          >
            {`${disk.mount_point} ${diskPercent.toFixed(0)}%`}
          </StatItem>
        ) : null}
        <StatItem
          icon={<Boxes {...iconProps} />}
          className="is-procs"
          title={t("hostStats.processCount")}
        >
          {forSession.process_count}
        </StatItem>
      </>
    );

  return (
    <footer
      className="host-stats-statusbar"
      title={forSession ? tooltip : undefined}
      aria-label={t("hostStats.title")}
      aria-busy={!!sessionId && !forSession && (loading || !!error)}
    >
      <div className="host-stats-statusbar-start">{metrics}</div>
      <div className="host-stats-statusbar-end">
        <StatusBarTransfers />
        <StatusBarToasts />
      </div>
    </footer>
  );
}
