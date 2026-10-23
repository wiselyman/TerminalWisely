import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  setAppLocale,
  type AppLocale,
} from "../i18n";

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
              <span>{t("languageZh")}</span>
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
              <span>{t("languageEn")}</span>
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
        <span className="locale-switcher-code" data-testid="locale-switcher-code">
          {current === "zh-CN" ? "中" : "EN"}
        </span>
      </button>
      {menu}
    </div>
  );
}
