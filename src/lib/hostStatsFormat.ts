import i18n from "../i18n";

export function formatBytes(bytes: number, decimals = 1) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(decimals)} KB`;
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(decimals)} MB`;
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(decimals)} GB`;
}

export function formatRate(bps: number) {
  return `${formatBytes(bps)}/s`;
}

/** Fixed-width rate for status bar (reduces layout jitter). */
export function formatRateCompact(bps: number) {
  const abs = Math.max(0, bps);
  if (abs < 1024) {
    return `${abs.toFixed(0).padStart(4, "\u2007")} B/s`;
  }
  if (abs < 1024 * 1024) {
    return `${(abs / 1024).toFixed(1).padStart(5, "\u2007")}KB/s`;
  }
  if (abs < 1024 * 1024 * 1024) {
    return `${(abs / (1024 * 1024)).toFixed(1).padStart(5, "\u2007")}MB/s`;
  }
  return `${(abs / (1024 * 1024 * 1024)).toFixed(1).padStart(5, "\u2007")}GB/s`;
}

export function formatUptime(seconds: number) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) {
    return i18n.t("tools:hostStats.uptimeDaysHours", { days, hours });
  }
  if (hours > 0) {
    return i18n.t("tools:hostStats.uptimeHoursMinutes", { hours, minutes });
  }
  return i18n.t("tools:hostStats.uptimeMinutes", { minutes });
}

export function percentUsed(used: number, total: number) {
  if (total <= 0) return 0;
  return Math.min(100, (used / total) * 100);
}
