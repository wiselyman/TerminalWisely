import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

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
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});
  const selected = options.find((o) => o.value === value) ?? options[0];

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const menuMax = 220;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUp = spaceBelow < Math.min(menuMax, options.length * 32) && rect.top > spaceBelow;
    const maxHeight = Math.min(menuMax, openUp ? rect.top - 8 : spaceBelow);
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: Math.max(rect.width, 120),
      maxHeight: Math.max(80, maxHeight),
      zIndex: 10050,
      ...(openUp
        ? { bottom: window.innerHeight - rect.top + 4 }
        : { top: rect.bottom + 4 }),
    });
  }, [open, options.length, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
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
      {open
        ? createPortal(
            <ul
              id={listId}
              className="k8s-dark-select-menu k8s-dark-select-menu--portal"
              role="listbox"
              ref={menuRef}
              style={menuStyle}
            >
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
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
