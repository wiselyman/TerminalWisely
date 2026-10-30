export type MarkWiselyExportExtension = "html" | "pdf" | "docx";

export function normalizeMarkWiselyExportPath(
  path: string,
  extension: MarkWiselyExportExtension,
): string {
  const separatorIndex = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  const directory = path.slice(0, separatorIndex + 1);
  const fileName = path.slice(separatorIndex + 1);
  const extensionIndex = fileName.lastIndexOf(".");
  const stem = extensionIndex > 0 ? fileName.slice(0, extensionIndex) : fileName;

  return `${directory}${stem}.${extension}`;
}
