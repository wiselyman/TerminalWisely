interface HostStatsGaugeProps {
  label: string;
  value: number;
  detail?: string;
  warnAbove?: number;
}

export function HostStatsGauge({
  label,
  value,
  detail,
  warnAbove = 85,
}: HostStatsGaugeProps) {
  const clamped = Math.max(0, Math.min(100, value));
  const tone =
    clamped >= warnAbove ? "critical" : clamped >= 70 ? "warn" : "normal";

  return (
    <div className={`host-stats-gauge host-stats-gauge-${tone}`}>
      <div className="host-stats-gauge-head">
        <span className="host-stats-gauge-label">{label}</span>
        <span className="host-stats-gauge-value">{clamped.toFixed(1)}%</span>
      </div>
      <div className="host-stats-gauge-track" aria-hidden="true">
        <div
          className="host-stats-gauge-fill"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {detail ? <span className="host-stats-gauge-detail">{detail}</span> : null}
    </div>
  );
}
