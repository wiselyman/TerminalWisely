import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  setAppLocale,
  type AppLocale,
} from "../i18n";

function GlobeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a14 14 0 0 1 0 18" />
      <path d="M12 3a14 14 0 0 0 0 18" />
    </svg>
  );
}

type MenuPos = { top: number; right: number };

export function LocaleSwitcher() {
  const { t, i18n } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const current = (i18n.language === "zh-CN" ? "zh-CN" : "en") as AppLocale;

  useLayoutEffect(() => {
    if (!open || !rootRef.current) {
      setMenuPos(null);
      return;
    }
    const rect = rootRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      right: Math.max(8, window.innerWidth - rect.right),
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (
        rootRef.current?.contains(target) ||
        menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    const onResize = () => setOpen(false);
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", onResize);
    };
  }, [open]);

  const choose = (locale: AppLocale) => {
    void setAppLocale(locale);
    setOpen(false);
  };

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="locale-switcher-menu"
            role="menu"
            data-testid="locale-switcher-menu"
            style={{
              position: "fixed",
              top: menuPos.top,
              right: menuPos.right,
              left: "auto",
            }}
          >
            <button
              type="button"
              role="menuitemradio"
              aria-checked={current === "zh-CN"}
              data-testid="locale-option-zh-CN"
              className={
                current === "zh-CN"
                  ? "locale-switcher-item active"
                  : "locale-switcher-item"
              }
              onClick={() => choose("zh-CN")}
            >
              {t("languageZh")}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={current === "en"}
              data-testid="locale-option-en"
              className={
                current === "en"
                  ? "locale-switcher-item active"
                  : "locale-switcher-item"
              }
              onClick={() => choose("en")}
            >
              {t("languageEn")}
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="locale-switcher" ref={rootRef} data-testid="locale-switcher">
      <button
        type="button"
        className="locale-switcher-trigger"
        data-testid="locale-switcher-trigger"
        title={t("language")}
        aria-label={t("language")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <GlobeIcon />
      </button>
      {menu}
    </div>
  );
}
