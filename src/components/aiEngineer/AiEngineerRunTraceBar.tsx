import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react";
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

  // Collapsed by default; running state only updates the summary label.
  return (
    <details className="ai-engineer-run-trace" data-testid="ai-engineer-run-trace">
      <summary>
        <ChevronRight
          size={12}
          strokeWidth={2}
          className="ai-engineer-run-trace-chevron ai-engineer-run-trace-chevron-closed"
          aria-hidden
        />
        <ChevronDown
          size={12}
          strokeWidth={2}
          className="ai-engineer-run-trace-chevron ai-engineer-run-trace-chevron-open"
          aria-hidden
        />
        <span>
          {busy
            ? t("aiEngineer.trace.running", { count: spans.length })
            : t("aiEngineer.trace.done", {
                count: spans.length,
                ms: Math.round(totalMs),
              })}
        </span>
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
