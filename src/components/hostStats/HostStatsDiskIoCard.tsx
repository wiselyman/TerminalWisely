import { formatBytes, formatRate } from "../../lib/hostStatsFormat";

interface HostStatsDiskIoCardProps {
  diskIoRates: { readBps: number; writeBps: number } | null;
  totalReadBytes: number;
  totalWriteBytes: number;
}

export function HostStatsDiskIoCard({
  diskIoRates,
  totalReadBytes,
  totalWriteBytes,
}: HostStatsDiskIoCardProps) {
  return (
    <div className="host-stats-network-card">
      <div className="host-stats-network-head">
        <p className="host-stats-network-card-label">磁盘 IO</p>
        <div className="host-stats-network-stats">
          <span className="host-stats-network-rate">
            <span className="host-stats-network-dir">读</span>
            {diskIoRates ? formatRate(diskIoRates.readBps) : "采样中…"}
          </span>
          <span className="host-stats-network-divider" aria-hidden="true">
            ·
          </span>
          <span className="host-stats-network-rate">
            <span className="host-stats-network-dir">写</span>
            {diskIoRates ? formatRate(diskIoRates.writeBps) : "采样中…"}
          </span>
          <span className="host-stats-network-total">
            累计 {formatBytes(totalReadBytes)} / {formatBytes(totalWriteBytes)}
          </span>
        </div>
      </div>
    </div>
  );
}
