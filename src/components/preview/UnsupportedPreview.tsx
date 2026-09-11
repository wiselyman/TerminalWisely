import { useTranslation } from "react-i18next";

interface UnsupportedPreviewProps {
  filename: string;
  totalSize: number;
  onOpenExternal?: () => void;
}

export function UnsupportedPreview({
  filename,
  totalSize,
  onOpenExternal,
}: UnsupportedPreviewProps) {
  const { t } = useTranslation("preview");
  return (
    <div className="preview-empty">
      <p>{t("unsupportedHint")}</p>
      <p className="preview-empty-meta">{filename}</p>
      {onOpenExternal ? (
        <button type="button" className="preview-action-btn" onClick={onOpenExternal}>
          {t("openExternal")}
        </button>
      ) : null}
      <p className="preview-empty-meta">{t("sizeLine", { size: formatBytes(totalSize) })}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
