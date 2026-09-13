import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { convertFileSrc } from "@tauri-apps/api/core";

interface NativePdfPreviewProps {
  path: string;
  fileName: string;
}

/**
 * Use the WebView's built-in PDF engine (PDFKit on macOS / Edge PDF on Win).
 * More reliable than pdf.js for large CJK / compressed documents in Tauri.
 */
export function NativePdfPreview({ path, fileName }: NativePdfPreviewProps) {
  const { t } = useTranslation("preview");
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setSrc(null);
    setError(null);
    try {
      const next = convertFileSrc(path);
      if (!disposed) setSrc(next);
    } catch (err) {
      if (!disposed) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    return () => {
      disposed = true;
    };
  }, [path]);

  if (error) {
    return <div className="preview-empty">{error}</div>;
  }

  if (!src) {
    return <div className="preview-empty">{t("loadingPreview")}</div>;
  }

  return (
    <iframe
      className="preview-native-pdf"
      src={src}
      title={fileName}
      data-testid="preview-native-pdf"
    />
  );
}
