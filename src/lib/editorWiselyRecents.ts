import { desktopTargetKey, type DesktopTarget } from "./desktopTarget";

const RECENTS_KEY = "editorwisely.recents.v1";
const RECENTS_LIMIT = 12;

function storageKey(target: DesktopTarget) {
  return `${RECENTS_KEY}:${desktopTargetKey(target)}`;
}

export function readEditorWiselyRecents(target: DesktopTarget): string[] {
  try {
    if (typeof localStorage === "undefined") return [];
    const value: unknown = JSON.parse(localStorage.getItem(storageKey(target)) ?? "[]");
    return Array.isArray(value)
      ? value.filter((path): path is string => typeof path === "string").slice(0, RECENTS_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function rememberEditorWiselyPath(target: DesktopTarget, path: string): string[] {
  const recent = [path, ...readEditorWiselyRecents(target).filter((item) => item !== path)].slice(0, RECENTS_LIMIT);
  try {
    if (typeof localStorage !== "undefined") localStorage.setItem(storageKey(target), JSON.stringify(recent));
  } catch {
    // Recent paths improve navigation but are not required for editing.
  }
  return recent;
}

export function editorWiselyDirectoryForPath(path: string | undefined): string | undefined {
  if (!path) return undefined;
  const separator = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  if (separator < 0) return undefined;
  if (separator === 0) return path.slice(0, 1);
  if (separator === 2 && /^[A-Za-z]:[\\/]/.test(path)) return path.slice(0, 3);
  return path.slice(0, separator);
}
