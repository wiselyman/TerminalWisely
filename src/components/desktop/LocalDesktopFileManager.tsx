import { useCallback, useEffect, useMemo, useState, type MouseEvent as ReactMouseEvent } from "react";
import { Folder, FolderPlus, FilePlus2, ArrowLeft, ArrowUp, RefreshCw, Save, Pencil, MoveRight, Trash2, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LocalFsEntry } from "../../types";
import { formatAppError } from "../../lib/formatAppError";
import { useDesktopStore } from "../../stores/desktopStore";
import { useEditorWiselyStore } from "../../stores/editorWiselyStore";
import { useLocalFsStore, LOCAL_FS_SESSION_ID } from "../../stores/localFsStore";
import { LocalFsTreeView } from "../LocalFsTreeView";
import { LocalFsContentsView } from "../LocalFsContentsView";
import { LocalFsPathBreadcrumb } from "../LocalFsPathBreadcrumb";
import { PathInput } from "../PathInput";
import { LocalFsContextMenu, type LocalFsContextMenuProps } from "../LocalFsContextMenu";
import {
  copyLocalPath,
  createLocalPath,
  deleteLocalPath,
  listLocalDirectory,
  listLocalRoots,
  moveLocalPath,
  openLocalPath,
  parentLocalPath,
  renameLocalPath,
  revealLocalPath,
  writeLocalText,
} from "../../lib/localFsApi";

type FileAction = "file" | "folder" | "rename" | "move";
type LocalMenuState = { kind: "entry"; x: number; y: number; entry: LocalFsEntry } | { kind: "background"; x: number; y: number; path: string };
const LAST_LOCAL_DIRECTORY_KEY = "tw.desktop.local.files.last-directory";

function readLastLocalDirectory(): string | null {
  try { return localStorage.getItem(LAST_LOCAL_DIRECTORY_KEY); }
  catch { return null; }
}

export function LocalDesktopFileManager() {
  const { t } = useTranslation(["tools", "common"]);
  const openEditor = useEditorWiselyStore((s) => s.open);
  const launchApp = useDesktopStore((s) => s.launchApp);
  const fs = useLocalFsStore();
  const [roots, setRoots] = useState<string[]>([]);
  const [path, setPath] = useState<string | null>(readLastLocalDirectory);
  const [entries, setEntries] = useState<LocalFsEntry[]>([]);
  const [selected, setSelected] = useState<LocalFsEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<FileAction | null>(null);
  const [actionValue, setActionValue] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [textDirty, setTextDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState("");
  const [menu, setMenu] = useState<LocalMenuState | null>(null);
  const [addressEditing, setAddressEditing] = useState(false);
  const [addressDraft, setAddressDraft] = useState("");

  useEffect(() => {
    fs.activateSession(LOCAL_FS_SESSION_ID);
  // Activate the local file tree when the Files window opens.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!fs.contentsPath || fs.sessionId !== LOCAL_FS_SESSION_ID) return;
    setPath(fs.contentsPath);
    try { localStorage.setItem("tw.desktop.local.files.last-directory", fs.contentsPath); } catch { /* ignored */ }
  }, [fs.contentsPath, fs.sessionId]);

  useEffect(() => {
    if (!fs.selectedPath) return;
    const entry = fs.getEntryByPath(fs.selectedPath);
    if (entry) setSelected(entry);
  }, [fs.selectedPath, fs.childrenCache, fs.getEntryByPath]);

  const refresh = useCallback(async (directory = path) => {
    if (!directory) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listLocalDirectory(directory);
      setPath(result.path);
      setEntries(result.entries);
      if (fs.sessionId === LOCAL_FS_SESSION_ID) void fs.reloadDirectory(result.path, { ensureExpanded: true });
      setSelected((current) => current && result.entries.some((entry) => entry.path === current.path)
        ? result.entries.find((entry) => entry.path === current.path) ?? null
        : null);
    } catch (err) {
      setError(formatAppError(err));
    } finally {
      setLoading(false);
    }
  }, [path, fs.sessionId, fs.reloadDirectory]);

  useEffect(() => {
    let cancelled = false;
    void listLocalRoots().then((available) => {
      if (cancelled) return;
      setRoots(available);
      const initial = readLastLocalDirectory() ?? available[0];
      if (initial) {
        setPath(initial);
      }
    }).catch((err) => {
      if (!cancelled) setError(formatAppError(err));
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!path) return;
    try { localStorage.setItem(LAST_LOCAL_DIRECTORY_KEY, path); }
    catch { /* Browsing remains available when storage is disabled. */ }
  }, [path]);

  useEffect(() => {
    if (path) void refresh(path);
  }, [path, refresh]);

  const beginAction = (next: FileAction) => {
    setAction(next);
    setActionValue(next === "rename" ? selected?.name ?? "" : next === "move" ? path ?? "" : "");
  };

  const submitAction = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!path || !action) return;
    setError(null);
    try {
      if (action === "file" || action === "folder") {
        await createLocalPath(path, actionValue, action === "file" ? "file" : "directory");
      } else if (action === "rename" && selected) {
        await renameLocalPath(selected.path, actionValue);
      } else if (action === "move" && selected) {
        await moveLocalPath(selected.path, actionValue);
      }
      setAction(null);
      setActionValue("");
      await refresh(path);
    } catch (err) {
      setError(formatAppError(err));
    }
  };

  const saveText = async () => {
    if (!selected || text == null) return;
    setSaving(true);
    setError(null);
    try {
      await writeLocalText(selected.path, text);
      setTextDirty(false);
      await refresh(path);
    } catch (err) {
      setError(formatAppError(err));
    } finally {
      setSaving(false);
    }
  };

  const deleteSelected = async () => {
    await deletePaths(selected ? [selected.path] : []);
  };

  const menuPaths = (entry?: LocalFsEntry) => {
    const paths = fs.selectedPaths;
    if (entry && paths.includes(entry.path)) return paths;
    return entry ? [entry.path] : paths;
  };

  const copyPathsToClipboard = async (paths: string[]) => {
    fs.setClipboard({ sessionId: LOCAL_FS_SESSION_ID, op: "copy", paths });
  };

  const pastePaths = async (destDir: string) => {
    const clipboard = fs.clipboard;
    if (!clipboard || clipboard.sessionId !== LOCAL_FS_SESSION_ID) return;
    try {
      for (const source of clipboard.paths) {
        if (clipboard.op === "cut") await moveLocalPath(source, destDir);
        else await copyLocalPath(source, destDir);
      }
      if (clipboard.op === "cut") fs.setClipboard(null);
      await refresh(destDir);
      await fs.reloadDirectory(destDir, { ensureExpanded: true });
      setError(null);
    } catch (err) {
      setError(formatAppError(err));
    }
  };

  const duplicatePath = async (entry: LocalFsEntry) => {
    const parentDir = parentLocalPath(entry.path);
    const extensionIndex = entry.name.lastIndexOf(".");
    const copyName = extensionIndex > 0
      ? `${entry.name.slice(0, extensionIndex)} copy${entry.name.slice(extensionIndex)}`
      : `${entry.name} copy`;
    try {
      await copyLocalPath(entry.path, parentDir, copyName);
      await refresh(parentDir);
      await fs.reloadDirectory(parentDir, { ensureExpanded: true });
    } catch (err) { setError(formatAppError(err)); }
  };

  const deletePaths = async (paths: string[]) => {
    if (!paths.length) return;
    const label = paths.length === 1 ? paths[0].split(/[\\/]/).pop() ?? paths[0] : `${paths.length} items`;
    if (!window.confirm(t("localFs.deleteConfirmLocal", { name: label }))) return;
    try {
      for (const filePath of paths) await deleteLocalPath(filePath);
      setSelected(null);
      setText(null);
      await refresh(path);
      if (path) await fs.reloadDirectory(path, { ensureExpanded: true });
    } catch (err) { setError(formatAppError(err)); }
  };

  const openEntryMenu = (event: ReactMouseEvent, entry: LocalFsEntry) => {
    event.preventDefault();
    event.stopPropagation();
    if (!fs.selectedPaths.includes(entry.path)) fs.setSelectedPath(entry.path);
    setSelected(entry);
    setMenu({ kind: "entry", x: event.clientX, y: event.clientY, entry });
  };

  const openBackgroundMenu = (event: ReactMouseEvent, targetPath: string | null) => {
    event.preventDefault();
    setMenu({ kind: "background", x: event.clientX, y: event.clientY, path: targetPath ?? path ?? "" });
  };

  const runLocalMenuAction = (actionName: string) => {
    if (actionName === "newFile") beginAction("file");
    if (actionName === "newFolder") beginAction("folder");
    if (actionName === "rename") beginAction("rename");
    if (actionName === "move") beginAction("move");
  };

  const localMenuProps: LocalFsContextMenuProps | null = menu ? menu.kind === "entry" ? {
    kind: "entry",
    x: menu.x,
    y: menu.y,
    entry: menu.entry,
    canPaste: Boolean(fs.clipboard?.sessionId === LOCAL_FS_SESSION_ID && fs.clipboard.paths.length),
    onClose: () => setMenu(null),
    onCopyName: () => { void navigator.clipboard.writeText(menu.entry.name).catch((err) => setError(formatAppError(err))); },
    onCopyPath: () => { void navigator.clipboard.writeText(menu.entry.path).catch((err) => setError(formatAppError(err))); },
    onCopyItems: () => { void copyPathsToClipboard(menuPaths(menu.entry)); },
    onCutItems: () => fs.setClipboard({ sessionId: LOCAL_FS_SESSION_ID, op: "cut", paths: menuPaths(menu.entry) }),
    onPasteItems: () => { void pastePaths(menu.entry.kind === "directory" ? menu.entry.path : parentLocalPath(menu.entry.path)); },
    onDuplicate: () => { void duplicatePath(menu.entry); },
    onPreview: () => { void openEditor({ kind: "local" }, menu.entry.path); launchApp("editorwisely"); },
    onOpenEditor: () => { void openEditor({ kind: "local" }, menu.entry.path); launchApp("editorwisely"); },
    onRename: () => runLocalMenuAction("rename"),
    onDelete: () => { void deletePaths(menuPaths(menu.entry)); },
    onMove: () => runLocalMenuAction("move"),
    onNewFile: menu.entry.kind === "directory" ? () => runLocalMenuAction("newFile") : undefined,
    onNewFolder: menu.entry.kind === "directory" ? () => runLocalMenuAction("newFolder") : undefined,
  } : {
    kind: "background",
    x: menu.x,
    y: menu.y,
    canPaste: Boolean(fs.clipboard?.sessionId === LOCAL_FS_SESSION_ID && fs.clipboard.paths.length),
    onClose: () => setMenu(null),
    onRefresh: () => { void refresh(menu.path); void fs.reloadDirectory(menu.path, { ensureExpanded: true }); },
    onNewFile: () => { setPath(menu.path); runLocalMenuAction("newFile"); },
    onNewFolder: () => { setPath(menu.path); runLocalMenuAction("newFolder"); },
    onPasteItems: () => { void pastePaths(menu.path); },
  } : null;

  const parent = useMemo(() => path ? parentLocalPath(path) : null, [path]);

  return (
    <section className="local-desktop-files local-fs-embedded" data-testid="local-desktop-files">
      <div className="local-desktop-files-toolbar">
        <button type="button" className="preview-toolbar-icon" aria-label={t("localFs.goBack")} disabled={fs.contentsHistory.length === 0} onClick={() => { void fs.goBack(); }}><ArrowLeft /></button>
        <button type="button" className="preview-toolbar-icon" aria-label={t("localFs.goUp")} disabled={!parent || parent === path} onClick={() => parent && setPath(parent)}><ArrowUp /></button>
        <div className="local-fs-address-bar local-desktop-files-location">
          {addressEditing ? <form onSubmit={(event) => { event.preventDefault(); const next = addressDraft.trim(); if (next) { setPath(next); void fs.openDirectory(next); } setAddressEditing(false); }}><PathInput sessionId={LOCAL_FS_SESSION_ID} value={addressDraft} onChange={setAddressDraft} autoFocus onSubmit={(next) => { setPath(next); void fs.openDirectory(next); setAddressEditing(false); }} /></form> : <LocalFsPathBreadcrumb path={path ?? "/"} onNavigate={(next) => { setPath(next); void fs.openDirectory(next); }} onEdit={() => { setAddressDraft(path ?? ""); setAddressEditing(true); }} />}
        </div>
        <button type="button" className="preview-toolbar-icon" aria-label={t("localFs.refresh")} onClick={() => { void refresh(); void fs.refreshTree(); }}><RefreshCw /></button>
        <button type="button" className={`local-fs-tool-btn${fs.showHidden ? " is-active" : ""}`} aria-label={fs.showHidden ? t("localFs.hideHidden") : t("localFs.showHidden")} aria-pressed={fs.showHidden} onClick={() => fs.setShowHidden(!fs.showHidden)}><span aria-hidden>◉</span></button>
        <button type="button" className={`local-fs-tool-btn${fs.viewMode === "list" ? " is-active" : ""}`} aria-label={t("localFs.viewList")} onClick={() => fs.setViewMode("list")}><span aria-hidden>☷</span></button>
        <button type="button" className={`local-fs-tool-btn${fs.viewMode === "grid" ? " is-active" : ""}`} aria-label={t("localFs.viewGrid")} onClick={() => fs.setViewMode("grid")}><span aria-hidden>▦</span></button>
        <input type="search" data-testid="file-manager-search" aria-label={t("find.nameAria")} placeholder={t("find.namePlaceholder")} value={filter} onChange={(event) => setFilter(event.target.value)} />
        <span className="local-desktop-files-toolbar-divider" />
        <button type="button" className="preview-toolbar-icon" data-testid="local-files-new-folder" aria-label={t("localFs.newFolderLocal")} onClick={() => beginAction("folder")}><FolderPlus /></button>
        <button type="button" className="preview-toolbar-icon" data-testid="local-files-new-file" aria-label={t("localFs.newFileLocal")} onClick={() => beginAction("file")}><FilePlus2 /></button>
        <button type="button" className="preview-toolbar-icon" data-testid="local-files-rename" aria-label={t("localFs.rename")} disabled={!selected} onClick={() => beginAction("rename")}><Pencil /></button>
        <button type="button" className="preview-toolbar-icon" data-testid="local-files-move" aria-label={t("localFs.moveLocal")} disabled={!selected} onClick={() => beginAction("move")}><MoveRight /></button>
        <button type="button" className="preview-toolbar-icon is-danger" data-testid="local-files-delete" aria-label={t("localFs.delete")} disabled={!selected} onClick={() => void deleteSelected()}><Trash2 /></button>
      </div>
      <nav className="local-desktop-files-roots" aria-label={t("localFs.rootsAria")}>
        {roots.map((root) => <button type="button" key={root} className={root === path ? "is-active" : ""} onClick={() => setPath(root)} title={root}>{root}</button>)}
      </nav>
      {action ? (
        <form className="local-desktop-files-action" role="dialog" aria-label={t(`localFs.${action}LocalTitle`)} onSubmit={submitAction}>
          <input autoFocus data-testid="local-files-action-input" aria-label={action === "move" ? t("localFs.destinationLocal") : t("localFs.newName")} value={actionValue} onChange={(event) => setActionValue(event.target.value)} placeholder={action === "move" ? t("localFs.destinationLocal") : t("localFs.newName")} />
          <button type="submit" data-testid="local-files-action-confirm">{t("common:save")}</button>
          <button type="button" onClick={() => setAction(null)}>{t("common:cancel")}</button>
        </form>
      ) : null}
      {error ? <div className="local-desktop-files-error" role="alert">{error}</div> : null}
      <div className="local-fs-split local-desktop-files-content" data-testid="local-fs-split">
        <div className="local-fs-split-tree">
          <LocalFsTreeView onEntryContextMenu={openEntryMenu} onBackgroundContextMenu={(event) => openBackgroundMenu(event, path)} onMovePaths={(paths, dest) => { for (const source of paths) void moveLocalPath(source, dest).then(() => refresh(path)); }} />
        </div>
        <div className="local-fs-split-resizer" role="separator" aria-orientation="vertical" aria-label={t("localFs.splitResizeAria")} />
        <div className="local-fs-split-contents">
          <LocalFsContentsView
            onEntryContextMenu={openEntryMenu}
            onBackgroundContextMenu={(event) => openBackgroundMenu(event, path)}
            onOpenFile={(entry) => { setSelected(entry); void openEditor({ kind: "local" }, entry.path); launchApp("editorwisely"); }}
            onMovePaths={(paths, dest) => { for (const source of paths) void moveLocalPath(source, dest).then(() => refresh(path)); }}
            entriesOverride={filter.trim() ? entries.filter((entry) => entry.name.toLowerCase().includes(filter.trim().toLowerCase())) : null}
            loadingOverride={loading}
            emptyLabel={filter.trim() ? t("find.empty") : t("localFs.empty")}
          />
        </div>
        {selected?.kind === "file" ? <div className="local-desktop-files-selected-actions"><button type="button" data-testid="local-files-open-editorwisely" onClick={() => { void openEditor({ kind: "local" }, selected.path); launchApp("editorwisely"); }}>{t("editor.openWith")}</button></div> : null}
        {text != null && selected ? (
          <section className="local-desktop-files-editor" aria-label={selected.name}>
            <header><strong>{selected.name}</strong><div>
              <button type="button" className="preview-toolbar-icon" aria-label={t("localFs.openWithSystemLocal")} onClick={() => void openLocalPath(selected.path)}><ExternalLink /></button>
              <button type="button" className="preview-toolbar-icon" aria-label={t("localFs.revealLocal")} onClick={() => void revealLocalPath(selected.path)}><Folder /></button>
              <button type="button" className="preview-toolbar-icon" data-testid="local-files-save" aria-label={t("common:save")} disabled={!textDirty || saving} onClick={() => void saveText()}><Save /></button>
            </div></header>
            <textarea data-testid="local-files-editor" value={text} onChange={(event) => { setText(event.target.value); setTextDirty(true); }} spellCheck={false} />
          </section>
        ) : null}
      </div>
      {localMenuProps ? <LocalFsContextMenu {...localMenuProps} /> : null}
    </section>
  );
}
