import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { convertFileSrc } from "@tauri-apps/api/core";

interface PdfPreviewProps {
  path: string;
}

export function PdfPreview({ path }: PdfPreviewProps) {
  const { t } = useTranslation("preview");
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(convertFileSrc(path));
  }, [path]);

  if (!src) {
    return <div className="preview-empty">{t("loadingPdf")}</div>;
  }

  return (
    <iframe
      title="PDF preview"
      className="preview-pdf-frame"
      src={src}
    />
  );
}
