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

/** Fixed-width rate for status bar (short; tabular nums handle alignment). */
export function formatRateCompact(bps: number) {
  const abs = Math.max(0, bps);
  if (abs < 1024) return `${abs.toFixed(0)}B/s`;
  if (abs < 1024 * 1024) return `${(abs / 1024).toFixed(0)}K/s`;
  if (abs < 1024 * 1024 * 1024) {
    return `${(abs / (1024 * 1024)).toFixed(1)}M/s`;
  }
  return `${(abs / (1024 * 1024 * 1024)).toFixed(1)}G/s`;
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
