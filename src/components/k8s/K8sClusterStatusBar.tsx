import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Boxes,
  Cpu,
  MemoryStick,
  Server,
  ShipWheel,
} from "lucide-react";
import { buildK8sStatusBarChips } from "../../lib/k8s/clusterStatusBar";
import { useK8sStore } from "../../stores/k8sStore";
import { StatusBarToasts } from "../StatusBarToasts";
import { StatusBarTransfers } from "../StatusBarTransfers";

const iconProps = { size: 14, strokeWidth: 1.5 } as const;

function chipIcon(id: string): ReactNode {
  switch (id) {
    case "name":
    case "empty":
      return <ShipWheel {...iconProps} />;
    case "version":
      return <Server {...iconProps} />;
    case "nodes":
      return <Server {...iconProps} />;
    case "pods":
      return <Boxes {...iconProps} />;
    case "cpu":
      return <Cpu {...iconProps} />;
    case "mem":
      return <MemoryStick {...iconProps} />;
    case "warnings":
      return <AlertTriangle {...iconProps} />;
    default:
      return <Server {...iconProps} />;
  }
}

export function K8sClusterStatusBar() {
  const { t } = useTranslation("k8s");
  const cluster = useK8sStore((s) => s.selectedCluster);
  const summary = useK8sStore((s) => s.clusterSummary);
  const loading = useK8sStore((s) => s.clusterSummaryLoading);

  const chips = useMemo(
    () =>
      buildK8sStatusBarChips({
        clusterName: cluster?.display_name ?? null,
        clusterKind: cluster?.kind ?? null,
        clusterId: cluster?.id ?? null,
        summary,
        loading,
      }),
    [cluster?.display_name, cluster?.kind, cluster?.id, summary, loading],
  );

  return (
    <footer
      className="host-stats-statusbar k8s-cluster-statusbar"
      data-testid="k8s-cluster-statusbar"
      aria-label={t("statusBarAria")}
      aria-busy={loading && !summary}
    >
      <div className="host-stats-statusbar-start">
        {chips.map((chip) => {
          const label =
            chip.id === "empty" ? t("statusBarNoCluster") : chip.label;
          const title =
            chip.id === "nodes"
              ? t("statusBarNodes")
              : chip.id === "pods"
                ? t("statusBarPods")
                : chip.id === "cpu"
                  ? t("statusBarCpu")
                  : chip.id === "mem"
                    ? t("statusBarMem")
                    : chip.id === "warnings"
                      ? t("statusBarWarnings")
                      : chip.title;
          return (
            <span
              key={chip.id}
              className={`host-stats-statusbar-item ${chip.tone}`.trim()}
              title={title}
              data-testid={`k8s-statusbar-${chip.id}`}
            >
              <span className="host-stats-statusbar-icon" aria-hidden>
                {chipIcon(chip.id)}
              </span>
              <span className="host-stats-statusbar-value">{label}</span>
            </span>
          );
        })}
      </div>
      <div className="host-stats-statusbar-end">
        <StatusBarTransfers />
        <StatusBarToasts />
      </div>
    </footer>
  );
}
