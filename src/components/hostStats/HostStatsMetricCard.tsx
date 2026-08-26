import { HostStatsGauge } from "./HostStatsGauge";
import { HostStatsSparkline } from "./HostStatsSparkline";

interface HostStatsMetricCardProps {
  label: string;
  value: number;
  detail?: string;
  values: number[];
  sparklineColor?: string;
  warnAbove?: number;
}

export function HostStatsMetricCard({
  label,
  value,
  detail,
  values,
  sparklineColor = "#58a6ff",
  warnAbove,
}: HostStatsMetricCardProps) {
  return (
    <div className="host-stats-metric-card">
      <HostStatsGauge
        label={label}
        value={value}
        detail={detail}
        warnAbove={warnAbove}
      />
      <HostStatsSparkline
        label={label}
        values={values}
        color={sparklineColor}
        compact
        formatValue={(point) => `${point.toFixed(1)}%`}
      />
    </div>
  );
}
