import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FolderCheck, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { LocalFsEntryIcon, LocalFsRefreshIcon, LocalFsUpIcon } from "../LocalFsIcons";
import { LocalFsPathBreadcrumb } from "../LocalFsPathBreadcrumb";
import type { ListLocalDirectoryResult } from "../../types";
import type { DesktopTarget } from "../../lib/desktopTarget";
import { listLocalDirectory, listLocalRoots } from "../../lib/localFsApi";

type Props = {
  sessionId?: string;
  target?: DesktopTarget;
  mode: "file" | "directory";
  initialPath?: string;
  onSelect: (path: string) => void;
  onCancel: () => void;
};

export function MarkWiselyFilePicker({ sessionId, target, mode, initialPath, onSelect, onCancel }: Props) {
  const { t } = useTranslation("tools");
  const [path, setPath] = useState<string | undefined>(initialPath);
  const [result, setResult] = useState<ListLocalDirectoryResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const listing = target?.kind === "local"
      ? (path ? listLocalDirectory(path, false) : listLocalRoots().then((roots) => listLocalDirectory(roots[0], false)))
      : sessionId
        ? invoke<ListLocalDirectoryResult>("list_remote_directory", { request: { session_id: sessionId, path: path ?? null } })
        : Promise.reject(new Error("SSH session is required"));
    void listing.then((listing) => {
      if (!cancelled) setResult(listing);
    }).catch((cause) => {
      if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [path, refreshKey, sessionId, target]);

  const entries = result?.entries ?? [];
  const visibleEntries = entries.filter((entry) => {
    if (entry.kind === "directory") return true;
    if (mode === "directory" || entry.kind !== "file") return false;
    return /\.(md|markdown)$/i.test(entry.name);
  });

  return (
    <section
      className="markwisely-picker"
      data-testid="markwisely-picker"
      role="dialog"
      aria-modal="true"
      aria-label={t(mode === "file" ? "markwisely.openTitle" : "markwisely.chooseFolder")}
    >
      <header className="markwisely-picker-head">
        <button
          type="button"
          className="markwisely-picker-icon-button"
          aria-label={t("markwisely.cancel")}
          title={t("markwisely.cancel")}
          onClick={onCancel}
        >
          <X aria-hidden="true" size={18} />
        </button>
        <strong>{mode === "file" ? t("markwisely.openTitle") : t("markwisely.chooseFolder")}</strong>
      </header>
      <div className="local-fs-toolbar markwisely-picker-toolbar">
        <div className="local-fs-tool-group">
          <button
            type="button"
            className="local-fs-tool-btn"
            disabled={!result?.parent || loading}
            title={t("localFs.goUp")}
            aria-label={t("localFs.goUp")}
            onClick={() => result?.parent && setPath(result.parent)}
          >
            <LocalFsUpIcon />
          </button>
          <button
            type="button"
            className="local-fs-tool-btn"
            disabled={loading}
            title={t("localFs.refresh")}
            aria-label={t("localFs.refresh")}
            onClick={() => setRefreshKey((key) => key + 1)}
          >
            <LocalFsRefreshIcon />
          </button>
          {mode === "directory" ? (
            <button
              type="button"
              className="local-fs-tool-btn markwisely-picker-confirm"
              data-testid="markwisely-use-folder"
              aria-label={t("markwisely.useFolder")}
              title={t("markwisely.useFolder")}
              disabled={!result || loading || !!error}
              onClick={() => result && onSelect(result.path)}
            >
              <FolderCheck aria-hidden="true" size={18} />
            </button>
          ) : null}
        </div>
        <div className="local-fs-address-bar">
          <LocalFsPathBreadcrumb
            path={result?.path ?? path ?? "/"}
            disabled={!result || loading}
            onNavigate={setPath}
            onEdit={() => undefined}
          />
        </div>
      </div>
      {error ? <div className="markwisely-error" role="alert">{error}</div> : null}
      <div className="local-fs-contents local-fs-contents-list markwisely-picker-contents">
        <div className="local-fs-list-header" aria-hidden="true">
          <span>{t("localFs.colName")}</span>
        </div>
        <div className="local-fs-list">
          {loading ? <div className="markwisely-empty" role="status">{t("markwisely.loading")}</div> : null}
          {!loading && !error ? visibleEntries.map((entry) => (
            <button
              type="button"
              key={entry.path}
              className={`local-fs-row markwisely-picker-row${entry.kind === "directory" ? " is-dir" : " is-file"}`}
              onClick={() => entry.kind === "directory" ? setPath(entry.path) : onSelect(entry.path)}
              data-folder-entry={entry.kind === "directory" ? "true" : undefined}
              data-testid={entry.kind === "directory" ? "markwisely-folder-entry" : "markwisely-file-entry"}
            >
              <LocalFsEntryIcon kind={entry.kind} name={entry.name} />
              <span className="local-fs-row-name" title={entry.path}>{entry.name}</span>
            </button>
          )) : null}
          {!loading && !error && visibleEntries.length === 0 ? (
            <div className="markwisely-empty">
              {mode === "directory" ? t("localFs.empty") : t("markwisely.noMarkdownFiles")}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
