export type PreviewMarkdownMode = "source" | "wysiwyg";
export type PreviewViewMode = "source" | "preview" | "wysiwyg";

export function normalizeMarkdownMode(
  mode: string | null | undefined,
): PreviewMarkdownMode {
  if (mode === "source") return "source";
  if (mode === "wysiwyg" || mode === "preview") return "wysiwyg";
  return "wysiwyg";
}

export function markdownModeFromViewMode(
  mode: PreviewViewMode,
): PreviewMarkdownMode {
  return normalizeMarkdownMode(mode);
}

export function viewModeForMarkdownToggle(
  target: PreviewMarkdownMode,
): PreviewViewMode {
  return target;
}
