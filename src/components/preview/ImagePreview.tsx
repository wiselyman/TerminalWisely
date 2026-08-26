import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { convertFileSrc } from "@tauri-apps/api/core";

interface ImagePreviewProps {
  path: string;
}

export function ImagePreview({ path }: ImagePreviewProps) {
  const { t } = useTranslation("preview");
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let disposed = false;
    setError(null);
    try {
      const next = convertFileSrc(path);
      if (!disposed) setSrc(next);
    } catch (err) {
      if (!disposed) setError(String(err));
    }
    return () => {
      disposed = true;
    };
  }, [path]);

  if (error) {
    return <div className="preview-empty">{error}</div>;
  }

  if (!src) {
    return <div className="preview-empty">{t("loadingImage")}</div>;
  }

  return (
    <div className="preview-image-wrap">
      <img src={src} alt="" className="preview-image" />
    </div>
  );
}
