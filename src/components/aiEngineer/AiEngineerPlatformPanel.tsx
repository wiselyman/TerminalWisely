import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listAgentSkills,
  listMcpServers,
  runOpsEval,
  searchMemoryCases,
  type EvalReportSummary,
  type MemoryCaseRow,
  type McpServerInfo,
} from "../../lib/aiEngineer/api";
import { useAiEngineerStore } from "../../stores/aiEngineerStore";

export function AiEngineerPlatformPanel() {
  const { t } = useTranslation("tools");
  const sidecar = useAiEngineerStore((s) => s.sidecar);
  const engineerMode = useAiEngineerStore((s) => s.engineerMode);

  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [skills, setSkills] = useState<Array<{ id: string; title: string }>>([]);
  const [memoryQuery, setMemoryQuery] = useState("");
  const [memoryCases, setMemoryCases] = useState<MemoryCaseRow[]>([]);
  const [evalReport, setEvalReport] = useState<EvalReportSummary | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refreshMcp = useCallback(async () => {
    if (!sidecar) return;
    setLoading("mcp");
    setError(null);
    try {
      const data = await listMcpServers(sidecar);
      setMcpServers(data.servers ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  }, [sidecar]);

  const refreshSkills = useCallback(async () => {
    if (!sidecar) return;
    try {
      const data = await listAgentSkills(sidecar);
      const filtered = (data.skills ?? []).filter((s) =>
        engineerMode === "k8s" ? s.id.startsWith("k8s-") : !s.id.startsWith("k8s-"),
      );
      setSkills(filtered.map((s) => ({ id: s.id, title: s.title })));
    } catch {
      setSkills([]);
    }
  }, [sidecar, engineerMode]);

  useEffect(() => {
    void refreshMcp();
    void refreshSkills();
  }, [refreshMcp, refreshSkills]);

  // CI/demo: auto-run eval + memory search for screenshot scripts.
  useEffect(() => {
    if (!sidecar) return;
    const mode = import.meta.env.VITE_UI_DEMO_SCREENSHOTS;
    if (mode !== "platform" && mode !== "1") return;
    let cancelled = false;
    void (async () => {
      setLoading("eval");
      setError(null);
      try {
        const report = await runOpsEval(sidecar);
        if (!cancelled) setEvalReport(report);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(null);
      }
      if (cancelled) return;
      setMemoryQuery("ImagePullBackOff");
      setLoading("memory");
      try {
        const data = await searchMemoryCases(sidecar, "ImagePullBackOff");
        if (!cancelled) setMemoryCases(data.cases ?? []);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sidecar]);

  const onSearchMemory = async () => {
    if (!sidecar || !memoryQuery.trim()) return;
    setLoading("memory");
    setError(null);
    try {
      const data = await searchMemoryCases(sidecar, memoryQuery.trim());
      setMemoryCases(data.cases ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  };

  const onRunEval = async () => {
    if (!sidecar) return;
    setLoading("eval");
    setError(null);
    try {
      const report = await runOpsEval(sidecar);
      setEvalReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="ai-engineer-platform-panel" data-testid="ai-engineer-platform-panel">
      <p className="ai-engineer-platform-intro">{t("aiEngineer.platform.intro")}</p>

      <section className="ai-engineer-platform-section">
        <div className="ai-engineer-platform-section-head">
          <h4>{t("aiEngineer.platform.mcpTitle")}</h4>
          <button
            type="button"
            className="ai-engineer-text-btn"
            disabled={!sidecar || loading === "mcp"}
            onClick={() => void refreshMcp()}
          >
            {t("aiEngineer.platform.refresh")}
          </button>
        </div>
        {mcpServers.length === 0 ? (
          <p className="ai-engineer-platform-muted">{t("aiEngineer.platform.mcpEmpty")}</p>
        ) : (
          <ul className="ai-engineer-platform-list">
            {mcpServers.map((s) => (
              <li key={s.id}>
                <strong>{s.title}</strong>
                <span className="ai-engineer-platform-sub">
                  {s.id}
                  {s.read_only ? ` · ${t("aiEngineer.platform.readOnly")}` : ""}
                </span>
                {s.tools?.length ? (
                  <span className="ai-engineer-platform-sub">
                    {s.tools.map((tool) => tool.name).filter(Boolean).join(", ")}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="ai-engineer-platform-section">
        <h4>{t("aiEngineer.platform.skillsTitle")}</h4>
        {skills.length === 0 ? (
          <p className="ai-engineer-platform-muted">{t("aiEngineer.platform.skillsEmpty")}</p>
        ) : (
          <ul className="ai-engineer-platform-chips">
            {skills.map((s) => (
              <li key={s.id}>{s.title}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="ai-engineer-platform-section">
        <h4>{t("aiEngineer.platform.memoryTitle")}</h4>
        <p className="ai-engineer-platform-muted">{t("aiEngineer.platform.memoryHint")}</p>
        <div className="ai-engineer-platform-row">
          <input
            value={memoryQuery}
            onChange={(e) => setMemoryQuery(e.target.value)}
            placeholder={t("aiEngineer.platform.memoryPlaceholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSearchMemory();
            }}
          />
          <button
            type="button"
            className="find-panel-run"
            disabled={!sidecar || loading === "memory"}
            onClick={() => void onSearchMemory()}
          >
            {t("aiEngineer.platform.search")}
          </button>
        </div>
        {memoryCases.length > 0 ? (
          <ul className="ai-engineer-platform-list">
            {memoryCases.map((c, i) => (
              <li key={c.id ?? i}>
                <strong>{c.problem_signature}</strong>
                {c.root_cause ? (
                  <span className="ai-engineer-platform-sub">{c.root_cause}</span>
                ) : null}
                {c.fix ? <span className="ai-engineer-platform-sub">{c.fix}</span> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="ai-engineer-platform-section">
        <div className="ai-engineer-platform-section-head">
          <h4>{t("aiEngineer.platform.evalTitle")}</h4>
          <button
            type="button"
            data-testid="ai-engineer-eval-run"
            className="find-panel-run"
            disabled={!sidecar || loading === "eval"}
            onClick={() => void onRunEval()}
          >
            {loading === "eval"
              ? t("aiEngineer.platform.evalRunning")
              : t("aiEngineer.platform.evalRun")}
          </button>
        </div>
        <p className="ai-engineer-platform-muted">{t("aiEngineer.platform.evalHint")}</p>
        {evalReport ? (
          <div className="ai-engineer-platform-eval" data-testid="ai-engineer-eval-results">
            <p data-testid="ai-engineer-eval-summary">
              {t("aiEngineer.platform.evalSummary", {
                passed: evalReport.summary.passed,
                total: evalReport.summary.total,
                rate: Math.round(evalReport.summary.pass_rate * 100),
              })}
            </p>
            <ul className="ai-engineer-platform-list compact">
              {evalReport.results.map((r) => (
                <li key={r.scenario_id} className={r.passed ? "is-pass" : "is-fail"}>
                  {r.passed ? "✓" : "✗"} {r.scenario_id} ({Math.round(r.duration_ms)}ms)
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </section>

      {error ? <p className="ai-engineer-settings-error">{error}</p> : null}
    </div>
  );
}
