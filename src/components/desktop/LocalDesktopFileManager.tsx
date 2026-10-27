import { useCallback, useEffect, useMemo, useState } from "react";
import { FileText, Folder, FolderPlus, FilePlus2, ArrowLeft, ArrowUp, RefreshCw, Save, Pencil, MoveRight, Trash2, ExternalLink } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { LocalFsEntry } from "../../types";
import { formatAppError } from "../../lib/formatAppError";
import {
  createLocalPath,
  deleteLocalPath,
  listLocalDirectory,
  listLocalRoots,
  moveLocalPath,
  openLocalPath,
  parentLocalPath,
  readLocalText,
  renameLocalPath,
  revealLocalPath,
  writeLocalText,
} from "../../lib/localFsApi";

type FileAction = "file" | "folder" | "rename" | "move";
const LAST_LOCAL_DIRECTORY_KEY = "tw.desktop.local.files.last-directory";

function readLastLocalDirectory(): string | null {
  try { return localStorage.getItem(LAST_LOCAL_DIRECTORY_KEY); }
  catch { return null; }
}

function modifiedLabel(timestamp?: number | null, language?: string) {
  if (!timestamp) return "—";
  return new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp));
}

function sizeLabel(size?: number | null) {
  if (size == null) return "—";
  if (size < 1024) return `${size} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = size / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unit]}`;
}

export function LocalDesktopFileManager() {
  const { t, i18n } = useTranslation(["tools", "common"]);
  const [roots, setRoots] = useState<string[]>([]);
  const [path, setPath] = useState<string | null>(readLastLocalDirectory);
  const [pathDraft, setPathDraft] = useState("");
  const [entries, setEntries] = useState<LocalFsEntry[]>([]);
  const [selected, setSelected] = useState<LocalFsEntry | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<FileAction | null>(null);
  const [actionValue, setActionValue] = useState("");
  const [text, setText] = useState<string | null>(null);
  const [textDirty, setTextDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async (directory = path) => {
    if (!directory) return;
    setLoading(true);
    setError(null);
    try {
      const result = await listLocalDirectory(directory);
      setPath(result.path);
      setPathDraft(result.path);
      setEntries(result.entries);
      setSelected((current) => current && result.entries.some((entry) => entry.path === current.path)
        ? result.entries.find((entry) => entry.path === current.path) ?? null
        : null);
    } catch (err) {
      setError(formatAppError(err));
    } finally {
      setLoading(false);
    }
  }, [path]);

  useEffect(() => {
    let cancelled = false;
    void listLocalRoots().then((available) => {
      if (cancelled) return;
      setRoots(available);
      const initial = readLastLocalDirectory() ?? available[0];
      if (initial) {
        setPath(initial);
        setPathDraft(initial);
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

  const openEntry = async (entry: LocalFsEntry) => {
    setSelected(entry);
    setText(null);
    setTextDirty(false);
    if (entry.kind === "directory") {
      setPath(entry.path);
      return;
    }
    try {
      const contents = await readLocalText(entry.path);
      setText(contents);
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
    if (!selected || !window.confirm(t("localFs.deleteConfirmLocal", { name: selected.name }))) return;
    try {
      await deleteLocalPath(selected.path);
      setSelected(null);
      setText(null);
      await refresh(path);
    } catch (err) {
      setError(formatAppError(err));
    }
  };

  const parent = useMemo(() => path ? parentLocalPath(path) : null, [path]);

  return (
    <section className="local-desktop-files" data-testid="local-desktop-files">
      <div className="local-desktop-files-toolbar">
        <button type="button" className="preview-toolbar-icon" aria-label={t("localFs.goBack")} disabled={!parent || parent === path} onClick={() => parent && setPath(parent)}><ArrowLeft /></button>
        <button type="button" className="preview-toolbar-icon" aria-label={t("localFs.goUp")} disabled={!parent || parent === path} onClick={() => parent && setPath(parent)}><ArrowUp /></button>
        <form className="local-desktop-files-location" onSubmit={(event) => { event.preventDefault(); setPath(pathDraft); }}>
          <input aria-label={t("localFs.locationAria")} value={pathDraft} onChange={(event) => setPathDraft(event.target.value)} />
        </form>
        <button type="button" className="preview-toolbar-icon" aria-label={t("localFs.refresh")} onClick={() => void refresh()}><RefreshCw /></button>
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
      <div className="local-desktop-files-content">
        <div className="local-desktop-files-list">
          <table>
            <thead><tr><th>{t("localFs.colName")}</th><th>{t("localFs.colModified")}</th><th>{t("localFs.colSize")}</th></tr></thead>
            <tbody>
              {entries.map((entry) => {
                const Icon = entry.kind === "directory" ? Folder : FileText;
                return <tr key={entry.path} data-testid="local-file-row" className={selected?.path === entry.path ? "is-selected" : ""} onClick={() => { setSelected(entry); setText(null); }} onDoubleClick={() => void openEntry(entry)}>
                  <td><span className={`local-desktop-files-entry-icon is-${entry.kind}`}><Icon size={17} /></span><span className="local-desktop-files-entry-name" title={entry.name}>{entry.name}</span></td>
                  <td>{modifiedLabel(entry.modified_ms, i18n.language)}</td>
                  <td>{entry.kind === "directory" ? "—" : sizeLabel(entry.size_bytes)}</td>
                </tr>;
              })}
              {!loading && entries.length === 0 ? <tr><td colSpan={3} className="local-desktop-files-empty">{t("localFs.empty")}</td></tr> : null}
            </tbody>
          </table>
          {loading ? <div className="local-desktop-files-loading" role="status">{t("localFs.loading")}</div> : null}
        </div>
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
    </section>
  );
}
