import { useMemo } from "react";
import { marked } from "marked";

marked.setOptions({
  gfm: true,
  breaks: true,
});

type Props = {
  content: string;
  className?: string;
};

/** Lightweight markdown render for AI chat bubbles (reuses app `marked`). */
export function AiMarkdown({ content, className }: Props) {
  const html = useMemo(() => {
    try {
      return marked.parse(content || "", { async: false }) as string;
    } catch {
      return "";
    }
  }, [content]);

  if (!content.trim()) return null;

  return (
    <div
      className={`ai-engineer-md${className ? ` ${className}` : ""}`}
      dangerouslySetInnerHTML={{ __html: html || `<p>${escapeHtml(content)}</p>` }}
    />
  );
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
