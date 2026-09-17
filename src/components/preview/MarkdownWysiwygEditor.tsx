import { useEffect, useRef, useState } from "react";
import Vditor from "vditor";
import "vditor/dist/index.css";
import { useTranslation } from "react-i18next";
import { getAppTheme, subscribeAppTheme, type AppTheme } from "../../lib/appTheme";
import {
  registerPreviewEditorFlush,
  unregisterPreviewEditorFlush,
} from "../../lib/previewEditorFlush";
import {
  parentRemoteDir,
  resolveMarkdownImageSrc,
} from "../../lib/markdownImagePath";
import {
  readPreviewRemoteBytes,
  suggestPasteImageName,
  writePreviewRemoteBytes,
} from "../../lib/previewRemoteBytes";
import i18n from "../../i18n";

export interface MarkdownWysiwygEditorProps {
  tabId: string;
  sessionId: string;
  filePath: string;
  text: string;
  editable: boolean;
  onChange?: (value: string) => void;
}

/** Self-hosted assets copied to public/vditor by vite.vditor.ts */
const VDITOR_CDN = "/vditor";

function vditorLang(): "zh_CN" | "en_US" {
  return i18n.language?.toLowerCase().startsWith("zh") ? "zh_CN" : "en_US";
}

function themeFromApp(theme: AppTheme): "dark" | "classic" {
  return theme === "dark" ? "dark" : "classic";
}

async function hydrateRemoteImages(
  root: HTMLElement,
  sessionId: string,
  filePath: string,
  blobUrls: string[],
): Promise<void> {
  const imgs = root.querySelectorAll<HTMLImageElement>("img[src]");
  for (const img of imgs) {
    if (img.dataset.twHydrated === "1") continue;
    const src = img.getAttribute("src") ?? "";
    if (!src || /^(https?:|data:|blob:|\/\/)/i.test(src)) {
      img.dataset.twHydrated = "1";
      continue;
    }
    const remote = resolveMarkdownImageSrc(filePath, src);
    if (!remote) {
      img.dataset.twHydrated = "1";
      continue;
    }
    try {
      const { bytes, mime } = await readPreviewRemoteBytes(sessionId, remote);
      const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
      blobUrls.push(url);
      img.src = url;
      img.dataset.twHydrated = "1";
    } catch {
      img.classList.add("preview-md-img-failed");
      img.dataset.twHydrated = "1";
    }
  }
}

export function MarkdownWysiwygEditor({
  tabId,
  sessionId,
  filePath,
  text,
  editable,
  onChange,
}: MarkdownWysiwygEditorProps) {
  const { t } = useTranslation("preview");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const vditorRef = useRef<Vditor | null>(null);
  const blobUrlsRef = useRef<string[]>([]);
  const textRef = useRef(text);
  const onChangeRef = useRef(onChange);
  const [initError, setInitError] = useState<string | null>(null);
  textRef.current = text;
  onChangeRef.current = onChange;

  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    let cancelled = false;
    let observer: MutationObserver | null = null;
    setInitError(null);

    const appTheme = getAppTheme();
    const scheduleHydrate = () => {
      const root = el.querySelector(".vditor-ir") ?? el;
      void hydrateRemoteImages(
        root as HTMLElement,
        sessionId,
        filePath,
        blobUrlsRef.current,
      );
    };

    try {
      const vditor = new Vditor(el, {
        cdn: VDITOR_CDN,
        mode: "ir",
        height: "100%",
        width: "100%",
        theme: themeFromApp(appTheme),
        lang: vditorLang(),
        value: textRef.current,
        cache: { enable: false },
        toolbarConfig: { pin: true },
        preview: {
          math: { engine: "KaTeX", inlineDigit: true },
          markdown: {
            footnotes: true,
            mark: true,
            codeBlockPreview: true,
            mathBlockPreview: true,
          },
          theme:
            appTheme === "dark"
              ? { current: "dark" }
              : { current: "light" },
        },
        toolbar: [
          "headings",
          "bold",
          "italic",
          "strike",
          "|",
          "list",
          "ordered-list",
          "check",
          "outdent",
          "indent",
          "|",
          "quote",
          "line",
          "code",
          "inline-code",
          "insert-before",
          "insert-after",
          "|",
          "table",
          "link",
          "upload",
          "|",
          "undo",
          "redo",
          "fullscreen",
        ],
        upload: {
          accept: "image/*",
          multiple: true,
          handler: (files: File[]) => {
            void (async () => {
              const dir = parentRemoteDir(filePath);
              for (const file of files) {
                const name = suggestPasteImageName(file.name, Date.now());
                const remote =
                  dir === "/" ? `/${name}` : dir === "." ? name : `${dir}/${name}`;
                const buf = new Uint8Array(await file.arrayBuffer());
                await writePreviewRemoteBytes(sessionId, remote, buf);
                const rel = name;
                vditorRef.current?.insertValue(`![${name}](${rel})\n`);
              }
              onChangeRef.current?.(vditorRef.current?.getValue() ?? "");
              scheduleHydrate();
            })().catch((err) => {
              const msg = err instanceof Error ? err.message : String(err);
              vditorRef.current?.tip(msg, 3000);
            });
            return null;
          },
        },
        after: () => {
          if (cancelled) return;
          if (!editable) vditor.disabled();
          scheduleHydrate();
          observer = new MutationObserver(() => scheduleHydrate());
          observer.observe(el, { childList: true, subtree: true });
        },
        input: (value: string) => {
          onChangeRef.current?.(value);
        },
        blur: (value: string) => {
          onChangeRef.current?.(value);
        },
      });
      vditorRef.current = vditor;
      registerPreviewEditorFlush(tabId, () => vditor.getValue());
    } catch (err) {
      setInitError(err instanceof Error ? err.message : String(err));
    }

    const unsubTheme = subscribeAppTheme((theme) => {
      const v = vditorRef.current;
      if (!v) return;
      const vdTheme = themeFromApp(theme);
      v.setTheme(
        vdTheme,
        theme === "dark" ? "dark" : "light",
        theme === "dark" ? "native" : "github",
      );
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      unsubTheme();
      unregisterPreviewEditorFlush(tabId);
      try {
        vditorRef.current?.destroy();
      } catch {
        /* ignore */
      }
      vditorRef.current = null;
      for (const url of blobUrlsRef.current) URL.revokeObjectURL(url);
      blobUrlsRef.current = [];
    };
    // Re-create when tab/file/session identity changes — not on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional
  }, [tabId, sessionId, filePath]);

  useEffect(() => {
    const v = vditorRef.current;
    if (!v) return;
    try {
      if (editable) v.enable();
      else v.disabled();
    } catch {
      /* ignore */
    }
  }, [editable]);

  useEffect(() => {
    const v = vditorRef.current;
    if (!v) return;
    let current = "";
    try {
      current = v.getValue();
    } catch {
      return;
    }
    if (text !== current) {
      v.setValue(text);
    }
  }, [text]);

  if (initError) {
    return (
      <div className="preview-markdown-wysiwyg-error" role="alert">
        {t("wysiwygInitFailed")}
        <div className="preview-markdown-wysiwyg-error-detail">{initError}</div>
      </div>
    );
  }

  return (
    <div
      className="preview-markdown-wysiwyg"
      data-testid="preview-markdown-wysiwyg"
    >
      <div ref={hostRef} className="preview-markdown-wysiwyg-host" />
    </div>
  );
}
