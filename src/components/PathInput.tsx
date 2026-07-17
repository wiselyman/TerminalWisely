import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  fetchPathCompletions,
  longestCommonPrefix,
} from "../lib/pathComplete";

interface PathInputProps {
  sessionId: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export function PathInput({
  sessionId,
  value,
  onChange,
  placeholder,
  disabled = false,
}: PathInputProps) {
  const { t } = useTranslation("commands");
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const lastPartialRef = useRef("");

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const runCompletion = async (partial: string, showListOnMultiple: boolean) => {
    setLoading(true);
    try {
      const completions = await fetchPathCompletions(sessionId, partial);
      lastPartialRef.current = partial;

      if (completions.length === 0) {
        setSuggestions([]);
        setOpen(false);
        return;
      }

      if (completions.length === 1) {
        onChange(completions[0]);
        setSuggestions([]);
        setOpen(false);
        return;
      }

      const common = longestCommonPrefix(completions);
      if (common.length > partial.length) {
        onChange(common);
      }

      if (showListOnMultiple || common.length <= partial.length) {
        setSuggestions(completions);
        setOpen(true);
        setActiveIndex(-1);
      } else {
        setSuggestions(completions);
        setOpen(false);
      }
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };

  const pickSuggestion = (path: string) => {
    onChange(path);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      const showList =
        lastPartialRef.current === value &&
        suggestions.length > 1 &&
        !loading;
      void runCompletion(value, showList);
      return;
    }

    if (!open || suggestions.length === 0) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        suggestions.length === 0
          ? -1
          : Math.min(current + 1, suggestions.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      pickSuggestion(suggestions[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="searchable-select path-input" ref={rootRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        placeholder={placeholder ?? t("run.placeholderPath")}
        disabled={disabled}
        onChange={(event) => {
          onChange(event.target.value);
          lastPartialRef.current = "";
          if (open) setOpen(false);
        }}
        onKeyDown={onKeyDown}
      />
      {open ? (
        <ul id={listId} className="searchable-select-list" role="listbox">
          {loading ? (
            <li className="searchable-select-hint">{t("select.pathLoadingDir")}</li>
          ) : suggestions.length === 0 ? (
            <li className="searchable-select-hint">{t("select.pathNoMatches")}</li>
          ) : (
            suggestions.map((path, index) => (
              <li key={path}>
                <button
                  type="button"
                  role="option"
                  aria-selected={path === value}
                  className={`searchable-select-option${
                    index === activeIndex ? " active" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pickSuggestion(path)}
                >
                  {path}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
      {!open && !loading ? (
        <span className="path-input-hint">{t("select.pathTabHint")}</span>
      ) : null}
    </div>
  );
}
