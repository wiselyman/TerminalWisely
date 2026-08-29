import { useTranslation } from "react-i18next";
import type { TraceSpanRow } from "../../lib/aiEngineer/api";

export function AiEngineerRunTraceBar({
  spans,
  busy,
}: {
  spans: TraceSpanRow[];
  busy: boolean;
}) {
  const { t } = useTranslation("tools");
  if (spans.length === 0) return null;

  const finished = spans.filter((s) => s.duration_ms != null);
  const totalMs = finished.reduce((sum, s) => sum + (s.duration_ms ?? 0), 0);

  return (
    <details className="ai-engineer-run-trace" open={busy}>
      <summary>
        {busy
          ? t("aiEngineer.trace.running", { count: spans.length })
          : t("aiEngineer.trace.done", {
              count: spans.length,
              ms: Math.round(totalMs),
            })}
      </summary>
      <ul>
        {spans.map((s) => (
          <li key={s.id}>
            <span className="ai-engineer-run-trace-kind">{s.kind}</span>
            <span className="ai-engineer-run-trace-name">{s.name}</span>
            {s.duration_ms != null ? (
              <span className="ai-engineer-run-trace-ms">{Math.round(s.duration_ms)}ms</span>
            ) : (
              <span className="ai-engineer-run-trace-ms">…</span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
