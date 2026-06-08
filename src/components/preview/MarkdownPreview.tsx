import { useMemo } from "react";
import { marked } from "marked";
import type { SearchOptions } from "../../lib/previewSearch";
import { EditableTextPreview } from "./EditableTextPreview";

interface MarkdownPreviewProps {
  text: string;
  extension: string;
  mode: "source" | "preview";
  query: string;
  activeMatchIndex: number;
  searchOptions?: SearchOptions;
  editable?: boolean;
  onChange?: (value: string) => void;
}

export function MarkdownPreview({
  text,
  extension,
  mode,
  query,
  activeMatchIndex,
  searchOptions,
  editable = false,
  onChange,
}: MarkdownPreviewProps) {
  const html = useMemo(() => {
    if (mode !== "preview") return "";
    return marked.parse(text, { async: false }) as string;
  }, [mode, text]);

  if (mode === "source") {
    return (
      <EditableTextPreview
        text={text}
        extension={extension}
        query={query}
        activeMatchIndex={activeMatchIndex}
        searchOptions={searchOptions}
        editable={editable}
        onChange={onChange}
      />
    );
  }

  return (
    <div
      className="preview-markdown-body"
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
