import { useMemo } from "react";
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

export function PreviewSourceLayer({
  text,
  extension,
  query,
  activeMatchIndex,
  searchOptions,
}: PreviewSourceLayerProps) {
  const searching = query.trim().length > 0;

  // Sync with `text` so the highlight layer updates in the same paint as the
  // overlay textarea — avoids both input lag (stale HTML) and color flicker
  // (plain ↔ highlighted). Store sync is debounced separately in the editor.
  const syntaxHtml = useMemo(
    () => highlightSourceCode(text, extension),
    [text, extension],
  );

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
