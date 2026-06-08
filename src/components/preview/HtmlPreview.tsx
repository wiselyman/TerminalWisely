import { useMemo } from "react";
import type { SearchOptions } from "../../lib/previewSearch";
import { EditableTextPreview } from "./EditableTextPreview";

interface HtmlPreviewProps {
  text: string;
  extension: string;
  mode: "source" | "preview";
  query: string;
  activeMatchIndex: number;
  searchOptions?: SearchOptions;
  editable?: boolean;
  onChange?: (value: string) => void;
}

export function HtmlPreview({
  text,
  extension,
  mode,
  query,
  activeMatchIndex,
  searchOptions,
  editable = false,
  onChange,
}: HtmlPreviewProps) {
  const srcDoc = useMemo(() => {
    if (mode !== "preview") return "";
    return text;
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
    <iframe
      title="HTML preview"
      className="preview-html-frame"
      srcDoc={srcDoc}
    />
  );
}

