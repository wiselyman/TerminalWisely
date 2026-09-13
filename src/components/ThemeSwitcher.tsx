import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  getAppTheme,
  setAppTheme,
  subscribeAppTheme,
  type AppTheme,
} from "../lib/appTheme";

function SunIcon() {
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
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
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
      <path d="M21 14.5A8.5 8.5 0 0 1 9.5 3 7 7 0 1 0 21 14.5z" />
    </svg>
  );
}

type MenuPos = { top: number; right: number };

export function ThemeSwitcher() {
  const { t } = useTranslation("common");
  const [theme, setTheme] = useState<AppTheme>(() => getAppTheme());
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<MenuPos | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeAppTheme(setTheme), []);

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

  const choose = (next: AppTheme) => {
    setAppTheme(next);
    setOpen(false);
  };

  const menu =
    open && menuPos
      ? createPortal(
          <div
            ref={menuRef}
            className="locale-switcher-menu"
            role="menu"
            data-testid="theme-switcher-menu"
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
              aria-checked={theme === "dark"}
              data-testid="theme-option-dark"
              className={
                theme === "dark"
                  ? "locale-switcher-item active"
                  : "locale-switcher-item"
              }
              onClick={() => choose("dark")}
            >
              {t("themeDark")}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={theme === "light"}
              data-testid="theme-option-light"
              className={
                theme === "light"
                  ? "locale-switcher-item active"
                  : "locale-switcher-item"
              }
              onClick={() => choose("light")}
            >
              {t("themeLight")}
            </button>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="locale-switcher" ref={rootRef} data-testid="theme-switcher">
      <button
        type="button"
        className="locale-switcher-trigger"
        data-testid="theme-switcher-trigger"
        title={t("theme")}
        aria-label={t("theme")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {theme === "light" ? <SunIcon /> : <MoonIcon />}
      </button>
      {menu}
    </div>
  );
}
