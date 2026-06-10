import type { DiskUsageEntry } from "../../types";
import { formatBytes, percentUsed } from "../../lib/hostStatsFormat";

interface HostStatsDiskListProps {
  disks: DiskUsageEntry[];
}

export function HostStatsDiskList({ disks }: HostStatsDiskListProps) {
  if (disks.length === 0) {
    return <p className="host-stats-empty">暂无磁盘信息</p>;
  }

  return (
    <ul className="host-stats-disk-list">
      {disks.map((disk) => {
        const percent = percentUsed(disk.used_bytes, disk.total_bytes);
        const tone = percent >= 85 ? "critical" : percent >= 70 ? "warn" : "normal";
        return (
          <li key={`${disk.mount_point}-${disk.filesystem ?? ""}`} className="host-stats-disk-item">
            <div className="host-stats-disk-head">
              <span className="host-stats-disk-mount" title={disk.mount_point}>
                {disk.mount_point}
              </span>
              <span className="host-stats-disk-size">
                {formatBytes(disk.used_bytes)} / {formatBytes(disk.total_bytes)}
              </span>
            </div>
            <div className={`host-stats-disk-track host-stats-disk-${tone}`}>
              <div
                className="host-stats-disk-fill"
                style={{ width: `${percent.toFixed(1)}%` }}
              />
            </div>
            <span className="host-stats-disk-meta">
              {disk.filesystem ? `${disk.filesystem} · ` : ""}
              {percent.toFixed(1)}%
            </span>
          </li>
        );
      })}
    </ul>
  );
}
