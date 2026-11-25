import { extensionOfPath, previewKindFromExtension } from "./fileType";

export type FileWiselyView = "editor" | "markdown" | "preview" | "unsupported";

/** Selects the existing desktop content surface for a path without duplicating file-type rules. */
export function fileWiselyViewForPath(path: string): FileWiselyView {
  const kind = previewKindFromExtension(extensionOfPath(path));
  if (kind === "markdown") return "markdown";
  if (kind === "text" || kind === "html" || kind === "csv") return "editor";
  if (kind === "unsupported") return "unsupported";
  return "preview";
}
