import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  SECURITY_MODES,
  type SecurityMode,
} from "../../stores/aiEngineerStore";

type Props = {
  mode: SecurityMode;
  disabled?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChange: (mode: SecurityMode) => void;
};

function ModeIcon({ mode }: { mode: SecurityMode }) {
  switch (mode) {
    case "observe":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10 4.5C6.2 4.5 3.1 6.8 1.6 10c1.5 3.2 4.6 5.5 8.4 5.5s6.9-2.3 8.4-5.5C16.9 6.8 13.8 4.5 10 4.5Zm0 9a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7Z"
          />
        </svg>
      );
    case "safe":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10 2.2 4.2 4.4v5.1c0 3.4 2.4 6.5 5.8 7.7 3.4-1.2 5.8-4.3 5.8-7.7V4.4L10 2.2Zm0 2.3 3.8 1.5v4.5c0 2.1-1.4 4-3.8 4.8-2.4-.8-3.8-2.7-3.8-4.8V6l3.8-1.5Z"
          />
        </svg>
      );
    case "autonomous":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10 2a6 6 0 0 0-6 6v2.2l-1.2 2.4A1 1 0 0 0 3.7 14H7v2.5A1.5 1.5 0 0 0 8.5 18h3A1.5 1.5 0 0 0 13 16.5V14h3.3a1 1 0 0 0 .9-1.4L16 10.2V8a6 6 0 0 0-6-6Zm0 2a4 4 0 0 1 4 4v2.3l.8 1.7H5.2L6 10.3V8a4 4 0 0 1 4-4Z"
          />
        </svg>
      );
    case "production":
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            fill="currentColor"
            d="M10 2.2a1 1 0 0 1 .9.6l1.4 2.8 3.1.5a1 1 0 0 1 .55 1.7l-2.2 2.2.5 3.1a1 1 0 0 1-1.45 1.05L10 12.9l-2.8 1.5a1 1 0 0 1-1.45-1.05l.5-3.1-2.2-2.2a1 1 0 0 1 .55-1.7l3.1-.5 1.4-2.8a1 1 0 0 1 .9-.6Z"
          />
        </svg>
      );
  }
}

export function SecurityModePicker({
  mode,
  disabled,
  open,
  onOpenChange,
  onChange,
}: Props) {
  const { t } = useTranslation("tools");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) {
        onOpenChange(false);
      }
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

  const toneClass =
    mode === "production"
      ? "is-warn"
      : mode === "autonomous"
        ? "is-bold"
        : mode === "observe"
          ? "is-muted"
          : "is-safe";

  return (
    <div className="ai-engineer-menu-wrap ai-engineer-security-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`ai-engineer-security-btn ${toneClass}${open ? " is-open" : ""}`}
        aria-label={t("aiEngineer.settings.securityMode")}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => onOpenChange(!open)}
      >
        <span className="ai-engineer-security-btn-icon" aria-hidden>
          <ModeIcon mode={mode} />
        </span>
        <span className="ai-engineer-security-btn-label">
          {t(`aiEngineer.settings.securityModeOption.${mode}.short`)}
        </span>
      </button>
      {open ? (
        <div
          className="ai-engineer-menu ai-engineer-menu-up ai-engineer-security-menu"
          role="menu"
          aria-label={t("aiEngineer.securityMenu.title")}
        >
          <div className="ai-engineer-security-menu-head">
            <strong>{t("aiEngineer.securityMenu.title")}</strong>
            <span>{t("aiEngineer.securityMenu.scope")}</span>
          </div>
          {SECURITY_MODES.map((m) => {
            const selected = m === mode;
            const optionTone =
              m === "production"
                ? "is-warn"
                : m === "autonomous"
                  ? "is-bold"
                  : m === "observe"
                    ? "is-muted"
                    : "is-safe";
            return (
              <button
                key={m}
                type="button"
                role="menuitemradio"
                aria-checked={selected}
                className={`ai-engineer-security-option ${optionTone}${selected ? " selected" : ""}`}
                onClick={() => {
                  onChange(m);
                  onOpenChange(false);
                }}
              >
                <span className="ai-engineer-security-option-icon" aria-hidden>
                  <ModeIcon mode={m} />
                </span>
                <span className="ai-engineer-security-option-copy">
                  <strong>
                    {t(`aiEngineer.settings.securityModeOption.${m}.label`)}
                  </strong>
                  <span>{t(`aiEngineer.settings.securityModeOption.${m}.desc`)}</span>
                </span>
                {selected ? (
                  <span className="ai-engineer-security-option-check" aria-hidden>
                    <svg viewBox="0 0 16 16" width="14" height="14">
                      <path
                        fill="currentColor"
                        d="M6.5 11.2 3.3 8l1.1-1.1 2.1 2.1 5-5L12.6 5l-6.1 6.2Z"
                      />
                    </svg>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
