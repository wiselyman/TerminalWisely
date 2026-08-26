import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  INTERACTION_MODES,
  type InteractionMode,
} from "../../stores/aiEngineerStore";

type Props = {
  mode: InteractionMode;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (mode: InteractionMode) => void;
};

function ModeGlyph({ mode }: { mode: InteractionMode }) {
  if (mode === "agent") {
    return (
      <span className="ai-engineer-interaction-glyph" aria-hidden>
        ∞
      </span>
    );
  }
  if (mode === "plan") {
    return (
      <svg
        className="ai-engineer-interaction-glyph-svg"
        viewBox="0 0 16 16"
        width="14"
        height="14"
        aria-hidden
      >
        <circle cx="4" cy="4" r="1.5" fill="currentColor" />
        <circle cx="12" cy="4" r="1.5" fill="currentColor" />
        <circle cx="8" cy="12" r="1.5" fill="currentColor" />
        <path
          d="M4 5.5v2.2c0 1.2 1.8 2.3 4 2.3s4-1.1 4-2.3V5.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.2"
        />
      </svg>
    );
  }
  return (
    <svg
      className="ai-engineer-interaction-glyph-svg"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      aria-hidden
    >
      <path
        fill="currentColor"
        d="M2.5 3.5h11a1 1 0 0 1 1 1v5.2a1 1 0 0 1-1 1H7.2L4 13.5v-2.8H2.5a1 1 0 0 1-1-1V4.5a1 1 0 0 1 1-1Z"
      />
    </svg>
  );
}

const MENU_WIDTH = 240;
const MENU_MARGIN = 8;

export function InteractionModePicker({
  mode,
  disabled,
  open,
  onOpenChange,
  onChange,
}: Props) {
  const { t } = useTranslation("tools");
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) {
      setPos(null);
      return;
    }
    const place = () => {
      const btn = wrapRef.current?.querySelector("button");
      const menu = menuRef.current;
      if (!btn) return;
      const r = btn.getBoundingClientRect();
      const mh = menu?.offsetHeight ?? 220;
      let top = r.top - mh - 6;
      if (top < MENU_MARGIN) {
        top = Math.min(r.bottom + 6, window.innerHeight - mh - MENU_MARGIN);
      }
      let left = r.left;
      left = Math.min(
        Math.max(MENU_MARGIN, left),
        window.innerWidth - MENU_WIDTH - MENU_MARGIN,
      );
      setPos({ top, left });
    };
    place();
    // Re-measure after paint when menu height is known.
    requestAnimationFrame(place);
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      const t = event.target as Node;
      if (wrapRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      onOpenChange(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("mousedown", onDoc, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div
      className="ai-engineer-menu-wrap ai-engineer-interaction-wrap"
      ref={wrapRef}
    >
      <button
        type="button"
        className={`ai-engineer-interaction-trigger${open ? " is-open" : ""}`}
        aria-label={t("aiEngineer.interactionModeLabel")}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        <ModeGlyph mode={mode} />
        <span>{t(`aiEngineer.interactionMode.${mode}.label`)}</span>
        <span aria-hidden>▾</span>
      </button>
      {open
        ? createPortal(
            <div
              ref={menuRef}
              className="ai-engineer-menu ai-engineer-interaction-menu ai-engineer-menu-portal"
              role="menu"
              aria-label={t("aiEngineer.interactionModeLabel")}
              style={{
                position: "fixed",
                top: pos?.top ?? -9999,
                left: pos?.left ?? -9999,
                width: MENU_WIDTH,
                zIndex: 35100,
                visibility: pos ? "visible" : "hidden",
              }}
            >
              {INTERACTION_MODES.map((m) => {
                const selected = m === mode;
                return (
                  <button
                    key={m}
                    type="button"
                    role="menuitemradio"
                    aria-checked={selected}
                    className={`ai-engineer-interaction-option${selected ? " selected" : ""}`}
                    title={t(`aiEngineer.interactionMode.${m}.desc`)}
                    onClick={() => {
                      onChange(m);
                      onOpenChange(false);
                    }}
                  >
                    <ModeGlyph mode={m} />
                    <span className="ai-engineer-interaction-option-copy">
                      <strong>
                        {t(`aiEngineer.interactionMode.${m}.label`)}
                      </strong>
                      <span>{t(`aiEngineer.interactionMode.${m}.desc`)}</span>
                    </span>
                    {selected ? (
                      <span
                        className="ai-engineer-interaction-option-check"
                        aria-hidden
                      >
                        ✓
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
