import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("tools");
  return (
    <div className="host-stats-network-card">
      <div className="host-stats-network-head">
        <p className="host-stats-network-card-label">{t("hostStats.network")}</p>
        <div className="host-stats-network-stats">
          <span className="host-stats-network-rate">
            <span className="host-stats-network-dir">↓</span>
            {networkRates ? formatRate(networkRates.rxBps) : t("hostStats.sampling")}
          </span>
          <span className="host-stats-network-divider" aria-hidden="true">
            ·
          </span>
          <span className="host-stats-network-rate">
            <span className="host-stats-network-dir">↑</span>
            {networkRates ? formatRate(networkRates.txBps) : t("hostStats.sampling")}
          </span>
          <span className="host-stats-network-total">
            {t("hostStats.total", {
              a: formatBytes(totalRxBytes),
              b: formatBytes(totalTxBytes),
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
