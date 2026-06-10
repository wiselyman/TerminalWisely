interface HostStatsSparklineProps {
  label: string;
  values: number[];
  color?: string;
  compact?: boolean;
  formatValue?: (value: number) => string;
}

export function HostStatsSparkline({
  label,
  values,
  color = "#58a6ff",
  compact = false,
  formatValue = (value) => value.toFixed(1),
}: HostStatsSparklineProps) {
  const width = compact ? 200 : 160;
  const height = compact ? 28 : 36;
  const padding = 2;

  if (values.length === 0) {
    return (
      <div className={`host-stats-sparkline${compact ? " host-stats-sparkline-compact" : ""}`}>
        {!compact ? <span className="host-stats-sparkline-label">{label}</span> : null}
        <span className="host-stats-sparkline-empty">趋势采样中…</span>
      </div>
    );
  }

  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 0.001);
  const step =
    values.length > 1 ? (width - padding * 2) / (values.length - 1) : 0;

  const points = values
    .map((value, index) => {
      const x = padding + index * step;
      const y =
        height -
        padding -
        ((value - min) / range) * (height - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <div className={`host-stats-sparkline${compact ? " host-stats-sparkline-compact" : ""}`}>
      {!compact ? (
        <div className="host-stats-sparkline-head">
          <span className="host-stats-sparkline-label">{label}</span>
          <span className="host-stats-sparkline-latest">
            {formatValue(values[values.length - 1] ?? 0)}
          </span>
        </div>
      ) : null}
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="host-stats-sparkline-chart"
        aria-hidden="true"
      >
        <polyline
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          points={points}
        />
      </svg>
    </div>
  );
}
