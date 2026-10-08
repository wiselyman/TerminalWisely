import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Check } from "lucide-react";
import { EngineMark } from "./DbIcons";

export function EngineSelect({
  value,
  engines,
  onChange,
  testId,
}: {
  value: string;
  engines: readonly string[];
  onChange: (engine: string) => void;
  testId: string;
}) {
  const listId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [menuStyle, setMenuStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    if (!open || !rootRef.current) return;
    const rect = rootRef.current.getBoundingClientRect();
    const menuMax = 320;
    const spaceBelow = window.innerHeight - rect.bottom - 8;
    const openUp = spaceBelow < Math.min(menuMax, engines.length * 36) && rect.top > spaceBelow;
    const maxHeight = Math.min(menuMax, openUp ? rect.top - 8 : spaceBelow);
    setMenuStyle({
      position: "fixed",
      left: rect.left,
      width: rect.width,
      maxHeight: Math.max(120, maxHeight),
      zIndex: 37000,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  }, [open, engines.length, value]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <div className={`db-engine-select${open ? " open" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="db-engine-select-trigger"
        data-testid={testId}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen((current) => !current)}
      >
        <EngineMark engine={value} />
        <span>{value}</span>
      </button>
      {open
        ? createPortal(
            <ul
              id={listId}
              className="db-engine-select-menu"
              role="listbox"
              ref={menuRef}
              style={menuStyle}
              data-testid={`${testId}-menu`}
            >
              {engines.map((engine) => {
                const selected = engine === value;
                return (
                  <li key={engine} role="presentation">
                    <button
                      type="button"
                      role="option"
                      aria-selected={selected}
                      data-testid={`${testId}-${engine}`}
                      onClick={() => {
                        onChange(engine);
                        setOpen(false);
                      }}
                    >
                      <span className="db-engine-select-check" aria-hidden>
                        {selected ? <Check size={14} strokeWidth={2.5} /> : null}
                      </span>
                      <EngineMark engine={engine} />
                      <span>{engine}</span>
                    </button>
                  </li>
                );
              })}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
