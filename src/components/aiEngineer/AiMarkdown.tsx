import { useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import { marked } from "marked";
import {
  cacheRemoteMedia,
  looksLikeImageUrl,
  mediaDisplaySrc,
  parseMediaRef,
  resolveMediaId,
} from "../../lib/aiEngineer/chatMedia";
import { isHttpUrl, openExternalUrl } from "../../lib/aiEngineer/openExternalUrl";
import { getAppTheme } from "../../lib/appTheme";

marked.setOptions({
  gfm: true,
  breaks: true,
});

type Props = {
  content: string;
  className?: string;
  onImageClick?: (src: string, alt?: string) => void;
};

function placeholderSvgDataUri(): string {
  const theme = getAppTheme();
  const bg = theme === "light" ? "#f6f8fa" : "#161b22";
  const fg = theme === "light" ? "#656d76" : "#8b949e";
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">` +
        `<rect fill="${bg}" width="100%" height="100%"/>` +
        `<text x="50%" y="50%" fill="${fg}" font-size="14" text-anchor="middle" dy=".3em">image</text>` +
        `</svg>`,
    )
  );
}

/** Lightweight markdown render for AI chat bubbles (reuses app `marked`). */
export function AiMarkdown({ content, className, onImageClick }: Props) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [html, setHtml] = useState("");

  const initialHtml = useMemo(() => {
    try {
      return marked.parse(content || "", { async: false }) as string;
    } catch {
      return "";
    }
  }, [content]);

  useEffect(() => {
    let cancelled = false;
    setHtml(initialHtml);
    void (async () => {
      const rewritten = await rewriteRemoteImages(initialHtml);
      if (!cancelled) setHtml(rewritten);
    })();
    return () => {
      cancelled = true;
    };
  }, [initialHtml]);

  if (!content.trim()) return null;

  const onClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement | null;
    if (!target) return;

    const img = target.closest("img");
    if (img && rootRef.current?.contains(img)) {
      const src = img.getAttribute("src") || "";
      if (src && !src.startsWith("data:image/svg+xml") && onImageClick) {
        event.preventDefault();
        event.stopPropagation();
        onImageClick(src, img.getAttribute("alt") || undefined);
        return;
      }
      // Failed remote: open original in browser if we kept it.
      const remote = img.getAttribute("data-remote-src") || "";
      if (img.classList.contains("ai-engineer-md-img-failed") && isHttpUrl(remote)) {
        event.preventDefault();
        event.stopPropagation();
        void openExternalUrl(remote).catch(() => undefined);
        return;
      }
    }

    const anchor = target.closest("a");
    if (!anchor || !rootRef.current?.contains(anchor)) return;
    const href = anchor.getAttribute("href") || "";
    if (!isHttpUrl(href)) return;
    event.preventDefault();
    event.stopPropagation();
    void openExternalUrl(href).catch(() => {
      // Swallow — toast is optional; broken opener must not navigate WebView.
    });
  };

  return (
    <div
      ref={rootRef}
      className={`ai-engineer-md${className ? ` ${className}` : ""}`}
      data-testid="ai-markdown"
      onClick={onClick}
      dangerouslySetInnerHTML={{
        __html: decorateAnchors(html || `<p>${escapeHtml(content)}</p>`),
      }}
    />
  );
}

function decorateAnchors(raw: string): string {
  return raw.replace(/<a\s+([^>]*?)href=/gi, (full, attrs: string) => {
    if (/\bdata-testid=/.test(attrs)) return full;
    return `<a data-testid="ai-md-external-link" ${attrs}href=`;
  });
}

async function rewriteRemoteImages(rawHtml: string): Promise<string> {
  if (!rawHtml.includes("<img")) return rawHtml;
  const doc = new DOMParser().parseFromString(
    `<div id="root">${rawHtml}</div>`,
    "text/html",
  );
  const root = doc.getElementById("root");
  if (!root) return rawHtml;
  const imgs = Array.from(root.querySelectorAll("img"));
  await Promise.all(
    imgs.map(async (img) => {
      const src = img.getAttribute("src") || "";
      if (!src || src.startsWith("data:")) return;
      const mediaRef = parseMediaRef(src);
      img.setAttribute("data-testid", "ai-md-image");
      img.classList.add("ai-engineer-md-img");
      try {
        if (mediaRef) {
          const cached = await resolveMediaId(mediaRef);
          const display = mediaDisplaySrc(cached);
          img.setAttribute("src", display);
          img.setAttribute("data-media-id", cached.media_id);
          img.setAttribute("data-local-path", cached.path);
          return;
        }
        if (!isHttpUrl(src)) return;
        img.setAttribute("data-remote-src", src);
        // Avoid flashing a broken hotlink while caching.
        img.setAttribute("src", placeholderSvgDataUri());
        if (!looksLikeImageUrl(src) && !src.includes("image")) {
          // Still try cache — many CDNs omit extensions.
        }
        const cached = await cacheRemoteMedia(src);
        const display = mediaDisplaySrc(cached);
        img.setAttribute("src", display);
        img.setAttribute("data-media-id", cached.media_id);
        img.setAttribute("data-local-path", cached.path);
      } catch {
        const remote = img.getAttribute("data-remote-src") || src;
        img.setAttribute("data-remote-src", remote);
        img.setAttribute("src", placeholderSvgDataUri());
        img.setAttribute("alt", img.getAttribute("alt") || "image unavailable");
        img.classList.add("ai-engineer-md-img-failed");
        img.setAttribute("title", "Click to open original in browser");
      }
    }),
  );
  return root.innerHTML;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
