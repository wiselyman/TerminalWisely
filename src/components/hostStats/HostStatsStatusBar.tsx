import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  formatBytes,
  formatRateCompact,
  formatUptime,
  percentUsed,
} from "../../lib/hostStatsFormat";
import { useHostStatsStore } from "../../stores/hostStatsStore";
import type { DiskUsageEntry } from "../../types";

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

type Props = {
  sessionId: string;
};

export function HostStatsStatusBar({ sessionId }: Props) {
  const { t } = useTranslation("tools");
  const snapshot = useHostStatsStore((s) => s.snapshot);
  const activeSessionId = useHostStatsStore((s) => s.activeSessionId);
  const networkRates = useHostStatsStore((s) => s.networkRates);
  const diskIoRates = useHostStatsStore((s) => s.diskIoRates);
  const loading = useHostStatsStore((s) => s.loading);
  const error = useHostStatsStore((s) => s.error);

  const forSession = activeSessionId === sessionId ? snapshot : null;

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

  if (!forSession) {
    // First connect / still collecting — never flash "Stats unavailable".
    return (
      <footer className="host-stats-statusbar" aria-busy={loading || !!error}>
        <span className="host-stats-statusbar-item is-muted">
          {t("hostStats.collecting")}
        </span>
      </footer>
    );
  }

  const osLabel = forSession.os_version
    ? `${forSession.os_name} ${forSession.os_version}`
    : forSession.os_name;

  const cpuText = `CPU ${forSession.cpu_usage_percent.toFixed(0).padStart(3, "\u2007")}%`;
  const memText = `Mem ${memPercent.toFixed(0).padStart(3, "\u2007")}%`;
  const loadText = `Load ${forSession.load_avg[0].toFixed(2)}`;
  const netText = networkRates
    ? `↓${formatRateCompact(networkRates.rxBps)} ↑${formatRateCompact(networkRates.txBps)}`
    : t("hostStats.sampling");
  const diskIoText = diskIoRates
    ? `R ${formatRateCompact(diskIoRates.readBps)} W ${formatRateCompact(diskIoRates.writeBps)}`
    : t("hostStats.sampling");
  const diskText = disk
    ? `${disk.mount_point} ${diskPercent.toFixed(0).padStart(3, "\u2007")}%`
    : null;
  const procsText = `${String(forSession.process_count).padStart(4, "\u2007")} procs`;

  return (
    <footer
      className="host-stats-statusbar"
      title={tooltip}
      aria-label={t("hostStats.title")}
    >
      <span className="host-stats-statusbar-item is-host">
        <strong className="host-stats-statusbar-host-name">
          {forSession.hostname}
        </strong>
        <span className="host-stats-statusbar-sep">·</span>
        <span className="host-stats-statusbar-os">{osLabel}</span>
      </span>
      <span
        className={`host-stats-statusbar-item is-cpu ${toneClass(forSession.cpu_usage_percent)}`}
      >
        {cpuText}
      </span>
      <span
        className={`host-stats-statusbar-item is-mem ${toneClass(memPercent)}`}
      >
        {memText}
      </span>
      <span className="host-stats-statusbar-item is-load">{loadText}</span>
      <span className="host-stats-statusbar-item is-net">{netText}</span>
      <span className="host-stats-statusbar-item is-diskio">{diskIoText}</span>
      {diskText ? (
        <span
          className={`host-stats-statusbar-item is-disk ${toneClass(diskPercent)}`}
        >
          {diskText}
        </span>
      ) : null}
      <span className="host-stats-statusbar-item is-procs">{procsText}</span>
    </footer>
  );
}
