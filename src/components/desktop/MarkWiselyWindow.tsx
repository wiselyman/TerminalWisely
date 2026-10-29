import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save as showSaveDialog } from "@tauri-apps/plugin-dialog";
import { renderToStaticMarkup } from "react-dom/server";
import { FileDown, FilePlus2, FileText, FolderOpen, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./MarkWiselyWindow.css";
import { DesktopAppWindow } from "./DesktopAppWindow";
import { MarkWiselyFilePicker } from "./MarkWiselyFilePicker";
import { MarkdownWysiwygEditor } from "../preview/MarkdownWysiwygEditor";
import { flushPreviewEditor } from "../../lib/previewEditorFlush";
import { useMarkWiselyStore } from "../../stores/markWiselyStore";
import { MarkWiselyIcon } from "../WorkspaceToolIcons";
import { desktopTargetKey, type DesktopTarget } from "../../lib/desktopTarget";
import { createLocalPath, listLocalDirectory, listLocalRoots, parentLocalPath, writeLocalBytes, writeLocalText } from "../../lib/localFsApi";
import { createMarkdownDocx, renderMarkdownHtml } from "../../lib/markWiselyExport";
import { createMarkdownPdf } from "../../lib/markWiselyPdf";
import { useToastStore } from "../../stores/toastStore";

type Props = { target?: DesktopTarget; sessionId?: string; hostKey?: string; sessionTitle?: string | null };
type View = "start" | "create" | "create-folder" | "open-folder" | "open" | "save-as-folder" | "save-as" | "edit";
const EMPTY_RECENTS: ReturnType<ReturnType<typeof useMarkWiselyStore.getState>["getRecentFiles"]> = [];

const toolbarIcon = (Icon: typeof FileText) => renderToStaticMarkup(
  <Icon aria-hidden="true" size={17} strokeWidth={2} />,
);

const toolbarIcons = {
  open: toolbarIcon(FileText),
  "open-folder": toolbarIcon(FolderOpen),
  save: toolbarIcon(Save),
  "save-as": toolbarIcon(FilePlus2),
  export: toolbarIcon(FileDown),
};

export function MarkWiselyWindow({ target, sessionId, hostKey, sessionTitle }: Props) {
  const activeTarget = target ?? { kind: "ssh" as const, sessionId: sessionId ?? "" };
  const targetKey = desktopTargetKey(activeTarget);
  const activeHostKey = activeTarget.kind === "local" ? "local" : hostKey ?? sessionId ?? "";
  const { t } = useTranslation("tools");
  const [view, setView] = useState<View>("start");
  const [parentDir, setParentDir] = useState("/home");
  const [folderReady, setFolderReady] = useState(false);
  const [name, setName] = useState("未命名.md");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [folderDialogReturnView, setFolderDialogReturnView] = useState<"start" | "create">("start");
  const [filePickerReturnView, setFilePickerReturnView] = useState<"start" | "edit">("start");
  const document = useMarkWiselyStore((state) => state.documents[targetKey]);
  const recents = useMarkWiselyStore((state) => state.recentFiles[activeHostKey] ?? EMPTY_RECENTS);
  const openDocument = useMarkWiselyStore((state) => state.openDocument);
  const createDocument = useMarkWiselyStore((state) => state.createDocument);
  const saveAsDocument = useMarkWiselyStore((state) => state.saveAsDocument);
  const setEditorValue = useMarkWiselyStore((state) => state.setEditorValue);
  const saveDocument = useMarkWiselyStore((state) => state.saveDocument);
  const closeDocument = useMarkWiselyStore((state) => state.closeDocument);
  const dirty = !!document && document.text !== document.savedText;
  const flushId = useMemo(() => `markwisely-${targetKey}`, [targetKey]);

  const save = useCallback(async () => {
    const latest = flushPreviewEditor(flushId);
    if (latest !== null) setEditorValue(targetKey, latest);
    const current = useMarkWiselyStore.getState().getDocument(targetKey);
    if (!current || current.text === current.savedText) return true;
    setBusy(true);
    setError(null);
    try {
      await saveDocument(targetKey);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      setBusy(false);
    }
  }, [flushId, saveDocument, setEditorValue, targetKey]);

  useEffect(() => {
    if (view !== "edit" || !dirty) return;
    const timer = window.setTimeout(() => void save(), 700);
    return () => window.clearTimeout(timer);
  }, [dirty, document?.text, save, view]);

  useEffect(() => {
    let cancelled = false;
    setFolderReady(false);
    setParentDir("");
    if (activeTarget.kind === "local") {
      void listLocalRoots().then((roots) => {
        if (!cancelled) {
          setParentDir(roots[0] ?? "");
          setFolderReady(roots.length > 0);
        }
      }).catch(() => {
        if (!cancelled) setFolderReady(true);
      });
      return () => { cancelled = true; };
    }
    void invoke<string>("get_session_cwd", { request: { session_id: sessionId } })
      .then((cwd) => {
        if (!cancelled) {
          setParentDir(cwd || "/home");
          setFolderReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setParentDir("/home");
          setFolderReady(true);
        }
      });
    return () => { cancelled = true; };
  }, [activeTarget.kind, sessionId]);

  const handleCloseRequest = useCallback(async () => {
    if (dirty && !(await save())) return false;
    await closeDocument(targetKey);
    setView("start");
    return true;
  }, [closeDocument, dirty, save, targetKey]);

  const openPath = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      await openDocument({ sessionId, target: activeTarget, hostKey: activeHostKey, path });
      setView("edit");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const createFile = async () => {
    const fileName = name.trim();
    if (!fileName) return;
    const fullPath = `${parentDir.replace(/\/$/, "")}/${fileName}`;
    setBusy(true);
    setError(null);
    try {
      await createDocument({ sessionId, target: activeTarget, hostKey: activeHostKey, path: fullPath, parentDir, name: fileName });
      setView("edit");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const openMarkdownPicker = async (from: "file" | "folder") => {
    if (dirty && !(await save())) return;
    setError(null);
    setFilePickerReturnView(view === "edit" ? "edit" : "start");
    setView(from === "file" ? "open" : "open-folder");
  };

  const beginSaveAs = () => {
    const latest = flushPreviewEditor(flushId);
    if (latest !== null) setEditorValue(targetKey, latest);
    if (!document) return;
    const separator = document.path.includes("\\") ? "\\" : "/";
    const parts = document.path.split(/[\\/]/);
    const fileName = parts.pop() || "未命名.md";
    const currentParent = parts.join(separator) || separator;
    setParentDir(currentParent);
    setName(fileName);
    setError(null);
    setView("save-as-folder");
  };

  const createSaveAs = async () => {
    const latest = flushPreviewEditor(flushId);
    if (latest !== null) setEditorValue(targetKey, latest);
    const fileName = name.trim();
    if (!fileName) return;
    setBusy(true);
    setError(null);
    try {
      await saveAsDocument({ key: targetKey, parentDir, name: fileName });
      setView("edit");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const exportDocument = async (format: "html" | "word" | "pdf") => {
    setExportMenuOpen(false);
    const latest = flushPreviewEditor(flushId);
    const current = useMarkWiselyStore.getState().getDocument(targetKey);
    const content = latest ?? current?.text;
    if (content == null || !current) return;
    setError(null);
    setBusy(true);
    try {
      const stem = (current.path.split(/[\\/]/).pop() || "document.md").replace(/\.(md|markdown)$/i, "");
      const extension = format === "html" ? "html" : format === "pdf" ? "pdf" : "docx";
      const filterName = format === "html"
        ? t("markwisely.htmlFiles")
        : format === "pdf" ? t("markwisely.pdfFiles") : t("markwisely.wordFiles");
      const path = await showSaveDialog({
        title: t("markwisely.exportTitle"),
        defaultPath: `${stem}.${extension}`,
        filters: [{ name: filterName, extensions: [extension] }],
      });
      if (!path) return;
      const parent = parentLocalPath(path);
      const fileName = path.split(/[\\/]/).pop();
      if (!fileName) throw new Error(t("markwisely.exportFailed"));
      const directory = await listLocalDirectory(parent);
      if (!directory.entries.some((entry) => entry.path === path)) {
        await createLocalPath(parent, fileName, "file");
      }
      if (format === "html") await writeLocalText(path, renderMarkdownHtml(content, current.path.split(/[\\/]/).pop() || fileName));
      else if (format === "pdf") await writeLocalBytes(path, await createMarkdownPdf(content, current.path.split(/[\\/]/).pop() || fileName));
      else await writeLocalBytes(path, await createMarkdownDocx(content, current.path.split(/[\\/]/).pop() || fileName));
      useToastStore.getState().pushToast(t("markwisely.exported", { path }), true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      useToastStore.getState().pushToast(t("markwisely.exportFailed"), false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <DesktopAppWindow
      appId="markwisely"
      title={t("desktop.appMarkWisely")}
      centerTitle={view === "edit" && document ? (
        <span data-testid="markwisely-current-file" title={document.path}>
          {document.path.split("/").pop()}
        </span>
      ) : undefined}
      subtitle={sessionTitle}
      panelTestId="markwisely-panel"
      floatTestId="markwisely-float"
      minimizeTestId="markwisely-minimize"
      maximizeTestId="markwisely-maximize"
      closeTestId="markwisely-close"
      bodyClassName="markwisely-window-body"
      onCloseRequest={handleCloseRequest}
    >
      {view === "edit" && document ? (
        <div className="markwisely-editor-view" data-testid="markwisely-editor-view">
          {error || document.error ? <div className="markwisely-error" role="alert">{error ?? document.error}</div> : null}
          <div className="markwisely-editor">
            <MarkdownWysiwygEditor
              tabId={flushId}
              sessionId={document.sessionId ?? undefined}
              filePath={document.path}
              text={document.text}
              editable
              toolbarActions={[
                { id: "open", label: t("markwisely.toolbarOpen"), icon: toolbarIcons.open, onClick: () => void openMarkdownPicker("file") },
                { id: "open-folder", label: t("markwisely.toolbarOpenFolder"), icon: toolbarIcons["open-folder"], onClick: () => void openMarkdownPicker("folder") },
                { id: "save", label: t("markwisely.toolbarSave"), icon: toolbarIcons.save, onClick: () => void save() },
                { id: "save-as", label: t("markwisely.toolbarSaveAs"), icon: toolbarIcons["save-as"], onClick: beginSaveAs },
                { id: "export", label: t("markwisely.toolbarExport"), icon: toolbarIcons.export, onClick: () => setExportMenuOpen((open) => !open) },
              ]}
              onChange={(value) => { setError(null); setEditorValue(targetKey, value); }}
            />
          </div>
          {exportMenuOpen ? (
            <div className="markwisely-export-menu" role="group" aria-label={t("markwisely.exportTitle")} data-testid="markwisely-export-menu">
              <button type="button" onClick={() => void exportDocument("html")} disabled={busy}>HTML</button>
              <button type="button" onClick={() => void exportDocument("pdf")} disabled={busy}>PDF</button>
              <button type="button" onClick={() => void exportDocument("word")} disabled={busy}>{t("markwisely.exportWord")}</button>
            </div>
          ) : null}
          <span className={`markwisely-save-state${dirty ? " is-dirty" : ""}`} role="status" data-testid="markwisely-save-status">
            {document.saving || busy ? t("markwisely.saving") : dirty ? t("markwisely.unsaved") : t("markwisely.saved")}
          </span>
        </div>
      ) : view === "create" || view === "save-as" ? (
        <section className="markwisely-form-view" data-testid="markwisely-create-view">
          <button type="button" className="markwisely-back" onClick={() => setView(view === "save-as" ? "edit" : "start")}>{t("markwisely.back")}</button>
          <h2>{t(view === "save-as" ? "markwisely.saveAsTitle" : "markwisely.newTitle")}</h2>
          <label>{t("markwisely.folderLabel")}
            <div className="markwisely-folder-row"><input aria-label={t("markwisely.folderLabel")} value={parentDir} onChange={(event) => setParentDir(event.target.value)} /><button type="button" onClick={() => { if (view === "save-as") setView("save-as-folder"); else { setFolderDialogReturnView("create"); setView("create-folder"); } }} aria-label={t("markwisely.chooseFolder")}><FolderOpen aria-hidden="true" /></button></div>
          </label>
          <label>{t("markwisely.fileNameLabel")}<input data-testid="markwisely-file-name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          {error ? <div className="markwisely-error" role="alert">{error}</div> : null}
          <div className="markwisely-form-actions"><button type="button" className="markwisely-back" onClick={() => setView(view === "save-as" ? "edit" : "start")}>{t("markwisely.cancel")}</button><button type="button" className="markwisely-primary" data-testid={view === "save-as" ? "markwisely-save-as-submit" : "markwisely-create-submit"} disabled={busy || !folderReady || !parentDir.trim() || !name.trim()} onClick={() => void (view === "save-as" ? createSaveAs() : createFile())}>{busy ? t("markwisely.creating") : t(view === "save-as" ? "markwisely.saveAs" : "markwisely.create")}</button></div>
        </section>
      ) : (
        <section
          className="markwisely-home"
          data-testid="markwisely-home"
          aria-hidden={view !== "start"}
          inert={view !== "start" ? true : undefined}
        >
          <header className="markwisely-home-heading">
            <span className="markwisely-brand-icon" data-testid="markwisely-brand-icon" aria-hidden="true"><MarkWiselyIcon /></span>
            <div>
              <h2>MarkWisely</h2>
              <p>{t("markwisely.subtitle")}</p>
            </div>
          </header>
          <div className="markwisely-home-actions">
            <button type="button" className="markwisely-primary" data-testid="markwisely-new-document" onClick={() => { setError(null); setFolderDialogReturnView("start"); setView("create-folder"); }}>
              <FilePlus2 aria-hidden="true" />
              <span>{t("markwisely.newDocument")}</span>
            </button>
            <button type="button" className="markwisely-secondary" data-testid="markwisely-open-document" onClick={() => { setError(null); setView("open-folder"); }}>
              <FolderOpen aria-hidden="true" />
              <span>{t("markwisely.openDocument")}</span>
            </button>
          </div>
          {error ? <div className="markwisely-error" role="alert">{error}</div> : null}
          <section className="markwisely-recents" aria-labelledby="markwisely-recents-title">
            <h3 id="markwisely-recents-title">{t("markwisely.recentTitle")}</h3>
            {recents.length === 0 ? <p className="markwisely-empty">{t("markwisely.noRecentFiles")}</p> : recents.map((recent) => (
              <button type="button" key={recent.path} className="markwisely-recent" data-testid="markwisely-recent" onClick={() => void openPath(recent.path)} disabled={busy}>
                <span className="markwisely-recent-icon" aria-hidden>▤</span><span><strong>{recent.path.split("/").pop()}</strong><small>{recent.path}</small></span>
              </button>
            ))}
          </section>
        </section>
      )}
      {view === "create-folder" || view === "open-folder" || view === "open" || view === "save-as-folder" ? (
        <div className="markwisely-open-backdrop" data-testid={view === "open" ? "markwisely-open-backdrop" : "markwisely-folder-backdrop"}>
          <MarkWiselyFilePicker
            key={`${view}:${parentDir}`}
            sessionId={activeTarget.kind === "ssh" ? sessionId : undefined}
            target={activeTarget}
            mode={view === "open" ? "file" : "directory"}
            initialPath={view === "open" ? parentDir : parentDir || undefined}
            onCancel={() => setView(view === "create-folder" ? folderDialogReturnView : view === "save-as-folder" ? "edit" : filePickerReturnView)}
            onSelect={(path) => {
              if (view === "create-folder" || view === "open-folder" || view === "save-as-folder") {
                setParentDir(path);
                if (view === "create-folder") setView("create");
                else if (view === "save-as-folder") setView("save-as");
                else setView("open");
              } else {
                void openPath(path);
              }
            }}
          />
        </div>
      ) : null}
    </DesktopAppWindow>
  );
}
