import { useCallback, useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, FileText, Folder } from "lucide-react";
import { listLocalDirectory, listLocalRoots } from "../../lib/localFsApi";
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
        const initialPath = target.kind === "local" ? (await listLocalRoots())[0] ?? null : remoteHome;
        const result = await listDirectory(initialPath);
        if (cancelled) return;
        setRootPath(result.path);
        setEntriesByPath({ [result.path]: sortEntries(result.entries) });
        setError(null);
      } catch (reason) {
        if (!cancelled) setError(reason instanceof Error ? reason.message : String(reason));
      }
    };
    void initialize();
    return () => { cancelled = true; };
  }, [listDirectory, target]);

  const toggleDirectory = async (entry: LocalFsEntry) => {
    if (expanded.includes(entry.path)) {
      setExpanded((current) => current.filter((path) => path !== entry.path));
      return;
    }
    setExpanded((current) => [...current, entry.path]);
    if (entriesByPath[entry.path]) return;
    setLoading((current) => [...current, entry.path]);
    try {
      const result = await listDirectory(entry.path);
      setEntriesByPath((current) => ({ ...current, [result.path]: sortEntries(result.entries) }));
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

function sortEntries(entries: LocalFsEntry[]) {
  return [...entries].filter((entry) => entry.kind === "directory" || entry.kind === "file")
    .sort((a, b) => a.kind === b.kind
      ? a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true })
      : a.kind === "directory" ? -1 : 1);
}
