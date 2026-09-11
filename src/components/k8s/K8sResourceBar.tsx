import {
  formatUsagePercent,
  resourceToUnits,
  usageRatio,
  type ResourceBarKind,
} from "../../lib/k8s/metricsFormat";

export function K8sResourceBar({
  kind,
  usage,
  requests,
  limits,
  capacity,
}: {
  kind: ResourceBarKind;
  usage?: string | null;
  requests?: string | null;
  limits?: string | null;
  capacity?: string | null;
}) {
  const cap = capacity ? resourceToUnits(kind, capacity) : null;
  if (cap == null || cap <= 0) {
    return <span className="k8s-resource-bar-na">—</span>;
  }

  const usageVal = usage ? resourceToUnits(kind, usage) : null;
  const reqVal = requests ? resourceToUnits(kind, requests) : null;
  const limVal = limits ? resourceToUnits(kind, limits) : null;
  const usagePct = usageVal != null ? usageRatio(usageVal, cap) : null;
  const reqPct = reqVal != null ? usageRatio(reqVal, cap) : null;
  const limPct = limVal != null ? usageRatio(limVal, cap) : null;

  const title = [
    usage ? `${usage} used` : null,
    requests ? `${requests} req` : null,
    limits ? `${limits} lim` : null,
    capacity ? `/ ${capacity}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      className="k8s-resource-bar"
      title={title}
      role="img"
      aria-label={title}
    >
      {limPct != null && limPct > 0 ? (
        <span
          className="k8s-resource-bar-seg k8s-resource-bar-seg--limits"
          style={{ width: `${Math.min(limPct * 100, 100)}%` }}
        />
      ) : null}
      {reqPct != null && reqPct > 0 ? (
        <span
          className="k8s-resource-bar-seg k8s-resource-bar-seg--requests"
          style={{ width: `${Math.min(reqPct * 100, 100)}%` }}
        />
      ) : null}
      {usagePct != null && usagePct > 0 ? (
        <span
          className="k8s-resource-bar-seg k8s-resource-bar-seg--usage"
          style={{ width: `${Math.min(usagePct * 100, 100)}%` }}
        />
      ) : null}
      {usagePct != null ? (
        <span className="k8s-resource-bar-pct">{formatUsagePercent(usagePct)}</span>
      ) : reqPct != null ? (
        <span className="k8s-resource-bar-pct">{formatUsagePercent(reqPct)}</span>
      ) : null}
    </div>
  );
}
