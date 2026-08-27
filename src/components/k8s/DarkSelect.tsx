import { useEffect, useId, useRef, useState } from "react";

interface DarkSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  "aria-label"?: string;
  className?: string;
}

/** Custom select that stays dark in WKWebView (native <select> ignores theme). */
export function DarkSelect({
  value,
  onChange,
  options,
  className,
  "aria-label": ariaLabel,
}: DarkSelectProps) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  return (
    <div
      className={`k8s-dark-select${className ? ` ${className}` : ""}${open ? " open" : ""}`}
      ref={rootRef}
    >
      <button
        type="button"
        className="k8s-dark-select-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{selected?.label ?? value}</span>
      </button>
      {open ? (
        <ul id={listId} className="k8s-dark-select-menu" role="listbox">
          {options.map((opt) => (
            <li key={opt.value} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={opt.value === value}
                className={opt.value === value ? "selected" : undefined}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                {opt.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
