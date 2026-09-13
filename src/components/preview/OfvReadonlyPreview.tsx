import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { convertFileSrc } from "@tauri-apps/api/core";
import { FileViewer } from "@open-file-viewer/react";
import {
  archivePlugin,
  audioPlugin,
  imagePlugin,
  officePlugin,
  pdfPlugin,
  videoPlugin,
} from "@open-file-viewer/core";
import "@open-file-viewer/core/style.css";
import pdfWorkerSrc from "pdfjs-dist/build/pdf.worker.mjs?url";
import {
  createOfvPdfjsModule,
  pdfjsAssetBase,
  pdfjsCmapUrl,
  pdfjsStandardFontUrl,
} from "../../lib/pdfjsOfv";
import {
  getAppTheme,
  subscribeAppTheme,
  type AppTheme,
} from "../../lib/appTheme";

function buildOfvPlugins() {
  const assetBase = pdfjsAssetBase();
  return [
    imagePlugin(),
    pdfPlugin({
      pdfjs: createOfvPdfjsModule(assetBase) as never,
      workerSrc: pdfWorkerSrc,
      cMapUrl: pdfjsCmapUrl(assetBase),
      cMapPacked: true,
      standardFontDataUrl: pdfjsStandardFontUrl(assetBase),
      // Load full bytes first — asset:// range requests are unreliable in Tauri.
      useFetchData: true,
    }),
    officePlugin(),
    archivePlugin(),
    videoPlugin(),
    audioPlugin(),
  ];
}

interface OfvReadonlyPreviewProps {
  path: string;
  fileName: string;
}

export function OfvReadonlyPreview({ path, fileName }: OfvReadonlyPreviewProps) {
  const { t } = useTranslation("preview");
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<AppTheme>(() => getAppTheme());
  const plugins = useMemo(() => buildOfvPlugins(), []);

  useEffect(() => subscribeAppTheme(setTheme), []);

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

  const toolbar = useMemo(
    () => ({
      zoom: true,
      rotate: true,
      download: false,
      fullscreen: true,
      print: false,
      search: false,
    }),
    [],
  );

  if (error) {
    return <div className="preview-empty">{error}</div>;
  }

  if (!src) {
    return <div className="preview-empty">{t("loadingPreview")}</div>;
  }

  return (
    <div className="preview-ofv-wrap" data-testid="preview-ofv">
      <FileViewer
        file={src}
        fileName={fileName}
        width="100%"
        height="100%"
        fit="contain"
        theme={theme}
        toolbar={toolbar}
        plugins={plugins}
        onError={(err) => setError(err.message)}
      />
    </div>
  );
}
