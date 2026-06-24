import { useEffect, useId, useMemo, useRef, useState } from "react";

interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
}

const MAX_VISIBLE = 80;

export function SearchableSelect({
  value,
  onChange,
  options,
  loading = false,
  placeholder,
  disabled = false,
}: SearchableSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filtered = useMemo(() => {
    const query = value.trim().toLowerCase();
    const matches = query
      ? options.filter((option) => option.toLowerCase().includes(query))
      : options;
    return matches.slice(0, MAX_VISIBLE);
  }, [options, value]);

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

  const pickOption = (option: string) => {
    onChange(option);
    setOpen(false);
    setActiveIndex(-1);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      setOpen(true);
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) =>
        filtered.length === 0 ? -1 : Math.min(current + 1, filtered.length - 1),
      );
      return;
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
      return;
    }
    if (event.key === "Enter" && activeIndex >= 0 && filtered[activeIndex]) {
      event.preventDefault();
      pickOption(filtered[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  const showDropdown = open && !disabled;

  return (
    <div className="searchable-select" ref={rootRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onFocus={() => setOpen(true)}
        onChange={(event) => {
          onChange(event.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onKeyDown={onKeyDown}
      />
      {showDropdown ? (
        <ul id={listId} className="searchable-select-list" role="listbox">
          {loading ? (
            <li className="searchable-select-hint">正在加载服务列表…</li>
          ) : filtered.length === 0 ? (
            <li className="searchable-select-hint">
              {options.length === 0
                ? "未获取到服务列表，可直接输入"
                : "无匹配项，可直接输入"}
            </li>
          ) : (
            filtered.map((option, index) => (
              <li key={option}>
                <button
                  type="button"
                  role="option"
                  aria-selected={option === value}
                  className={`searchable-select-option${
                    index === activeIndex ? " active" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pickOption(option)}
                >
                  {option}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
