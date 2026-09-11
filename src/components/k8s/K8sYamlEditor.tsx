import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  findSearchMatches,
  isValidSearchQuery,
  type SearchOptions,
} from "../../lib/previewSearch";
import { PreviewSourceLayer } from "../preview/PreviewSourceLayer";

type K8sYamlEditorProps = {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  className?: string;
  testId?: string;
  ariaLabel?: string;
  /** Controlled find bar visibility (Lens-style in-file search). */
  findOpen?: boolean;
  onFindOpenChange?: (open: boolean) => void;
};

/** YAML editor with line numbers, syntax highlighting, and in-file find. */
export function K8sYamlEditor({
  value,
  onChange,
  readOnly = false,
  className,
  testId,
  ariaLabel,
  findOpen: findOpenProp,
  onFindOpenChange,
}: K8sYamlEditorProps) {
  const { t } = useTranslation(["preview", "common"]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);
  const gutterRef = useRef<HTMLDivElement>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const [findOpenInternal, setFindOpenInternal] = useState(false);
  const findOpen = findOpenProp ?? findOpenInternal;
  const setFindOpen = useCallback(
    (open: boolean) => {
      onFindOpenChange?.(open);
      if (findOpenProp === undefined) setFindOpenInternal(open);
    },
    [findOpenProp, onFindOpenChange],
  );

  const [query, setQuery] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [regex, setRegex] = useState(false);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  const searchOptions: SearchOptions = useMemo(
    () => ({ caseSensitive, wholeWord, regex }),
    [caseSensitive, wholeWord, regex],
  );
  const searchValid = isValidSearchQuery(query, searchOptions);
  const matches = useMemo(
    () =>
      findOpen && searchValid
        ? findSearchMatches(value, query, searchOptions)
        : [],
    [findOpen, searchValid, value, query, searchOptions],
  );

  useEffect(() => {
    setActiveMatchIndex(0);
  }, [query, caseSensitive, wholeWord, regex, value]);

  useEffect(() => {
    if (matches.length === 0) {
      setActiveMatchIndex(0);
      return;
    }
    if (activeMatchIndex >= matches.length) {
      setActiveMatchIndex(0);
    }
  }, [matches.length, activeMatchIndex]);

  const lineCount = useMemo(
    () => Math.max(1, value.split("\n").length),
    [value],
  );
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, index) => index + 1),
    [lineCount],
  );

  const syncScroll = useCallback(() => {
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    const gutter = gutterRef.current;
    if (!textarea) return;
    if (highlight) {
      highlight.scrollTop = textarea.scrollTop;
      highlight.scrollLeft = textarea.scrollLeft;
    }
    if (gutter) {
      gutter.scrollTop = textarea.scrollTop;
    }
  }, []);

  useEffect(() => {
    syncScroll();
  }, [syncScroll, value, query, activeMatchIndex]);

  const goMatch = useCallback(
    (direction: 1 | -1) => {
      if (matches.length === 0) return;
      setActiveMatchIndex(
        (activeMatchIndex + direction + matches.length) % matches.length,
      );
    },
    [activeMatchIndex, matches.length],
  );

  useEffect(() => {
    if (!findOpen || matches.length === 0 || readOnly) return;
    const textarea = textareaRef.current;
    const highlight = highlightRef.current;
    if (!textarea) return;
    const match = matches[activeMatchIndex];
    if (!match) return;

    const lineHeight =
      Number.parseInt(getComputedStyle(textarea).lineHeight, 10) || 20;
    const before = value.slice(0, match.start);
    const line = before.split("\n").length - 1;
    const scrollTop = Math.max(
      0,
      line * lineHeight - textarea.clientHeight / 2,
    );
    textarea.scrollTop = scrollTop;
    if (highlight) highlight.scrollTop = scrollTop;
    gutterRef.current && (gutterRef.current.scrollTop = scrollTop);
    textarea.setSelectionRange(match.start, match.end);
  }, [activeMatchIndex, findOpen, matches, readOnly, value]);

  useEffect(() => {
    if (!findOpen) return;
    const id = window.setTimeout(() => findInputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [findOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const active = document.activeElement;
      const focusedHere = Boolean(
        wrapRef.current && active && wrapRef.current.contains(active),
      );
      if (!focusedHere) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        setFindOpen(true);
        return;
      }
      if (event.key === "Escape" && findOpen) {
        event.preventDefault();
        setFindOpen(false);
        textareaRef.current?.focus();
        return;
      }
      if (findOpen && event.key === "F3") {
        event.preventDefault();
        goMatch(event.shiftKey ? -1 : 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [findOpen, goMatch, setFindOpen]);

  const highlightQuery = findOpen && searchValid ? query : "";

  const findBar = findOpen ? (
    <div className="k8s-yaml-find-bar" data-k8s-yaml-find data-testid="k8s-yaml-find-bar">
      <Search size={13} strokeWidth={2} aria-hidden className="k8s-yaml-find-icon" />
      <input
        ref={findInputRef}
        type="search"
        className={`k8s-yaml-find-input${!searchValid ? " is-invalid" : ""}`}
        value={query}
        placeholder={
          regex ? t("searchRegexPlaceholder") : t("searchPlaceholder")
        }
        aria-label={t("searchAria")}
        data-testid="k8s-yaml-find-input"
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            goMatch(e.shiftKey ? -1 : 1);
          }
        }}
      />
      <button
        type="button"
        className={`k8s-yaml-find-toggle${caseSensitive ? " active" : ""}`}
        title={t("matchCase")}
        aria-label={t("matchCase")}
        aria-pressed={caseSensitive}
        onClick={() => setCaseSensitive((v) => !v)}
      >
        Aa
      </button>
      <button
        type="button"
        className={`k8s-yaml-find-toggle${wholeWord ? " active" : ""}`}
        title={t("matchWord")}
        aria-label={t("matchWord")}
        aria-pressed={wholeWord}
        onClick={() => setWholeWord((v) => !v)}
      >
        W
      </button>
      <button
        type="button"
        className={`k8s-yaml-find-toggle${regex ? " active" : ""}`}
        title={t("useRegex")}
        aria-label={t("useRegex")}
        aria-pressed={regex}
        onClick={() => setRegex((v) => !v)}
      >
        .*
      </button>
      <span className="k8s-yaml-find-count" title={t("searchNavHint")}>
        {!searchValid
          ? t("searchInvalid")
          : matches.length > 0
            ? `${activeMatchIndex + 1}/${matches.length}`
            : query.trim()
              ? "0"
              : ""}
      </span>
      <button
        type="button"
        className="k8s-yaml-find-nav"
        aria-label={t("prevMatch")}
        disabled={matches.length === 0}
        onClick={() => goMatch(-1)}
      >
        <ChevronUp size={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="k8s-yaml-find-nav"
        aria-label={t("nextMatch")}
        disabled={matches.length === 0}
        onClick={() => goMatch(1)}
      >
        <ChevronDown size={14} strokeWidth={2} />
      </button>
      <button
        type="button"
        className="k8s-yaml-find-nav"
        aria-label={t("common:close")}
        data-testid="k8s-yaml-find-close"
        onClick={() => {
          setFindOpen(false);
          textareaRef.current?.focus();
        }}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  ) : null;

  if (readOnly) {
    return (
      <div
        ref={wrapRef}
        className={`k8s-yaml-editor-shell${className ? ` ${className}` : ""}`}
        data-testid={testId}
      >
        <div className="k8s-yaml-editor-wrap">
          <div className="k8s-yaml-editor-gutter" aria-hidden>
            {lineNumbers.map((lineNo) => (
              <div key={lineNo} className="k8s-yaml-editor-line-no">
                {lineNo}
              </div>
            ))}
          </div>
          <pre className="k8s-yaml-editor-main k8s-yaml-editor-readonly preview-source-hljs">
            <PreviewSourceLayer
              text={value}
              extension="yaml"
              query={highlightQuery}
              activeMatchIndex={activeMatchIndex}
              searchOptions={searchOptions}
            />
          </pre>
        </div>
        {findBar}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className={`k8s-yaml-editor-shell${className ? ` ${className}` : ""}`}
      data-testid={testId}
    >
      <div className="k8s-yaml-editor-wrap">
        <div className="k8s-yaml-editor-gutter" ref={gutterRef} aria-hidden>
          {lineNumbers.map((lineNo) => (
            <div key={lineNo} className="k8s-yaml-editor-line-no">
              {lineNo}
            </div>
          ))}
        </div>
        <div className="k8s-yaml-editor-main preview-editor-wrap">
          <pre
            ref={highlightRef}
            className="preview-editor-highlight preview-source-hljs"
            aria-hidden="true"
          >
            <PreviewSourceLayer
              text={value}
              extension="yaml"
              query={highlightQuery}
              activeMatchIndex={activeMatchIndex}
              searchOptions={searchOptions}
            />
          </pre>
          <textarea
            ref={textareaRef}
            className="preview-text-editor preview-text-editor-overlay k8s-yaml-editor-input"
            data-testid={testId ? `${testId}-input` : undefined}
            value={value}
            onChange={(event) => onChange?.(event.target.value)}
            onScroll={syncScroll}
            spellCheck={false}
            aria-label={ariaLabel}
          />
        </div>
      </div>
      {findBar}
    </div>
  );
}
