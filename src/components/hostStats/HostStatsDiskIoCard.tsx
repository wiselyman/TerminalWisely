import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("tools");
  return (
    <div className="host-stats-network-card">
      <div className="host-stats-network-head">
        <p className="host-stats-network-card-label">{t("hostStats.diskIo")}</p>
        <div className="host-stats-network-stats">
          <span className="host-stats-network-rate">
            <span className="host-stats-network-dir">{t("hostStats.read")}</span>
            {diskIoRates ? formatRate(diskIoRates.readBps) : t("hostStats.sampling")}
          </span>
          <span className="host-stats-network-divider" aria-hidden="true">
            ·
          </span>
          <span className="host-stats-network-rate">
            <span className="host-stats-network-dir">{t("hostStats.write")}</span>
            {diskIoRates ? formatRate(diskIoRates.writeBps) : t("hostStats.sampling")}
          </span>
          <span className="host-stats-network-total">
            {t("hostStats.total", {
              a: formatBytes(totalReadBytes),
              b: formatBytes(totalWriteBytes),
            })}
          </span>
        </div>
      </div>
    </div>
  );
}
