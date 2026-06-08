import { useEffect, useMemo, useState } from "react";
import {
  findSearchMatches,
  injectSearchHighlights,
  splitTextWithHighlights,
  type SearchOptions,
} from "../../lib/previewSearch";
import {
  escapePlainSource,
  highlightSourceCode,
} from "../../lib/syntaxHighlight";

const SYNTAX_DEBOUNCE_MS = 200;

interface PreviewSourceLayerProps {
  text: string;
  extension: string;
  query: string;
  activeMatchIndex: number;
  searchOptions?: SearchOptions;
}

function SearchHighlightedText({
  text,
  query,
  activeMatchIndex,
  searchOptions,
}: Omit<PreviewSourceLayerProps, "extension">) {
  const matches = useMemo(
    () => findSearchMatches(text, query, searchOptions),
    [text, query, searchOptions],
  );
  const parts = useMemo(
    () => splitTextWithHighlights(text, matches, activeMatchIndex),
    [text, matches, activeMatchIndex],
  );

  return (
    <code>
      {parts.map((part, index) =>
        part.highlight ? (
          <mark
            key={index}
            className={
              part.active
                ? "preview-search-hit preview-search-active"
                : "preview-search-hit"
            }
          >
            {part.text}
          </mark>
        ) : (
          <span key={index}>{part.text}</span>
        ),
      )}
    </code>
  );
}

function useDeferredSyntaxHtml(text: string, extension: string) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setHtml(highlightSourceCode(text, extension));
    }, SYNTAX_DEBOUNCE_MS);

    return () => window.clearTimeout(timer);
  }, [extension, text]);

  return html;
}

export function PreviewSourceLayer({
  text,
  extension,
  query,
  activeMatchIndex,
  searchOptions,
}: PreviewSourceLayerProps) {
  const searching = query.trim().length > 0;
  const syntaxHtml = useDeferredSyntaxHtml(text, extension);

  const matches = useMemo(
    () =>
      searching ? findSearchMatches(text, query, searchOptions) : [],
    [searching, text, query, searchOptions],
  );

  const combinedHtml = useMemo(() => {
    if (!syntaxHtml) return null;
    if (!searching || matches.length === 0) return syntaxHtml;
    return injectSearchHighlights(syntaxHtml, matches, activeMatchIndex);
  }, [syntaxHtml, searching, matches, activeMatchIndex]);

  if (combinedHtml) {
    return (
      <code
        className="hljs preview-source-hljs"
        dangerouslySetInnerHTML={{ __html: combinedHtml }}
      />
    );
  }

  if (searching) {
    return (
      <SearchHighlightedText
        text={text}
        query={query}
        activeMatchIndex={activeMatchIndex}
        searchOptions={searchOptions}
      />
    );
  }

  return (
    <code
      className="preview-source-plain"
      dangerouslySetInnerHTML={{ __html: escapePlainSource(text) }}
    />
  );
}
