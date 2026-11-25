import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { listLocalDirectory, listLocalRoots, parentLocalPath } from "../../lib/localFsApi";
import type { DesktopTarget } from "../../lib/desktopTarget";
import type { ListLocalDirectoryResult, LocalFsEntry } from "../../types";
import { useSessionStore } from "../../stores/sessionStore";

type Props = { target: DesktopTarget; activePath: string | null; onOpen: (path: string) => void };

export function EditorWiselyTree({ target, activePath, onOpen }: Props) {
  const { t } = useTranslation("tools");
  const [rootPath, setRootPath] = useState<string | null>(null);
  const [entriesByPath, setEntriesByPath] = useState<Record<string, LocalFsEntry[]>>({});
  const [expanded, setExpanded] = useState<string[]>([]);
  const [loading, setLoading] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const entriesByPathRef = useRef<Record<string, LocalFsEntry[]>>({});

  const listDirectory = useCallback(async (path: string | null): Promise<ListLocalDirectoryResult> => {
    if (target.kind === "local") return listLocalDirectory(path, false);
    return invoke<ListLocalDirectoryResult>("list_remote_directory", {
      request: { session_id: target.sessionId, path, show_hidden: false },
    });
  }, [target]);

  useEffect(() => {
    let cancelled = false;
    const initialize = async () => {
      try {
        const remoteHome = target.kind === "ssh"
          ? useSessionStore.getState().tabs.find((tab) => tab.id === target.sessionId)?.remote_home ?? null
          : null;
        const roots = target.kind === "local" ? await listLocalRoots() : [remoteHome ?? "/", "/"];
        const initialPath = chooseTreeRoot(roots, activePath) ?? remoteHome;
        entriesByPathRef.current = {};
        setEntriesByPath({});
        setExpanded([]);
        setRootPath(null);
        const result = await listDirectory(initialPath);
        if (cancelled) return;
        setRootPath(result.path);
        const rootEntries = sortEntries(result.entries);
        entriesByPathRef.current = { [result.path]: rootEntries };
        setEntriesByPath(entriesByPathRef.current);
        setError(null);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, [activePath, listDirectory, target]);

  useEffect(() => {
    if (!rootPath || !activePath) return;
    const directoryNames = directoryNamesBetween(rootPath, activePath);
    if (!directoryNames) return;
    let cancelled = false;
    const expandActivePath = async () => {
      let currentEntries = entriesByPathRef.current[rootPath] ?? [];
      for (const name of directoryNames) {
        if (cancelled) return;
        const directory = currentEntries.find((entry) => entry.kind === "directory" && entry.name === name);
        if (!directory) return;
        setExpanded((current) => current.includes(directory.path) ? current : [...current, directory.path]);
        let children = entriesByPathRef.current[directory.path];
        if (!children) {
          setLoading((current) => current.includes(directory.path) ? current : [...current, directory.path]);
          try {
            const result = await listDirectory(directory.path);
            if (cancelled) return;
            children = sortEntries(result.entries);
            entriesByPathRef.current = { ...entriesByPathRef.current, [result.path]: children };
            setEntriesByPath(entriesByPathRef.current);
            setError(null);
          } catch (reason) {
            if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
            return;
          } finally {
            setLoading((current) => current.filter((path) => path !== directory.path));
          }
        }
        currentEntries = children;
      }
    };
    void expandActivePath();
    return () => { cancelled = true; };
  }, [activePath, listDirectory, rootPath]);

  const toggleDirectory = async (entry: LocalFsEntry) => {
    if (expanded.includes(entry.path)) {
      setExpanded((current) => current.filter((path) => path !== entry.path));
      return;
    }
    setExpanded((current) => [...current, entry.path]);
    if (entriesByPathRef.current[entry.path]) return;
    setLoading((current) => [...current, entry.path]);
    try {
      const result = await listDirectory(entry.path);
      const children = sortEntries(result.entries);
      entriesByPathRef.current = { ...entriesByPathRef.current, [result.path]: children };
      setEntriesByPath(entriesByPathRef.current);
      setError(null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setLoading((current) => current.filter((path) => path !== entry.path));
    }
  };

  const renderEntries = (path: string, depth: number) => (entriesByPath[path] ?? []).map((entry) => {
    const isDirectory = entry.kind === "directory";
    const isExpanded = expanded.includes(entry.path);
    return <div className="editorwisely-tree-item" key={entry.path}>
      <button
        type="button"
        className={`editorwisely-tree-row${entry.path === activePath ? " is-active" : ""}`}
        style={{ paddingLeft: `${8 + depth * 14}px` }}
        title={entry.path}
        aria-expanded={isDirectory ? isExpanded : undefined}
        data-testid={isDirectory ? "editorwisely-tree-directory" : "editorwisely-tree-file"}
        onClick={() => isDirectory ? void toggleDirectory(entry) : onOpen(entry.path)}
      >
        {isDirectory ? isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} /> : <FileText size={14} />}
        {isDirectory ? <Folder size={14} /> : null}
        <span>{entry.name}</span>
      </button>
      {isDirectory && isExpanded ? loading.includes(entry.path)
        ? <div className="editorwisely-tree-message" style={{ paddingLeft: `${28 + depth * 14}px` }} role="status">{t("editor.loading")}</div>
        : renderEntries(entry.path, depth + 1)
        : null}
    </div>;
  });

  return <aside className="editorwisely-tree" data-testid="editorwisely-tree" aria-label={t("editor.treeTitle")}>
    <header className="editorwisely-tree-head"><span>{t("editor.treeTitle")}</span>{rootPath ? <small title={rootPath}>{rootPath}</small> : null}</header>
    {error ? <div className="editorwisely-tree-message" role="alert">{error}</div> : null}
    {!rootPath && !error ? <div className="editorwisely-tree-message" role="status">{t("editor.loading")}</div> : null}
    {rootPath ? <div className="editorwisely-tree-list">{renderEntries(rootPath, 0)}</div> : null}
  </aside>;
}

function chooseTreeRoot(roots: string[], activePath: string | null): string | null {
  if (!roots.length) return null;
  if (!activePath) return roots[0];
  const matchingRoots = roots.filter((root) => isSameOrDescendantPath(activePath, root));
  if (matchingRoots.length) return matchingRoots.sort((left, right) => right.length - left.length)[0];
  return parentLocalPath(activePath);
}

function directoryNamesBetween(rootPath: string, filePath: string): string[] | null {
  if (!isSameOrDescendantPath(filePath, rootPath)) return null;
  const rootParts = normalizedPathParts(rootPath);
  const fileParts = normalizedPathParts(filePath);
  if (rootParts.length >= fileParts.length) return null;
  return fileParts.slice(rootParts.length, -1);
}

function isSameOrDescendantPath(path: string, root: string): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(root);
  if (normalizedPath === normalizedRoot) return true;
  const prefix = normalizedRoot.endsWith("/") ? normalizedRoot : `${normalizedRoot}/`;
  return normalizedPath.startsWith(prefix);
}

function normalizedPathParts(path: string): string[] {
  return normalizePath(path).split("/").filter(Boolean);
}

function normalizePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const keepDriveRoot = /^[a-z]:\/$/i.test(normalized);
  const trimmed = normalized.length > 1 && !keepDriveRoot ? normalized.replace(/\/+$/, "") : normalized;
  return /^[a-z]:/i.test(trimmed) ? trimmed.toLowerCase() : trimmed;
}

function sortEntries(entries: LocalFsEntry[]) {
  return [...entries].filter((entry) => entry.kind === "directory" || entry.kind === "file")
    .sort((a, b) => a.kind === b.kind
      ? a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
      : a.kind === "directory" ? -1 : 1);
}
