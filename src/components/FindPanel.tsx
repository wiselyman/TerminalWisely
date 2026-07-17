import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import type { FindFileEntry } from "../types";
import { useFindStore } from "../stores/findStore";
import { usePreviewStore } from "../stores/previewStore";
import { PathInput } from "./PathInput";
import { WorkspacePanelBackdrop } from "./WorkspacePanelBackdrop";

interface FindPanelProps {
  sessionId: string;
  sessionTitle: string;
}

function formatSize(sizeBytes: number | null | undefined) {
  if (sizeBytes == null) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function entryLabel(entry: FindFileEntry) {
  const parts = entry.path.split(/[/\\]/);
  return parts[parts.length - 1] || entry.path;
}

export function FindPanel({ sessionId, sessionTitle }: FindPanelProps) {
  const { t } = useTranslation("tools");
  const nameInputRef = useRef<HTMLInputElement>(null);
  const openPreview = usePreviewStore((s) => s.openPreview);
  const {
    width,
    setWidth,
    sessionCwd,
    followTerminalCwd,
    searchPath,
    setSearchPath,
    resetSearchPathToTerminal,
    namePattern,
    setNamePattern,
    typeFilter,
    setTypeFilter,
    maxDepth,
    setMaxDepth,
    caseInsensitive,
    setCaseInsensitive,
    entries,
    truncated,
    loading,
    error,
    lastRunAt,
    runFind,
    focusNonce,
  } = useFindStore();

  useEffect(() => {
    nameInputRef.current?.focus();
  }, [focusNonce]);

  const handleRun = () => {
    void runFind(sessionId);
  };

  const handleEntryClick = (entry: FindFileEntry) => {
    if (entry.kind === "directory") {
      void invoke("enter_directory", {
        request: { session_id: sessionId, path: entry.path },
      });
      return;
    }
    void openPreview(sessionId, entry.path);
  };

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    document.body.classList.add("find-panel-resizing");

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      setWidth(startWidth + delta);
    };

    const onMouseUp = () => {
      document.body.classList.remove("find-panel-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const resultSummary =
    lastRunAt == null
      ? t("find.hintBeforeRun")
      : `${t("find.resultCount", { count: entries.length })}${truncated ? t("find.resultTruncated") : ""}`;

  return (
    <>
      <WorkspacePanelBackdrop />
      <aside
        className="find-panel open"
        style={{ width }}
        aria-hidden={false}
      >
        <div
          className="find-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("find.resizeAria")}
          onMouseDown={startResize}
        />
        <div className="find-panel-head">
          <div className="find-panel-title-wrap">
            <h2 className="find-panel-title">{t("find.title")}</h2>
            <p className="find-panel-session">{sessionTitle}</p>
          </div>
        </div>

        <div className="find-panel-toolbar">
          <label className="find-panel-field find-panel-scope-field">
            <span>{t("find.scope")}</span>
            <PathInput
              sessionId={sessionId}
              value={followTerminalCwd ? (sessionCwd ?? "") : searchPath}
              onChange={setSearchPath}
              placeholder={sessionCwd ?? t("find.cwdPlaceholder")}
            />
            {!followTerminalCwd ? (
              <button
                type="button"
                className="find-panel-follow-cwd"
                onClick={() => {
                  resetSearchPathToTerminal();
                  void useFindStore.getState().loadSessionCwd(sessionId);
                }}
              >
                {t("find.followCwd")}
              </button>
            ) : null}
          </label>

          <label className="find-panel-field">
            <span>{t("find.nameLabel")}</span>
            <input
              ref={nameInputRef}
              type="text"
              value={namePattern}
              onChange={(event) => setNamePattern(event.target.value)}
              placeholder={t("find.namePlaceholder")}
              aria-label={t("find.nameAria")}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleRun();
                }
              }}
            />
          </label>

          <div className="find-panel-field-row">
            <label className="find-panel-field find-panel-field-inline">
              <span>{t("find.typeLabel")}</span>
              <select
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(event.target.value as "all" | "file" | "directory")
                }
                aria-label={t("find.typeAria")}
              >
                <option value="all">{t("find.typeAll")}</option>
                <option value="file">{t("find.typeFile")}</option>
                <option value="directory">{t("find.typeDirectory")}</option>
              </select>
            </label>
            <label className="find-panel-field find-panel-field-inline">
              <span>{t("find.depth")}</span>
              <input
                type="number"
                min={1}
                max={32}
                value={maxDepth}
                onChange={(event) => setMaxDepth(Number(event.target.value) || 8)}
                aria-label={t("find.depthAria")}
              />
            </label>
            <label className="find-panel-checkbox">
              <input
                type="checkbox"
                checked={caseInsensitive}
                onChange={(event) => setCaseInsensitive(event.target.checked)}
              />
              <span>{t("find.iname")}</span>
            </label>
          </div>
          <div className="find-panel-actions">
            <button
              type="button"
              className="find-panel-run"
              disabled={loading || !namePattern.trim()}
              onClick={handleRun}
            >
              {loading ? t("find.running") : t("find.run")}
            </button>
            <span className="find-panel-meta">{resultSummary}</span>
          </div>
          {error ? <p className="find-panel-error">{error}</p> : null}
        </div>

        <div className="find-panel-results">
          {entries.length === 0 && !loading && lastRunAt != null ? (
            <p className="find-panel-empty">{t("find.empty")}</p>
          ) : null}
          <ul className="find-panel-result-list">
            {entries.map((entry) => (
              <li key={entry.path}>
                <button
                  type="button"
                  className={`find-panel-result-item find-panel-result-${entry.kind}`}
                  onClick={() => handleEntryClick(entry)}
                  title={entry.path}
                >
                  <span className="find-panel-result-name">{entryLabel(entry)}</span>
                  <span className="find-panel-result-kind">
                    {entry.kind === "directory" ? t("find.kindDirectory") : t("find.kindFile")}
                  </span>
                  <span className="find-panel-result-size">
                    {formatSize(entry.size_bytes)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </>
  );
}
