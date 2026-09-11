import { useEffect, useMemo, useRef } from "react";
import { findSearchMatches, type SearchOptions } from "../../lib/previewSearch";
import { PreviewSourceLayer } from "./PreviewSourceLayer";

interface TextPreviewProps {
  text: string;
  extension: string;
  query: string;
  activeMatchIndex: number;
  searchOptions?: SearchOptions;
}

export function TextPreview({
  text,
  extension,
  query,
  activeMatchIndex,
  searchOptions,
}: TextPreviewProps) {
  const containerRef = useRef<HTMLPreElement>(null);
  const matches = useMemo(
    () => findSearchMatches(text, query, searchOptions),
    [text, query, searchOptions],
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container || matches.length === 0) return;
    const active = container.querySelector(".preview-search-active");
    active?.scrollIntoView({ block: "center" });
  }, [activeMatchIndex, matches.length, query]);

  return (
    <pre ref={containerRef} className="preview-text-body">
      <PreviewSourceLayer
        text={text}
        extension={extension}
        query={query}
        activeMatchIndex={activeMatchIndex}
        searchOptions={searchOptions}
      />
    </pre>
  );
}
