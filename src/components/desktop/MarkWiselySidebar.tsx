import { useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronLeft, FileText, Folder, FolderOpen, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ListLocalDirectoryResult, LocalFsEntry } from "../../types";
import type { DesktopTarget } from "../../lib/desktopTarget";
import { listLocalDirectory, parentLocalPath, readLocalText } from "../../lib/localFsApi";
import { fuzzyMatchesMarkdownPath, isDirectMarkdownWorkspaceChild, searchMarkdownWorkspace, type MarkdownWorkspaceProvider, type MarkdownWorkspaceSearchProgress, type MarkdownWorkspaceSearchResult } from "../../lib/markWiselyWorkspace";
import "./MarkWiselySidebar.css";

type Props = {
  target: DesktopTarget;
  sessionId?: string;
  root: string;
  recents: Array<{ path: string; lastOpened: number }>;
  onChooseRoot: () => void;
  onOpen: (path: string) => void;
};

export function MarkWiselySidebar({ target, sessionId, root, recents, onChooseRoot, onOpen }: Props) {
  const { t } = useTranslation("tools");
  const [directory, setDirectory] = useState(root);
  const [entries, setEntries] = useState<LocalFsEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [quickFilter, setQuickFilter] = useState("");
  const [query, setQuery] = useState("");
  const [searchActive, setSearchActive] = useState(false);
  const [searchProgress, setSearchProgress] = useState<MarkdownWorkspaceSearchProgress | null>(null);
  const [searchResults, setSearchResults] = useState<MarkdownWorkspaceSearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchController = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    setDirectory(root);
    setQuickFilter("");
    setQuery("");
    setSearchResults([]);
  }, [root]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      searchController.current?.abort();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setListError(null);
    const listing = target.kind === "local"
      ? listLocalDirectory(directory, false)
      : sessionId
        ? invoke<ListLocalDirectoryResult>("list_remote_directory", { request: { session_id: sessionId, path: directory, show_hidden: false } })
        : Promise.reject(new Error("SSH session is required."));
    void listing.then((result) => {
      if (!cancelled) setEntries(result.entries);
    }).catch((error) => {
      if (!cancelled) setListError(error instanceof Error ? error.message : String(error));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [directory, sessionId, target]);

  const provider = useMemo<MarkdownWorkspaceProvider>(() => ({
    listDirectory: async (path) => {
      if (target.kind === "local") return listLocalDirectory(path, false);
      if (!sessionId) throw new Error("SSH session is required.");
      return invoke<ListLocalDirectoryResult>("list_remote_directory", { request: { session_id: sessionId, path, show_hidden: false } });
    },
    readMarkdown: async (path) => {
      if (target.kind === "local") return readLocalText(path);
      if (!sessionId) throw new Error("SSH session is required.");
      const result = await invoke<{ handle_id: string; text_content?: string | null }>("preview_open", { request: { session_id: sessionId, path, sudo_password: null } });
      try {
        return result.text_content ?? "";
      } finally {
        await invoke("preview_close", { request: { handle_id: result.handle_id } }).catch(() => undefined);
      }
    },
  }), [sessionId, target]);

  const visibleEntries = entries
    .filter((entry) => isDirectMarkdownWorkspaceChild(directory, entry.path))
    .filter((entry) => entry.kind === "directory" || (entry.kind === "file" && /\.(md|markdown)$/i.test(entry.name)))
    .filter((entry) => !entry.name.startsWith("."))
    .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, undefined, { sensitivity: "base", numeric: true }) : a.kind === "directory" ? -1 : 1));
  const filteredEntries = visibleEntries.filter((entry) => fuzzyMatchesMarkdownPath(quickFilter, entry.name));
  const visibleRecents = recents.filter((recent) => fuzzyMatchesMarkdownPath(quickFilter, recent.path)).slice(0, 6);
  const runSearch = async () => {
    if (!query.trim() || searchActive) return;
    const controller = new AbortController();
    searchController.current = controller;
    setSearchActive(true);
    setSearchProgress({ phase: "listing", completed: 0, total: null });
    setSearchResults([]);
    setSearchError(null);
    try {
      const result = await searchMarkdownWorkspace(provider, root, query, controller.signal, setSearchProgress);
      if (!controller.signal.aborted && mounted.current) setSearchResults(result.results);
    } catch (error) {
      if (mounted.current && !(error instanceof Error && error.name === "AbortError")) setSearchError(error instanceof Error ? error.message : String(error));
    } finally {
      if (searchController.current === controller) searchController.current = null;
      if (mounted.current) {
        setSearchActive(false);
        setSearchProgress(null);
      }
    }
  };

  const cancelSearch = () => searchController.current?.abort();
  const parent = parentLocalPath(directory);
  const atRoot = directory.replace(/[\\/]+$/, "") === root.replace(/[\\/]+$/, "");

  return (
    <aside className="markwisely-sidebar" aria-label={t("markwisely.workspaceSidebar")} data-testid="markwisely-sidebar">
      <div className="markwisely-sidebar-section-head">
        <span>{t("markwisely.filesTitle")}</span>
        <button type="button" className="markwisely-sidebar-icon" onClick={onChooseRoot} title={t("markwisely.chooseWorkspaceRoot")} aria-label={t("markwisely.chooseWorkspaceRoot")}>
          <FolderOpen aria-hidden="true" size={15} />
        </button>
      </div>
      <div className="markwisely-sidebar-path" title={directory}>{directory}</div>
      <div className="markwisely-sidebar-tools">
        <button type="button" className="markwisely-sidebar-icon" disabled={atRoot || loading} onClick={() => parent && setDirectory(parent)} title={t("markwisely.parentFolder")} aria-label={t("markwisely.parentFolder")}>
          <ChevronLeft aria-hidden="true" size={15} />
        </button>
        <input aria-label={t("markwisely.quickOpen")} placeholder={t("markwisely.quickOpenPlaceholder")} value={quickFilter} onChange={(event) => setQuickFilter(event.target.value)} data-testid="markwisely-quick-open" />
      </div>
      {listError ? <div className="markwisely-sidebar-error" role="alert">{listError}</div> : null}
      <div className="markwisely-sidebar-list" aria-label={t("markwisely.filesTitle")}>
        {loading ? <div className="markwisely-sidebar-empty" role="status">{t("markwisely.loading")}</div> : null}
        {!loading && !listError && filteredEntries.map((entry) => (
          <button type="button" className={`markwisely-sidebar-row${entry.kind === "directory" ? " is-directory" : ""}`} key={entry.path} title={entry.path} onClick={() => entry.kind === "directory" ? setDirectory(entry.path) : onOpen(entry.path)} data-testid={entry.kind === "directory" ? "markwisely-sidebar-directory" : "markwisely-sidebar-file"}>
            {entry.kind === "directory" ? <Folder aria-hidden="true" size={15} /> : <FileText aria-hidden="true" size={15} />}
            <span>{entry.name}</span>
          </button>
        ))}
        {!loading && !listError && filteredEntries.length === 0 ? <div className="markwisely-sidebar-empty">{t("markwisely.noMarkdownFiles")}</div> : null}
      </div>
      <div className="markwisely-sidebar-section-head markwisely-sidebar-recents-head">{t("markwisely.recentTitle")}</div>
      <div className="markwisely-sidebar-list markwisely-sidebar-recents">
        {visibleRecents.map((recent) => (
          <button type="button" className="markwisely-sidebar-row" key={recent.path} title={recent.path} onClick={() => onOpen(recent.path)} data-testid="markwisely-sidebar-recent">
            <FileText aria-hidden="true" size={15} /><span>{recent.path.split(/[\\/]/).pop()}</span>
          </button>
        ))}
      </div>
      <div className="markwisely-sidebar-search">
        <label htmlFor="markwisely-content-query">{t("markwisely.searchTitle")}</label>
        <div className="markwisely-sidebar-search-row">
          <input id="markwisely-content-query" value={query} onChange={(event) => { setQuery(event.target.value); setSearchResults([]); setSearchError(null); }} onKeyDown={(event) => { if (event.key === "Enter") void runSearch(); }} placeholder={t("markwisely.searchPlaceholder")} data-testid="markwisely-content-search" />
          {searchActive ? (
            <button type="button" className="markwisely-sidebar-icon" onClick={cancelSearch} aria-label={t("markwisely.cancelSearch")} title={t("markwisely.cancelSearch")} data-testid="markwisely-search-cancel"><X aria-hidden="true" size={15} /></button>
          ) : (
            <button type="button" className="markwisely-sidebar-icon" onClick={() => void runSearch()} disabled={!query.trim()} aria-label={t("markwisely.startSearch")} title={t("markwisely.startSearch")} data-testid="markwisely-search-start"><Search aria-hidden="true" size={15} /></button>
          )}
        </div>
        {searchProgress ? <div className="markwisely-search-progress" role="status" data-testid="markwisely-search-progress">{t(searchProgress.phase === "listing" ? "markwisely.searchListing" : "markwisely.searching", { completed: searchProgress.completed, total: searchProgress.total ?? "…" })}</div> : null}
        {searchError ? <div className="markwisely-sidebar-error" role="alert">{searchError}</div> : null}
        {searchResults.map((result) => (
          <button type="button" className="markwisely-search-result" key={result.path} onClick={() => onOpen(result.path)} data-testid="markwisely-search-result">
            <strong>{result.path.split(/[\\/]/).pop()}</strong><small>{result.path}</small><span>{result.snippet}</span>
          </button>
        ))}
        {!searchActive && searchResults.length === 0 && query.trim() && !searchError ? <div className="markwisely-sidebar-empty">{t("markwisely.searchEmpty")}</div> : null}
      </div>
    </aside>
  );
}
