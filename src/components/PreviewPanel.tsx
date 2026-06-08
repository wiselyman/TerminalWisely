import { useEffect, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import { formatFileSize } from "../lib/fileType";
import {
  findSearchMatches,
  getMatchPosition,
  isValidSearchQuery,
} from "../lib/previewSearch";
import { usePreviewStore } from "../stores/previewStore";
import { useToastStore } from "../stores/toastStore";
import { EditableTextPreview } from "./preview/EditableTextPreview";
import { HtmlPreview } from "./preview/HtmlPreview";
import { ImagePreview } from "./preview/ImagePreview";
import { MarkdownPreview } from "./preview/MarkdownPreview";
import { PdfPreview } from "./preview/PdfPreview";
import { UnsupportedPreview } from "./preview/UnsupportedPreview";

interface PreviewPanelProps {
  sessionTitle?: string;
}

export function PreviewPanel({ sessionTitle }: PreviewPanelProps) {
  const {
    data,
    loading,
    saving,
    error,
    editedContent,
    searchQuery,
    activeMatchIndex,
    searchCaseSensitive,
    searchRegex,
    searchWholeWord,
    markdownMode,
    setSearchQuery,
    setActiveMatchIndex,
    setSearchCaseSensitive,
    setSearchRegex,
    setSearchWholeWord,
    setMarkdownMode,
    setEditedContent,
    savePreview,
    closePreview,
  } = usePreviewStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const savedContent = data?.text_content ?? "";
  const displayContent = editedContent ?? savedContent;
  const dirty =
    editedContent !== null && editedContent !== savedContent;

  const canEditSource =
    Boolean(data?.editable) &&
    (data?.kind === "text" ||
      data?.kind === "csv" ||
      ((data?.kind === "markdown" || data?.kind === "html") &&
        markdownMode === "source"));

  const searchable =
    data?.kind === "text" ||
    data?.kind === "markdown" ||
    data?.kind === "html" ||
    data?.kind === "csv";

  const searchOptions = useMemo(
    () => ({
      caseSensitive: searchCaseSensitive,
      regex: searchRegex,
      wholeWord: searchWholeWord,
    }),
    [searchCaseSensitive, searchRegex, searchWholeWord],
  );

  const searchValid = isValidSearchQuery(searchQuery, searchOptions);

  const matches = useMemo(
    () =>
      searchable && markdownMode !== "preview" && searchValid
        ? findSearchMatches(displayContent, searchQuery, searchOptions)
        : [],
    [
      searchable,
      markdownMode,
      displayContent,
      searchQuery,
      searchOptions,
      searchValid,
    ],
  );

  const activePosition = useMemo(() => {
    if (matches.length === 0) return null;
    const match = matches[activeMatchIndex];
    if (!match) return null;
    return getMatchPosition(displayContent, match.start);
  }, [activeMatchIndex, displayContent, matches]);

  const goMatch = (direction: 1 | -1) => {
    if (matches.length === 0) return;
    const next =
      (activeMatchIndex + direction + matches.length) % matches.length;
    setActiveMatchIndex(next);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "s") {
        if (!canEditSource || !dirty || saving) return;
        event.preventDefault();
        void savePreview();
        return;
      }

      if (!searchable || markdownMode === "preview") return;

      if (event.key === "F3") {
        event.preventDefault();
        goMatch(event.shiftKey ? -1 : 1);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    canEditSource,
    dirty,
    markdownMode,
    savePreview,
    saving,
    searchable,
    matches.length,
    activeMatchIndex,
    setActiveMatchIndex,
  ]);

  const openExternal = () => {
    if (!data?.handle_id) return;
    void invoke("open_preview_handle", {
      request: { handle_id: data.handle_id },
    }).catch((err) => pushToast(String(err), false));
  };

  return (
    <aside className="preview-panel" aria-label="文件预览">
      <div className="preview-panel-head">
        <div className="preview-panel-title-wrap">
          <strong className="preview-panel-title">
            {data?.filename ?? "预览"}
          </strong>
          {sessionTitle ? (
            <span className="preview-panel-session">{sessionTitle}</span>
          ) : null}
          {data ? (
            <span className="preview-panel-meta">
              {data.kind}
              {data.total_size > 0 ? ` · ${formatFileSize(data.total_size)}` : ""}
              {data.truncated ? " · 已截断" : ""}
              {dirty ? " · 未保存" : ""}
            </span>
          ) : null}
          {data?.resolved_path ? (
            <span className="preview-panel-path" title={data.resolved_path}>
              {data.resolved_path}
            </span>
          ) : null}
        </div>
        <div className="preview-panel-actions">
          {canEditSource ? (
            <button
              type="button"
              className="preview-action-btn preview-action-btn-primary"
              disabled={!dirty || saving}
              onClick={() => void savePreview()}
            >
              {saving ? "保存中…" : "保存"}
            </button>
          ) : null}
          {data?.handle_id ? (
            <button
              type="button"
              className="preview-action-btn"
              onClick={openExternal}
            >
              系统打开
            </button>
          ) : null}
          <button
            type="button"
            className="preview-action-btn"
            onClick={() => void closePreview()}
          >
            关闭
          </button>
        </div>
      </div>

      {searchable ? (
        <div className="preview-search-wrap">
        <div className="preview-search-bar">
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder={searchRegex ? "正则搜索…" : "搜索文件内容…"}
            aria-label="搜索文件内容"
            className={!searchValid ? "preview-search-invalid" : undefined}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                goMatch(event.shiftKey ? -1 : 1);
              }
            }}
          />
          <button
            type="button"
            className={`preview-search-toggle${searchCaseSensitive ? " active" : ""}`}
            title="区分大小写"
            aria-label="区分大小写"
            aria-pressed={searchCaseSensitive}
            onClick={() => setSearchCaseSensitive(!searchCaseSensitive)}
          >
            Aa
          </button>
          <button
            type="button"
            className={`preview-search-toggle${searchWholeWord ? " active" : ""}`}
            title="整词匹配"
            aria-label="整词匹配"
            aria-pressed={searchWholeWord}
            onClick={() => setSearchWholeWord(!searchWholeWord)}
          >
            W
          </button>
          <button
            type="button"
            className={`preview-search-toggle${searchRegex ? " active" : ""}`}
            title="正则表达式"
            aria-label="正则表达式"
            aria-pressed={searchRegex}
            onClick={() => setSearchRegex(!searchRegex)}
          >
            .*
          </button>
          <span className="preview-search-count" title="F3 下一个，Shift+F3 上一个">
            {!searchValid
              ? "无效"
              : matches.length > 0
                ? `${activeMatchIndex + 1}/${matches.length}`
                : searchQuery.trim()
                  ? "0"
                  : ""}
            {activePosition
              ? ` · L${activePosition.line}:${activePosition.column}`
              : ""}
          </span>
          <button
            type="button"
            className="preview-icon-btn"
            aria-label="上一个匹配"
            disabled={matches.length === 0}
            onClick={() => goMatch(-1)}
          >
            ↑
          </button>
          <button
            type="button"
            className="preview-icon-btn"
            aria-label="下一个匹配"
            disabled={matches.length === 0}
            onClick={() => goMatch(1)}
          >
            ↓
          </button>
          {data && (data.kind === "markdown" || data.kind === "html") ? (
            <>
              <button
                type="button"
                className={`preview-icon-btn${markdownMode === "source" ? " active" : ""}`}
                onClick={() => setMarkdownMode("source")}
              >
                源码
              </button>
              <button
                type="button"
                className={`preview-icon-btn${markdownMode === "preview" ? " active" : ""}`}
                onClick={() => setMarkdownMode("preview")}
              >
                预览
              </button>
            </>
          ) : null}
        </div>
        </div>
      ) : null}

      <div className="preview-panel-body">
        {loading ? <div className="preview-empty">正在打开文件…</div> : null}
        {!loading && error ? <div className="preview-empty">{error}</div> : null}
        {!loading && !error && data?.kind === "text" ? (
          <EditableTextPreview
            text={displayContent}
            extension={data.extension}
            query={searchQuery}
            activeMatchIndex={activeMatchIndex}
            searchOptions={searchOptions}
            editable={canEditSource}
            onChange={setEditedContent}
          />
        ) : null}
        {!loading && !error && data?.kind === "markdown" ? (
          <MarkdownPreview
            text={displayContent}
            extension={data.extension}
            mode={markdownMode}
            query={searchQuery}
            activeMatchIndex={activeMatchIndex}
            searchOptions={searchOptions}
            editable={canEditSource}
            onChange={setEditedContent}
          />
        ) : null}
        {!loading && !error && data?.kind === "html" ? (
          <HtmlPreview
            text={displayContent}
            extension={data.extension}
            mode={markdownMode}
            query={searchQuery}
            activeMatchIndex={activeMatchIndex}
            searchOptions={searchOptions}
            editable={canEditSource}
            onChange={setEditedContent}
          />
        ) : null}
        {!loading && !error && data?.kind === "csv" ? (
          <EditableTextPreview
            text={displayContent}
            extension={data.extension}
            query={searchQuery}
            activeMatchIndex={activeMatchIndex}
            searchOptions={searchOptions}
            editable={canEditSource}
            onChange={setEditedContent}
          />
        ) : null}
        {!loading && !error && data?.kind === "image" && data.local_cache_path ? (
          <ImagePreview path={data.local_cache_path} />
        ) : null}
        {!loading && !error && data?.kind === "pdf" && data.local_cache_path ? (
          <PdfPreview path={data.local_cache_path} />
        ) : null}
        {!loading && !error && data?.kind === "unsupported" ? (
          <UnsupportedPreview
            filename={data.filename}
            totalSize={data.total_size}
            onOpenExternal={openExternal}
          />
        ) : null}
      </div>
    </aside>
  );
}
