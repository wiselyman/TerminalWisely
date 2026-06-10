import { formatBytes, formatRate } from "../../lib/hostStatsFormat";

interface HostStatsNetworkCardProps {
  networkRates: { rxBps: number; txBps: number } | null;
  totalRxBytes: number;
  totalTxBytes: number;
}

export function HostStatsNetworkCard({
  networkRates,
  totalRxBytes,
  totalTxBytes,
}: HostStatsNetworkCardProps) {
  return (
    <div className="host-stats-network-card">
      <div className="host-stats-network-head">
        <p className="host-stats-network-card-label">网络</p>
        <div className="host-stats-network-stats">
          <span className="host-stats-network-rate">
            <span className="host-stats-network-dir">↓</span>
            {networkRates ? formatRate(networkRates.rxBps) : "采样中…"}
          </span>
          <span className="host-stats-network-divider" aria-hidden="true">
            ·
          </span>
          <span className="host-stats-network-rate">
            <span className="host-stats-network-dir">↑</span>
            {networkRates ? formatRate(networkRates.txBps) : "采样中…"}
          </span>
          <span className="host-stats-network-total">
            累计 {formatBytes(totalRxBytes)} / {formatBytes(totalTxBytes)}
          </span>
        </div>
      </div>
    </div>
  );
}
