import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from "react";
import type { FindFileEntry } from "../types";
import { useFindStore } from "../stores/findStore";
import { usePreviewStore } from "../stores/previewStore";

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
  const nameInputRef = useRef<HTMLInputElement>(null);
  const openPreview = usePreviewStore((s) => s.openPreview);
  const {
    width,
    setWidth,
    sessionCwd,
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
    close,
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
      ? "输入文件名模式后搜索，或按 Enter 执行 find"
      : `${entries.length} 条结果${truncated ? "（已截断，最多 500 条）" : ""}`;

  return (
    <>
      <div className="find-panel-backdrop open" onClick={close} aria-hidden="true" />
      <aside className="find-panel open" style={{ width }} aria-hidden={false}>
        <div
          className="find-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整 Find 面板宽度"
          onMouseDown={startResize}
        />
        <div className="find-panel-head">
          <div className="find-panel-title-wrap">
            <h2 className="find-panel-title">Find</h2>
            <p className="find-panel-session">{sessionTitle}</p>
          </div>
          <button
            type="button"
            className="find-panel-close"
            onClick={close}
            aria-label="关闭 Find"
          >
            ×
          </button>
        </div>

        <div className="find-panel-toolbar">
          <p className="find-panel-scope" title={sessionCwd ?? undefined}>
            搜索范围：{sessionCwd ?? "当前目录"}
          </p>

          <label className="find-panel-field">
            <span>文件名 (-name)</span>
            <input
              ref={nameInputRef}
              type="text"
              value={namePattern}
              onChange={(event) => setNamePattern(event.target.value)}
              placeholder="例如 *.log"
              aria-label="find 文件名模式"
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
              <span>类型</span>
              <select
                value={typeFilter}
                onChange={(event) =>
                  setTypeFilter(event.target.value as "all" | "file" | "directory")
                }
                aria-label="find 类型"
              >
                <option value="all">全部</option>
                <option value="file">文件 (-type f)</option>
                <option value="directory">目录 (-type d)</option>
              </select>
            </label>
            <label className="find-panel-field find-panel-field-inline">
              <span>深度</span>
              <input
                type="number"
                min={1}
                max={32}
                value={maxDepth}
                onChange={(event) => setMaxDepth(Number(event.target.value) || 8)}
                aria-label="find 最大深度"
              />
            </label>
            <label className="find-panel-checkbox">
              <input
                type="checkbox"
                checked={caseInsensitive}
                onChange={(event) => setCaseInsensitive(event.target.checked)}
              />
              <span>-iname 忽略大小写</span>
            </label>
          </div>
          <div className="find-panel-actions">
            <button
              type="button"
              className="find-panel-run"
              disabled={loading || !namePattern.trim()}
              onClick={handleRun}
            >
              {loading ? "搜索中…" : "搜索"}
            </button>
            <span className="find-panel-meta">{resultSummary}</span>
          </div>
          {error ? <p className="find-panel-error">{error}</p> : null}
        </div>

        <div className="find-panel-results">
          {entries.length === 0 && !loading && lastRunAt != null ? (
            <p className="find-panel-empty">未找到匹配文件</p>
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
                    {entry.kind === "directory" ? "目录" : "文件"}
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
