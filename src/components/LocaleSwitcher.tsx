import { useEffect, useRef, useState } from "react";
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

export function LocaleSwitcher() {
  const { t, i18n } = useTranslation("common");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = (i18n.language === "zh-CN" ? "zh-CN" : "en") as AppLocale;

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const choose = (locale: AppLocale) => {
    void setAppLocale(locale);
    setOpen(false);
  };

  return (
    <div className="locale-switcher" ref={rootRef}>
      <button
        type="button"
        className="locale-switcher-trigger"
        title={t("language")}
        aria-label={t("language")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <GlobeIcon />
      </button>
      {open ? (
        <div className="locale-switcher-menu" role="menu">
          <button
            type="button"
            role="menuitemradio"
            aria-checked={current === "zh-CN"}
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
            className={
              current === "en"
                ? "locale-switcher-item active"
                : "locale-switcher-item"
            }
            onClick={() => choose("en")}
          >
            {t("languageEn")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
