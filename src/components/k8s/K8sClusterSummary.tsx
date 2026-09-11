import { AlertTriangle, CheckCircle2, MessageSquare, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  formatUsagePercent,
  parseCpuToMilli,
  parseMemoryToKi,
  usageRatio,
} from "../../lib/k8s/metricsFormat";
import type { K8sClusterSummary as Summary, K8sWarningEvent } from "../../lib/k8s/types";

const PHASE_CLASS: Record<string, string> = {
  Running: "running",
  Succeeded: "succeeded",
  Pending: "pending",
  Failed: "failed",
  Unknown: "unknown",
};

function phaseClass(phase: string) {
  return PHASE_CLASS[phase] ?? "unknown";
}

function MetricRatioCard({
  label,
  usageLabel,
  capacityLabel,
  ratio,
  tone,
  unavailable,
}: {
  label: string;
  usageLabel?: string | null;
  capacityLabel?: string | null;
  ratio: number | null;
  tone: "cpu" | "memory" | "pods";
  unavailable: string;
}) {
  const pct = ratio != null ? formatUsagePercent(ratio) : null;
  const hasUsage = Boolean(usageLabel);

  return (
    <article className="k8s-summary-metric-card">
      <h3>{label}</h3>
      {hasUsage ? (
        <>
          <div className="k8s-summary-metric-values">
            <strong>{usageLabel}</strong>
            {capacityLabel ? (
              <span className="k8s-summary-metric-cap">/ {capacityLabel}</span>
            ) : null}
          </div>
          {ratio != null ? (
            <>
              <div
                className="k8s-summary-metric-bar"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(ratio * 100)}
                aria-label={`${label} ${pct}`}
              >
                <span
                  className={`k8s-summary-metric-bar-fill k8s-summary-metric-bar-fill--${tone}`}
                  style={{ width: `${Math.max(ratio * 100, ratio > 0 ? 2 : 0)}%` }}
                />
              </div>
              <span className="k8s-summary-metric-pct">{pct}</span>
            </>
          ) : null}
        </>
      ) : (
        <span className="k8s-summary-metric-na">{unavailable}</span>
      )}
    </article>
  );
}

export function K8sClusterSummaryView({
  summary,
  loading,
  onWarningClick,
  onWarningSendToChat,
  onHealthSendToChat,
  onRefresh,
}: {
  summary: Summary | null;
  loading: boolean;
  onWarningClick?: (ev: K8sWarningEvent) => void;
  onWarningSendToChat?: (ev: K8sWarningEvent) => void;
  onHealthSendToChat?: () => void;
  onRefresh?: () => void;
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
  const totalPods = summary.total_pods || phases.reduce((n, [, c]) => n + c, 0);
  const nodeIssues =
    summary.node_count > 0 && summary.ready_node_count < summary.node_count;
  const hasIssues = summary.recent_warnings.length > 0 || nodeIssues;
  const metrics = summary.metrics;
  const cpuUsed = metrics?.cpu_usage ? parseCpuToMilli(metrics.cpu_usage) : null;
  const cpuCap = metrics?.cpu_capacity ? parseCpuToMilli(metrics.cpu_capacity) : null;
  const memUsed = metrics?.memory_usage
    ? parseMemoryToKi(metrics.memory_usage)
    : null;
  const memCap = metrics?.memory_capacity
    ? parseMemoryToKi(metrics.memory_capacity)
    : null;
  const podCap = summary.pod_capacity > 0 ? summary.pod_capacity : null;

  return (
    <div className="k8s-cluster-summary">
      <header className="k8s-cluster-summary-head">
        <div className="k8s-cluster-summary-title-row">
          <h2 data-testid="k8s-overview-title">{t("overviewHome")}</h2>
          <div className="k8s-cluster-summary-actions">
            {onRefresh ? (
              <button
                type="button"
                className="k8s-summary-refresh-btn"
                title={t("summaryRefresh")}
                aria-label={t("summaryRefresh")}
                onClick={onRefresh}
              >
                <RefreshCw size={13} strokeWidth={2} />
              </button>
            ) : null}
          </div>
        </div>
        <p className="k8s-cluster-summary-meta">
          {summary.version ? `${summary.version} · ` : ""}
          {t("summaryNodes", { count: summary.node_count })}
        </p>
      </header>

      <div
        className={`k8s-summary-health${hasIssues ? " k8s-summary-health--warn" : ""}`}
        role="status"
      >
        {hasIssues ? (
          <AlertTriangle size={28} strokeWidth={1.75} aria-hidden />
        ) : (
          <CheckCircle2 size={28} strokeWidth={1.75} aria-hidden />
        )}
        <div className="k8s-summary-health-body">
          <strong>
            {hasIssues ? t("summaryHealthIssues") : t("summaryHealthOk")}
          </strong>
          <p>
            {hasIssues
              ? t("summaryHealthIssuesDetail", {
                  warnings: summary.recent_warnings.length,
                  nodes: summary.node_count - summary.ready_node_count,
                })
              : t("summaryHealthOkDetail")}
          </p>
        </div>
        {hasIssues && onHealthSendToChat ? (
          <button
            type="button"
            className="k8s-summary-health-send"
            data-testid="k8s-health-send-chat"
            title={t("sendHealthToChat")}
            aria-label={t("sendHealthToChat")}
            onClick={onHealthSendToChat}
          >
            <MessageSquare size={14} strokeWidth={2} />
          </button>
        ) : null}
      </div>

      <div className="k8s-summary-stat-grid">
        <article className="k8s-summary-stat-card">
          <span className="k8s-summary-stat-label">{t("summaryStatNodes")}</span>
          <strong className="k8s-summary-stat-value">
            {summary.ready_node_count}/{summary.node_count}
          </strong>
          <span className="k8s-summary-stat-hint">{t("summaryStatReady")}</span>
        </article>
        <article className="k8s-summary-stat-card">
          <span className="k8s-summary-stat-label">{t("summaryStatNamespaces")}</span>
          <strong className="k8s-summary-stat-value">{summary.namespace_count}</strong>
        </article>
        <article className="k8s-summary-stat-card">
          <span className="k8s-summary-stat-label">{t("summaryStatDeployments")}</span>
          <strong className="k8s-summary-stat-value">{summary.deployment_count}</strong>
        </article>
        <article className="k8s-summary-stat-card">
          <span className="k8s-summary-stat-label">{t("summaryStatServices")}</span>
          <strong className="k8s-summary-stat-value">{summary.service_count}</strong>
        </article>
        <article className="k8s-summary-stat-card">
          <span className="k8s-summary-stat-label">{t("summaryStatPods")}</span>
          <strong className="k8s-summary-stat-value">{totalPods}</strong>
        </article>
      </div>

      <div className="k8s-summary-metrics-row">
        <MetricRatioCard
          label={t("summaryMetricCpu")}
          usageLabel={metrics?.cpu_usage}
          capacityLabel={metrics?.cpu_capacity}
          ratio={
            cpuUsed != null && cpuCap != null ? usageRatio(cpuUsed, cpuCap) : null
          }
          tone="cpu"
          unavailable={t("summaryMetricUnavailable")}
        />
        <MetricRatioCard
          label={t("summaryMetricMemory")}
          usageLabel={metrics?.memory_usage}
          capacityLabel={metrics?.memory_capacity}
          ratio={
            memUsed != null && memCap != null ? usageRatio(memUsed, memCap) : null
          }
          tone="memory"
          unavailable={t("summaryMetricUnavailable")}
        />
        <MetricRatioCard
          label={t("summaryMetricPods")}
          usageLabel={String(totalPods)}
          capacityLabel={podCap != null ? String(podCap) : null}
          ratio={podCap != null ? usageRatio(totalPods, podCap) : null}
          tone="pods"
          unavailable={t("summaryMetricUnavailable")}
        />
      </div>

      <section className="k8s-summary-section">
        <h3>{t("summaryPodPhases")}</h3>
        {phases.length === 0 ? (
          <p className="k8s-detail-empty">{t("summaryNoPods")}</p>
        ) : (
          <div
            className="k8s-summary-phase-bar"
            role="list"
            aria-label={t("summaryPodPhases")}
          >
            {phases.map(([phase, count]) => {
              const pct = totalPods > 0 ? (count / totalPods) * 100 : 0;
              const compact = pct < 18;
              return (
                <div
                  key={phase}
                  className={`k8s-summary-phase-seg k8s-summary-phase-seg--${phaseClass(phase)}`}
                  style={{ width: `${pct}%` }}
                  role="listitem"
                  title={`${phase}: ${count}`}
                >
                  <span className="k8s-summary-phase-seg-label">
                    {!compact ? (
                      <span className="k8s-summary-phase-name">{phase}</span>
                    ) : null}
                    <strong>{count}</strong>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="k8s-summary-section">
        <h3>{t("summaryWarnings")}</h3>
        {summary.recent_warnings.length === 0 ? (
          <p className="k8s-detail-empty">{t("summaryNoWarnings")}</p>
        ) : (
          <ul className="k8s-summary-events">
            {summary.recent_warnings.map((ev, i) => {
              const clickable = Boolean(
                onWarningClick && ev.kind?.trim() && ev.name?.trim(),
              );
              return (
                <li key={`${ev.namespace}/${ev.name}/${ev.reason}/${i}`}>
                  <div className="k8s-summary-event-card">
                    <button
                      type="button"
                      className={`k8s-summary-event-btn${clickable ? "" : " k8s-summary-event-btn--static"}`}
                      disabled={!clickable}
                      title={clickable ? t("warningNavigateHint") : undefined}
                      onClick={() => onWarningClick?.(ev)}
                    >
                      <div className="k8s-summary-event-head">
                        <span className="k8s-summary-event-reason">{ev.reason}</span>
                      </div>
                      <div className="k8s-summary-event-target">
                        {ev.kind ? `${ev.kind} · ` : ""}
                        {ev.namespace ? `${ev.namespace}/` : ""}
                        {ev.name}
                      </div>
                      <p className="k8s-summary-event-msg">{ev.message}</p>
                    </button>
                    <div className="k8s-summary-event-actions">
                      {ev.age ? (
                        <span className="k8s-summary-event-age">{ev.age}</span>
                      ) : null}
                      {onWarningSendToChat ? (
                        <button
                          type="button"
                          className="k8s-summary-event-send"
                          data-testid={`k8s-warning-send-chat-${i}`}
                          title={t("sendWarningToChat")}
                          aria-label={t("sendWarningToChat")}
                          onClick={() => onWarningSendToChat(ev)}
                        >
                          <MessageSquare size={13} strokeWidth={2} />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
