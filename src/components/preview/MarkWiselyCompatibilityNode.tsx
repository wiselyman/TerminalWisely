import { useTranslation } from "react-i18next";
import type { MarkdownCompatibilityKind } from "../../lib/markdownSourceRoundTrip";

interface MarkWiselyCompatibilityNodeProps {
  kind: MarkdownCompatibilityKind;
  source: string;
  onChange: (source: string) => void;
  onApply: () => void;
  onCancel: () => void;
}

export function MarkWiselyCompatibilityNode({ kind, source, onChange, onApply, onCancel }: MarkWiselyCompatibilityNodeProps) {
  const { t } = useTranslation("preview");
  return (
    <div className="markwisely-compatibility-editor-backdrop" role="presentation">
      <section className="markwisely-compatibility-editor" role="dialog" aria-modal="true" aria-labelledby="markwisely-compatibility-title">
        <h2 id="markwisely-compatibility-title">{t("wysiwygCompatibilityEditTitle")}</h2>
        <p>{t("wysiwygCompatibilityEditHint", { kind })}</p>
        <textarea
          data-testid="markwisely-compatibility-node-source"
          aria-label={t("wysiwygCompatibilitySource")}
          value={source}
          onChange={(event) => onChange(event.currentTarget.value)}
        />
        <div className="markwisely-compatibility-editor-actions">
          <button type="button" onClick={onCancel}>{t("wysiwygCompatibilityCancel")}</button>
          <button type="button" data-testid="markwisely-compatibility-apply" onClick={onApply}>{t("wysiwygCompatibilityApply")}</button>
        </div>
      </section>
    </div>
  );
}
