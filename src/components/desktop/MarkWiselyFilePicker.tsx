import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import type { ListLocalDirectoryResult } from "../../types";

type Props = {
  sessionId: string;
  mode: "file" | "directory";
  onSelect: (path: string) => void;
  onCancel: () => void;
};

export function MarkWiselyFilePicker({ sessionId, mode, onSelect, onCancel }: Props) {
  const { t } = useTranslation("tools");
  const [path, setPath] = useState<string | undefined>();
  const [result, setResult] = useState<ListLocalDirectoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    void invoke<ListLocalDirectoryResult>("list_remote_directory", {
      request: { session_id: sessionId, path: path ?? null },
    }).then((listing) => {
      if (!cancelled) setResult(listing);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [path, sessionId]);

  const entries = result?.entries ?? [];
  const visibleEntries = entries.filter((entry) => {
    if (entry.kind === "directory") return true;
    if (mode === "directory" || entry.kind !== "file") return false;
    return /\.(md|markdown)$/i.test(entry.name);
  });

  return (
    <section className="markwisely-picker" data-testid="markwisely-picker" aria-label={t("markwisely.pickerTitle")}>
      <header className="markwisely-picker-head">
        <button type="button" className="markwisely-back" onClick={onCancel}>{t("markwisely.cancel")}</button>
        <strong>{mode === "file" ? t("markwisely.openTitle") : t("markwisely.chooseFolder")}</strong>
        {mode === "directory" ? (
          <button type="button" className="markwisely-primary" onClick={() => result && onSelect(result.path)}>
            {t("markwisely.useFolder")}
          </button>
        ) : null}
      </header>
      <div className="markwisely-picker-path" title={result?.path}>{result?.path ?? "…"}</div>
      {error ? <div className="markwisely-error" role="alert">{error}</div> : null}
      {loading ? <div className="markwisely-empty" role="status">{t("markwisely.loading")}</div> : null}
      {!loading && !error ? (
        <div className="markwisely-entry-list">
          {result?.parent ? (
            <button type="button" className="markwisely-entry is-directory" onClick={() => setPath(result.parent ?? undefined)}>
              <span aria-hidden>↰</span><span>..</span>
            </button>
          ) : null}
          {visibleEntries.map((entry) => (
            <button
              type="button"
              key={entry.path}
              className={`markwisely-entry ${entry.kind === "directory" ? "is-directory" : ""}`}
              onClick={() => entry.kind === "directory" ? setPath(entry.path) : onSelect(entry.path)}
              data-testid={entry.kind === "directory" ? undefined : "markwisely-file-entry"}
            >
              <span aria-hidden>{entry.kind === "directory" ? "▸" : "▤"}</span>
              <span>{entry.name}</span>
            </button>
          ))}
          {visibleEntries.length === 0 ? <div className="markwisely-empty">{t("markwisely.noMarkdownFiles")}</div> : null}
        </div>
      ) : null}
    </section>
  );
}
