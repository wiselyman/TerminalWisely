import { useEffect, useMemo, useRef, type MouseEvent as ReactMouseEvent } from "react";
import { createPortal } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { useShallow } from "zustand/react/shallow";
import { formatAppError } from "../lib/formatAppError";
import {
  findSearchMatches,
  getMatchPosition,
  isValidSearchQuery,
} from "../lib/previewSearch";
import { usePreviewStore, useActivePreviewTab, usePreviewTabsForSession } from "../stores/previewStore";
import { isPreviewTabDirty } from "../stores/previewTypes";
import { useToastStore } from "../stores/toastStore";
import { PreviewDock } from "./PreviewDock";
import { Modal } from "./Modal";
import { EditableTextPreview } from "./preview/EditableTextPreview";
import { HtmlPreview } from "./preview/HtmlPreview";
import { ImagePreview } from "./preview/ImagePreview";
import { MarkdownPreview } from "./preview/MarkdownPreview";
import { PdfPreview } from "./preview/PdfPreview";
import { UnsupportedPreview } from "./preview/UnsupportedPreview";
import {
  PreviewChevronDownIcon,
  PreviewChevronUpIcon,
  PreviewCloseIcon,
  PreviewExternalIcon,
  PreviewMaximizeIcon,
  PreviewMinimizeIcon,
  PreviewRenderedIcon,
  PreviewRestoreIcon,
  PreviewSaveIcon,
  PreviewSourceIcon,
} from "./PreviewIcons";

interface PreviewPanelProps {
  sessionId: string;
  sessionTitle?: string;
}

export function PreviewPanel({ sessionId, sessionTitle: _sessionTitle }: PreviewPanelProps) {
  const { t } = useTranslation("preview");
  const sessionTabs = usePreviewTabsForSession(sessionId);
  const activeTab = useActivePreviewTab(sessionId);
  const {
    width,
    height,
    maximized,
    minimized,
    setWidth,
    setHeight,
    toggleMaximize,
    minimizePreview,
    setSearchQuery,
    setActiveMatchIndex,
    setSearchCaseSensitive,
    setSearchRegex,
    setSearchWholeWord,
    setMarkdownMode,
    setEditedContent,
    savePreview,
    closePreview,
    sudoPrompt,
    sudoPassword,
    setSudoPassword,
    closeSudoPrompt,
    submitSudoPassword,
  } = usePreviewStore(
    useShallow((s) => ({
      width: s.width,
      height: s.height,
      maximized: s.maximized,
      minimized: s.minimized,
      setWidth: s.setWidth,
      setHeight: s.setHeight,
      toggleMaximize: s.toggleMaximize,
      minimizePreview: s.minimizePreview,
      setSearchQuery: s.setSearchQuery,
      setActiveMatchIndex: s.setActiveMatchIndex,
      setSearchCaseSensitive: s.setSearchCaseSensitive,
      setSearchRegex: s.setSearchRegex,
      setSearchWholeWord: s.setSearchWholeWord,
      setMarkdownMode: s.setMarkdownMode,
      setEditedContent: s.setEditedContent,
      savePreview: s.savePreview,
      closePreview: s.closePreview,
      sudoPrompt: s.sudoPrompt,
      sudoPassword: s.sudoPassword,
      setSudoPassword: s.setSudoPassword,
      closeSudoPrompt: s.closeSudoPrompt,
      submitSudoPassword: s.submitSudoPassword,
    })),
  );

  useEffect(() => {
    usePreviewStore.getState().syncTerminalSession(sessionId);
  }, [sessionId]);

  const data = activeTab?.data ?? null;
  const loading = activeTab?.loading ?? false;
  const saving = activeTab?.saving ?? false;
  const error = activeTab?.error ?? null;
  const editedContent = activeTab?.editedContent ?? null;
  const searchQuery = activeTab?.searchQuery ?? "";
  const activeMatchIndex = activeTab?.activeMatchIndex ?? 0;
  const searchCaseSensitive = activeTab?.searchCaseSensitive ?? false;
  const searchRegex = activeTab?.searchRegex ?? false;
  const searchWholeWord = activeTab?.searchWholeWord ?? false;
  const markdownMode = activeTab?.markdownMode ?? "source";
  const pushToast = useToastStore((s) => s.pushToast);
  const resizeRef = useRef<{
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
  } | null>(null);

  useEffect(() => {
    const onMouseMove = (event: MouseEvent) => {
      const state = resizeRef.current;
      if (!state) return;
      setWidth(state.startWidth + (event.clientX - state.startX));
      setHeight(state.startHeight + (event.clientY - state.startY));
    };

    const onMouseUp = () => {
      resizeRef.current = null;
      document.body.classList.remove("preview-float-resizing");
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, [setWidth, setHeight]);

  const startResize = (event: ReactMouseEvent) => {
    if (maximized) return;
    event.preventDefault();
    event.stopPropagation();
    resizeRef.current = {
      startX: event.clientX,
      startY: event.clientY,
      startWidth: width,
      startHeight: height,
    };
    document.body.classList.add("preview-float-resizing");
  };

  useEffect(() => {
    if (sessionTabs.length === 0 || minimized) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        void closePreview();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sessionTabs.length, minimized, closePreview]);

  const savedContent = data?.text_content ?? "";
  const displayContent = editedContent ?? savedContent;
  const dirty = activeTab ? isPreviewTabDirty(activeTab) : false;

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
    }).catch((err) => pushToast(formatAppError(err), false));
  };

  const titleHint = useMemo(() => {
    if (!data) return undefined;
    const parts: string[] = [];
    if (data.resolved_path) parts.push(data.resolved_path);
    if (dirty) parts.push(t("statusUnsaved"));
    if (data.truncated) parts.push(t("statusTruncated"));
    if (data.uses_sudo) parts.push(t("statusNeedsSudo"));
    return parts.length > 0 ? parts.join("\n") : undefined;
  }, [data, dirty, t]);

  if (sessionTabs.length === 0) return null;

  const showFloat = !minimized && activeTab != null;

  return createPortal(
    <>
      {showFloat ? (
      <div
        className={`preview-float-backdrop${maximized ? " maximized" : ""}`}
        role="presentation"
        onMouseDown={(event) => {
          if (maximized) return;
          if (event.target === event.currentTarget) {
            minimizePreview();
          }
        }}
      >
        <div
          className={`preview-float-window${maximized ? " maximized" : ""}`}
          style={maximized ? undefined : { width, height }}
          role="dialog"
          aria-label={t("panelAria")}
          onMouseDown={(event) => event.stopPropagation()}
        >
    <aside className="preview-panel" aria-label={t("panelAria")}>
      <div className="preview-panel-head">
        <strong className="preview-panel-title" title={titleHint}>
          {data?.filename ?? t("fallbackTitle")}
          {dirty ? <span className="preview-panel-dirty"> *</span> : null}
        </strong>

        {data && (data.kind === "markdown" || data.kind === "html") ? (
          <div className="preview-panel-toolbar-cluster preview-panel-mode-cluster">
            <button
              type="button"
              className={`preview-toolbar-icon${markdownMode === "source" ? " active" : ""}`}
              title={t("modeSource")}
              aria-label={t("modeSource")}
              aria-pressed={markdownMode === "source"}
              onClick={() => setMarkdownMode("source")}
            >
              <PreviewSourceIcon />
            </button>
            <button
              type="button"
              className={`preview-toolbar-icon${markdownMode === "preview" ? " active" : ""}`}
              title={t("modePreview")}
              aria-label={t("modePreview")}
              aria-pressed={markdownMode === "preview"}
              onClick={() => setMarkdownMode("preview")}
            >
              <PreviewRenderedIcon />
            </button>
          </div>
        ) : null}

        {searchable ? (
          markdownMode !== "preview" ? (
            <>
              <input
                type="search"
                className={`preview-head-search${!searchValid ? " preview-search-invalid" : ""}`}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={searchRegex ? t("searchRegexPlaceholder") : t("searchPlaceholder")}
                aria-label={t("searchAria")}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    goMatch(event.shiftKey ? -1 : 1);
                  }
                }}
              />
              <div className="preview-panel-toolbar-cluster preview-panel-search-cluster">
                <button
                  type="button"
                  className={`preview-search-toggle${searchCaseSensitive ? " active" : ""}`}
                  title={t("matchCase")}
                  aria-label={t("matchCase")}
                  aria-pressed={searchCaseSensitive}
                  onClick={() => setSearchCaseSensitive(!searchCaseSensitive)}
                >
                  Aa
                </button>
                <button
                  type="button"
                  className={`preview-search-toggle${searchWholeWord ? " active" : ""}`}
                  title={t("matchWord")}
                  aria-label={t("matchWord")}
                  aria-pressed={searchWholeWord}
                  onClick={() => setSearchWholeWord(!searchWholeWord)}
                >
                  W
                </button>
                <button
                  type="button"
                  className={`preview-search-toggle${searchRegex ? " active" : ""}`}
                  title={t("useRegex")}
                  aria-label={t("useRegex")}
                  aria-pressed={searchRegex}
                  onClick={() => setSearchRegex(!searchRegex)}
                >
                  .*
                </button>
                <span className="preview-search-count" title={t("searchNavHint")}>
                  {!searchValid
                    ? t("searchInvalid")
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
                className="preview-icon-btn preview-toolbar-icon"
                aria-label={t("prevMatch")}
                disabled={matches.length === 0}
                onClick={() => goMatch(-1)}
              >
                <PreviewChevronUpIcon />
              </button>
              <button
                type="button"
                className="preview-icon-btn preview-toolbar-icon"
                aria-label={t("nextMatch")}
                disabled={matches.length === 0}
                onClick={() => goMatch(1)}
              >
                <PreviewChevronDownIcon />
              </button>
              </div>
            </>
          ) : (
            <div className="preview-panel-head-spacer" aria-hidden="true" />
          )
        ) : null}

        <div className="preview-panel-actions">
          {canEditSource ? (
            <button
              type="button"
              className={`preview-toolbar-icon preview-toolbar-icon-primary${dirty ? " dirty" : ""}`}
              disabled={!dirty || saving}
              title={saving ? t("saveTitleBusy") : t("saveTitle")}
              aria-label={saving ? t("common:saving") : t("common:save")}
              onClick={() => void savePreview()}
            >
              <PreviewSaveIcon />
            </button>
          ) : null}
          {data?.handle_id ? (
            <button
              type="button"
              className="preview-toolbar-icon"
              title={t("openInSystem")}
              aria-label={t("openInSystem")}
              onClick={openExternal}
            >
              <PreviewExternalIcon />
            </button>
          ) : null}
          <button
            type="button"
            className="preview-toolbar-icon"
            title={t("minimizeToDock")}
            aria-label={t("common:minimize")}
            onClick={minimizePreview}
          >
            <PreviewMinimizeIcon />
          </button>
          <button
            type="button"
            className="preview-toolbar-icon"
            title={maximized ? t("common:restore") : t("common:maximize")}
            aria-label={maximized ? t("common:restore") : t("common:maximize")}
            onClick={toggleMaximize}
          >
            {maximized ? <PreviewRestoreIcon /> : <PreviewMaximizeIcon />}
          </button>
          <button
            type="button"
            className="preview-toolbar-icon"
            title={t("closeFileTitle")}
            aria-label={t("common:close")}
            onClick={() => void closePreview()}
          >
            <PreviewCloseIcon />
          </button>
        </div>
      </div>

      <div className="preview-panel-body">
        {loading ? <div className="preview-empty">{t("opening")}</div> : null}
        {!loading && error ? <div className="preview-empty">{error}</div> : null}
        {!loading && !error && data?.kind === "text" ? (
          <EditableTextPreview
            tabId={activeTab.id}
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
            tabId={activeTab.id}
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
            tabId={activeTab.id}
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
            tabId={activeTab.id}
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
          {!maximized ? (
            <div
              className="preview-float-resizer"
              role="presentation"
              aria-hidden="true"
              onMouseDown={startResize}
            />
          ) : null}
        </div>
      </div>
      ) : null}
      <PreviewDock sessionId={sessionId} />
      {sudoPrompt ? (
        <div className="preview-sudo-layer">
          <Modal title={t("sudoModalTitle")} onClose={closeSudoPrompt}>
            <form
              className="connection-form"
              onSubmit={(event) => {
                event.preventDefault();
                void submitSudoPassword();
              }}
            >
              <p className="modal-hint">
                {sudoPrompt.action === "open" ? t("sudoHintOpen") : t("sudoHintSave")}
              </p>
              <p className="modal-hint preview-panel-path">{sudoPrompt.path}</p>
              <label>
                {t("sudoPasswordLabel")}
                <input
                  type="password"
                  value={sudoPassword}
                  onChange={(event) => setSudoPassword(event.target.value)}
                  autoFocus
                />
              </label>
              <div className="form-row">
                <button type="submit" disabled={loading || saving}>
                  {loading || saving ? t("common:processing") : t("common:confirm")}
                </button>
                <button type="button" onClick={closeSudoPrompt}>
                  {t("common:cancel")}
                </button>
              </div>
            </form>
          </Modal>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
