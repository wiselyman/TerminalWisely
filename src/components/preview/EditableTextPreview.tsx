import { useCallback, useEffect, useMemo, useRef } from "react";
import { findSearchMatches, type SearchOptions } from "../../lib/previewSearch";
import { PreviewSourceLayer } from "./PreviewSourceLayer";
import { TextPreview } from "./TextPreview";

interface EditableTextPreviewProps {
  text: string;
  extension: string;
  query: string;
  activeMatchIndex: number;
  searchOptions?: SearchOptions;
  editable?: boolean;
  onChange?: (value: string) => void;
}

export function EditableTextPreview({
  text,
  extension,
  query,
  activeMatchIndex,
  searchOptions,
  editable = false,
  onChange,
}: EditableTextPreviewProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const matches = useMemo(
    () => findSearchMatches(text, query, searchOptions),
    [text, query, searchOptions],
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
    const before = text.slice(0, match.start);
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
  }, [activeMatchIndex, editable, matches, query, text]);

  useEffect(() => {
    syncScroll();
  }, [syncScroll, text, query, activeMatchIndex, extension]);

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
          text={text}
          extension={extension}
          query={query}
          activeMatchIndex={activeMatchIndex}
          searchOptions={searchOptions}
        />
      </pre>
      <textarea
        ref={textareaRef}
        className="preview-text-editor preview-text-editor-overlay"
        value={text}
        onChange={(event) => onChange?.(event.target.value)}
        onScroll={syncScroll}
        spellCheck={false}
        aria-label="编辑文件内容"
      />
    </div>
  );
}
