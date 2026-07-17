import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  registerPreviewEditorFlush,
  unregisterPreviewEditorFlush,
} from "../../lib/previewEditorFlush";
import { findSearchMatches, type SearchOptions } from "../../lib/previewSearch";
import { PreviewSourceLayer } from "./PreviewSourceLayer";
import { TextPreview } from "./TextPreview";

const STORE_SYNC_MS = 120;

interface EditableTextPreviewProps {
  text: string;
  extension: string;
  query: string;
  activeMatchIndex: number;
  searchOptions?: SearchOptions;
  editable?: boolean;
  tabId?: string;
  onChange?: (value: string) => void;
}

export function EditableTextPreview({
  text,
  extension,
  query,
  activeMatchIndex,
  searchOptions,
  editable = false,
  tabId,
  onChange,
}: EditableTextPreviewProps) {
  const { t } = useTranslation("preview");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const draftRef = useRef(text);
  const syncTimerRef = useRef<number | null>(null);
  const [draft, setDraft] = useState(text);
  const displayText = editable ? draft : text;

  const flushDraft = useCallback(() => {
    if (syncTimerRef.current !== null) {
      window.clearTimeout(syncTimerRef.current);
      syncTimerRef.current = null;
      onChange?.(draftRef.current);
    }
    return draftRef.current;
  }, [onChange]);

  useEffect(() => {
    if (text === draftRef.current) return;
    draftRef.current = text;
    setDraft(text);
  }, [text]);

  useEffect(() => {
    if (!editable || !tabId) return;
    registerPreviewEditorFlush(tabId, flushDraft);
    return () => unregisterPreviewEditorFlush(tabId);
  }, [editable, tabId, flushDraft]);

  useEffect(
    () => () => {
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
        onChange?.(draftRef.current);
      }
    },
    [onChange],
  );

  const scheduleStoreSync = useCallback(
    (value: string) => {
      draftRef.current = value;
      if (syncTimerRef.current !== null) {
        window.clearTimeout(syncTimerRef.current);
      }
      syncTimerRef.current = window.setTimeout(() => {
        syncTimerRef.current = null;
        onChange?.(draftRef.current);
      }, STORE_SYNC_MS);
    },
    [onChange],
  );

  const handleChange = useCallback(
    (value: string) => {
      draftRef.current = value;
      setDraft(value);
      scheduleStoreSync(value);
    },
    [scheduleStoreSync],
  );

  const matches = useMemo(
    () => findSearchMatches(displayText, query, searchOptions),
    [displayText, query, searchOptions],
  );

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    if (!textarea || !highlight) return;
    highlight.scrollTop = textarea.scrollTop;
    highlight.scrollLeft = textarea.scrollLeft;
  }, []);

  useEffect(() => {
    if (!editable) return;
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    if (!textarea || !highlight || matches.length === 0) return;
    const match = matches[activeMatchIndex];
    if (!match) return;

    const lineHeight =
      Number.parseInt(getComputedStyle(textarea).lineHeight, 10) || 20;
    const before = displayText.slice(0, match.start);
    const line = before.split("\n").length - 1;
    const scrollTop = Math.max(
      0,
      line * lineHeight - textarea.clientHeight / 2,
    );
    textarea.scrollTop = scrollTop;
    highlight.scrollTop = scrollTop;

    if (document.activeElement === textarea) {
      textarea.setSelectionRange(match.start, match.end);
    }
  }, [activeMatchIndex, displayText, editable, matches, query]);

  useEffect(() => {
    syncScroll();
  }, [syncScroll, displayText, query, activeMatchIndex, extension]);

  if (!editable) {
    return (
      <TextPreview
        text={text}
        extension={extension}
        query={query}
        activeMatchIndex={activeMatchIndex}
        searchOptions={searchOptions}
      />
    );
  }

  return (
    <div className="preview-editor-wrap">
      <pre
        ref={highlightRef}
        className="preview-editor-highlight"
        aria-hidden="true"
      >
        <PreviewSourceLayer
          text={displayText}
          extension={extension}
          query={query}
          activeMatchIndex={activeMatchIndex}
          searchOptions={searchOptions}
        />
      </pre>
      <textarea
        ref={textareaRef}
        className="preview-text-editor preview-text-editor-overlay"
        value={displayText}
        onChange={(event) => handleChange(event.target.value)}
        onBlur={flushDraft}
        onScroll={syncScroll}
        spellCheck={false}
        aria-label={t("editContentAria")}
      />
    </div>
  );
}
