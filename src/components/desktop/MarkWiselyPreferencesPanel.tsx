import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { EDITOR_THEME_OPTIONS, type EditorPreferences } from "../../lib/markdownEditor/preferences";

type Props = {
  preferences: EditorPreferences;
  onUpdate: (patch: Partial<Omit<EditorPreferences, "version">>) => void;
};

export function MarkWiselyPreferencesPanel({ preferences, onUpdate }: Props) {
  const { t } = useTranslation("tools");
  const [customCss, setCustomCss] = useState(preferences.customCss);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setCustomCss(preferences.customCss), [preferences.customCss]);

  const applyCustomCss = () => {
    try {
      onUpdate({ customCss });
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  };

  return (
    <section className="markwisely-preferences-panel" aria-label={t("markwisely.preferencesTitle")} data-testid="markwisely-preferences-panel">
      <label className="markwisely-preferences-field">
        <span>{t("markwisely.themeLabel")}</span>
        <select value={preferences.theme} onChange={(event) => onUpdate({ theme: event.target.value as EditorPreferences["theme"] })} aria-label={t("markwisely.themeLabel")} data-testid="markwisely-theme-select">
          {EDITOR_THEME_OPTIONS.map((theme) => <option key={theme.id} value={theme.id}>{t(theme.labelKey)}</option>)}
        </select>
      </label>
      <label className="markwisely-preferences-check">
        <input type="checkbox" checked={preferences.focusMode} onChange={(event) => onUpdate({ focusMode: event.target.checked })} data-testid="markwisely-focus-mode" />
        <span>{t("markwisely.focusMode")}</span>
      </label>
      <label className="markwisely-preferences-check">
        <input type="checkbox" checked={preferences.typewriterMode} onChange={(event) => onUpdate({ typewriterMode: event.target.checked })} data-testid="markwisely-typewriter-mode" />
        <span>{t("markwisely.typewriterMode")}</span>
      </label>
      <label className="markwisely-preferences-check">
        <input type="checkbox" checked={preferences.spellcheck} onChange={(event) => onUpdate({ spellcheck: event.target.checked })} data-testid="markwisely-spellcheck" />
        <span>{t("markwisely.spellcheck")}</span>
      </label>
      <label className="markwisely-preferences-css-label" htmlFor="markwisely-custom-css">{t("markwisely.customCss")}</label>
      <textarea id="markwisely-custom-css" value={customCss} onChange={(event) => setCustomCss(event.target.value)} placeholder={t("markwisely.customCssPlaceholder")} data-testid="markwisely-custom-css" />
      <button type="button" className="markwisely-preferences-apply" onClick={applyCustomCss} data-testid="markwisely-apply-css">{t("markwisely.applyCustomCss")}</button>
      {error ? <div role="alert" className="markwisely-preferences-error">{error}</div> : null}
    </section>
  );
}
