import { useTranslation } from "react-i18next";
import type { K8sClusterSummary as Summary, K8sWarningEvent } from "../../lib/k8s/types";

export function K8sClusterSummaryView({
  summary,
  loading,
  clusterName,
  onWarningClick,
}: {
  summary: Summary | null;
  loading: boolean;
  clusterName: string;
  onWarningClick?: (ev: K8sWarningEvent) => void;
}) {
  const { t } = useTranslation("k8s");

  if (loading && !summary) {
    return <p className="k8s-loading">{t("loading")}</p>;
  }
  if (!summary) {
    return <p className="k8s-detail-empty">{t("summaryEmpty")}</p>;
  }

  const phases = Object.entries(summary.pod_counts).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  return (
    <div className="k8s-cluster-summary">
      <header className="k8s-cluster-summary-head">
        <h2>{t("category.cluster_overview")}</h2>
        <p className="k8s-cluster-summary-meta">
          {clusterName}
          {summary.version ? ` · ${summary.version}` : ""}
          {" · "}
          {t("summaryNodes", { count: summary.node_count })}
        </p>
      </header>

      <section className="k8s-summary-section">
        <h3>{t("summaryPodPhases")}</h3>
        {phases.length === 0 ? (
          <p className="k8s-detail-empty">{t("summaryNoPods")}</p>
        ) : (
          <ul className="k8s-summary-phase-list">
            {phases.map(([phase, count]) => (
              <li key={phase}>
                <span className="k8s-summary-phase">{phase}</span>
                <strong>{count}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="k8s-summary-section">
        <h3>{t("summaryWarnings")}</h3>
        {summary.recent_warnings.length === 0 ? (
          <p className="k8s-detail-empty">{t("summaryNoWarnings")}</p>
        ) : (
          <ul className="k8s-summary-events">
            {summary.recent_warnings.map((ev, i) => {
              const clickable = Boolean(onWarningClick && ev.kind?.trim());
              return (
                <li key={`${ev.namespace}/${ev.name}/${ev.reason}/${i}`}>
                  <button
                    type="button"
                    className={`k8s-summary-event-btn${clickable ? "" : " k8s-summary-event-btn--static"}`}
                    disabled={!clickable}
                    title={clickable ? t("warningNavigateHint") : undefined}
                    onClick={() => onWarningClick?.(ev)}
                  >
                    <div className="k8s-summary-event-head">
                      <span className="k8s-summary-event-reason">{ev.reason}</span>
                      {ev.age ? (
                        <span className="k8s-summary-event-age">{ev.age}</span>
                      ) : null}
                    </div>
                    <div className="k8s-summary-event-target">
                      {ev.kind ? `${ev.kind} · ` : ""}
                      {ev.namespace ? `${ev.namespace}/` : ""}
                      {ev.name}
                    </div>
                    <p className="k8s-summary-event-msg">{ev.message}</p>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
