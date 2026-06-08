import { useEffect, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";

interface PdfPreviewProps {
  path: string;
}

export function PdfPreview({ path }: PdfPreviewProps) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(convertFileSrc(path));
  }, [path]);

  if (!src) {
    return <div className="preview-empty">加载 PDF 中…</div>;
  }

  return (
    <iframe
      title="PDF preview"
      className="preview-pdf-frame"
      src={src}
    />
  );
}
