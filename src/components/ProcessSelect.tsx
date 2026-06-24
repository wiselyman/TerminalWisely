import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { ProcessEntry } from "../types";

interface ProcessSelectProps {
  value: string;
  onChange: (value: string) => void;
  processes: ProcessEntry[];
  loading?: boolean;
  placeholder?: string;
  disabled?: boolean;
  /** Insert PID (default) or process name into the command. */
  pick?: "pid" | "name";
}

const MAX_VISIBLE = 80;

function formatProcessLabel(process: ProcessEntry): string {
  return `${process.name} · ${process.pid}`;
}

function matchesProcess(process: ProcessEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (process.name.toLowerCase().includes(q)) return true;
  if (String(process.pid).includes(q)) return true;
  if (process.command?.toLowerCase().includes(q)) return true;
  return false;
}

export function ProcessSelect({
  value,
  onChange,
  processes,
  loading = false,
  placeholder,
  disabled = false,
  pick = "pid",
}: ProcessSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);

  const selected = useMemo(() => {
    if (pick === "name") {
      return processes.find((process) => process.name === value);
    }
    return processes.find((process) => String(process.pid) === value);
  }, [pick, processes, value]);

  const filtered = useMemo(
    () => processes.filter((process) => matchesProcess(process, query)).slice(0, MAX_VISIBLE),
    [processes, query],
  );

  const inputValue =
    open ? query : pick === "name" ? value : selected ? formatProcessLabel(selected) : value;

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

  const pickProcess = (process: ProcessEntry) => {
    onChange(pick === "name" ? process.name : String(process.pid));
    setQuery("");
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
      pickProcess(filtered[activeIndex]);
      return;
    }
    if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
      setQuery("");
    }
  };

  const showDropdown = open && !disabled;

  return (
    <div className="searchable-select process-select" ref={rootRef}>
      <input
        type="text"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={listId}
        aria-autocomplete="list"
        value={inputValue}
        placeholder={
          placeholder ??
          (pick === "name" ? "搜索或输入进程名" : "搜索进程名或输入 PID")
        }
        disabled={disabled}
        onFocus={() => {
          setQuery(pick === "name" ? value : (selected?.name ?? value));
          setOpen(true);
        }}
        onChange={(event) => {
          const next = event.target.value;
          setQuery(next);
          setOpen(true);
          setActiveIndex(-1);
          if (pick === "name") {
            onChange(next);
            return;
          }
          const trimmed = next.trim();
          if (/^\d+$/.test(trimmed)) {
            onChange(trimmed);
          } else if (!trimmed) {
            onChange("");
          }
        }}
        onKeyDown={onKeyDown}
      />
      {showDropdown ? (
        <ul id={listId} className="searchable-select-list" role="listbox">
          {loading ? (
            <li className="searchable-select-hint">正在加载进程列表…</li>
          ) : filtered.length === 0 ? (
            <li className="searchable-select-hint">
              {processes.length === 0
                ? "未获取到进程列表，可直接输入 PID"
                : "无匹配项，可直接输入 PID"}
            </li>
          ) : (
            filtered.map((process, index) => (
              <li key={process.pid}>
                <button
                  type="button"
                  role="option"
                  aria-selected={
                    pick === "name"
                      ? process.name === value
                      : String(process.pid) === value
                  }
                  className={`searchable-select-option process-select-option${
                    index === activeIndex ? " active" : ""
                  }`}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => pickProcess(process)}
                >
                  <span className="process-select-name">{process.name}</span>
                  <span className="process-select-meta">
                    PID {process.pid}
                    {process.cpu_percent > 0
                      ? ` · CPU ${process.cpu_percent.toFixed(1)}%`
                      : ""}
                  </span>
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}
