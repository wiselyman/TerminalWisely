import { invoke } from "@tauri-apps/api/core";
import type { ListLocalDirectoryResult, LocalPathSizeResult } from "../types";

export type LocalEntryKind = "file" | "directory";

export function listLocalRoots(): Promise<string[]> {
  return invoke("list_local_roots");
}

export function listLocalDirectory(path?: string | null, showHidden = false): Promise<ListLocalDirectoryResult> {
  return invoke("list_local_directory", { path: path ?? null, showHidden });
}

export function createLocalPath(parent: string, name: string, kind: LocalEntryKind): Promise<string> {
  return invoke("create_local_path", { request: { parent, name, kind } });
}

export function readLocalText(path: string): Promise<string> {
  return invoke("read_local_text", { request: { path } });
}

export function writeLocalText(path: string, content: string): Promise<void> {
  return invoke("write_local_text", { request: { path, content } });
}

export function writeLocalBytes(path: string, content: Uint8Array): Promise<void> {
  let binary = "";
  for (const byte of content) binary += String.fromCharCode(byte);
  return invoke("write_local_bytes", { request: { path, base64: btoa(binary) } });
}

export function renameLocalPath(path: string, newName: string): Promise<string> {
  return invoke("rename_local_path", { request: { path, new_name: newName } });
}

export function moveLocalPath(path: string, destDir: string): Promise<string> {
  return invoke("move_local_path", { request: { path, dest_dir: destDir } });
}

export function deleteLocalPath(path: string): Promise<void> {
  return invoke("delete_local_path", { request: { path } });
}

export function getLocalPathSize(path: string): Promise<LocalPathSizeResult> {
  return invoke("get_local_path_size", { request: { path } });
}

export function openLocalPath(path: string): Promise<void> {
  return invoke("open_local_path", { path });
}

export function revealLocalPath(path: string): Promise<void> {
  return invoke("reveal_local_path", { path });
}

export function parentLocalPath(path: string): string {
  const normalized = path.trim();
  const windows = /^[a-z]:[\\/]|^\\\\/i.test(normalized);
  const sep = windows ? "\\" : "/";
  const value = windows ? normalized.replace(/\//g, "\\") : normalized;
  const trimmed = windows ? value.replace(/\\+$/, "") : value.replace(/\/+$/, "");
  const root = windows && /^[a-z]:\\?$/i.test(value)
    ? `${value.slice(0, 2)}\\`
    : !windows && value.startsWith("/") ? "/" : "";
  if (windows && /^\\\\[^\\]+\\[^\\]+\\?$/.test(value)) return trimmed;
  if (trimmed === root || trimmed === "") return root || sep;
  const index = trimmed.lastIndexOf(sep);
  if (index < 0) return root || sep;
  if (windows && index === 2) return trimmed.slice(0, 3);
  if (!windows && index === 0) return "/";
  return trimmed.slice(0, index) || root || sep;
}

