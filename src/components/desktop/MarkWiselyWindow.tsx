import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open as showOpenDialog, save as showSaveDialog } from "@tauri-apps/plugin-dialog";
import { ChevronDown, Code2, FileDown, FilePlus2, FileText, FolderOpen, Import, PanelLeft, PanelRight, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./MarkWiselyWindow.css";
import { DesktopAppWindow } from "./DesktopAppWindow";
import { MarkWiselyFilePicker } from "./MarkWiselyFilePicker";
import { MarkWiselyDocumentTabs } from "./MarkWiselyDocumentTabs";
import { MarkWiselySidebar } from "./MarkWiselySidebar";
import { MarkWiselyOutlinePanel } from "./MarkWiselyOutlinePanel";
import { MarkdownWysiwygEditor } from "../preview/MarkdownWysiwygEditor";
import { flushPreviewEditor } from "../../lib/previewEditorFlush";
import { useMarkWiselyStore } from "../../stores/markWiselyStore";
import { MarkWiselyIcon } from "../WorkspaceToolIcons";
import { desktopTargetKey, type DesktopTarget } from "../../lib/desktopTarget";
import { createLocalPath, listLocalDirectory, listLocalRoots, parentLocalPath, writeLocalBytes, writeLocalText } from "../../lib/localFsApi";
import { normalizeMarkWiselyExportPath } from "../../lib/markWiselyExportPath";
import { exportDocument as exportMarkdownDocument, importDocumentFromPath } from "../../lib/markdownImportExport/adapters";
import { createTauriPandocExecutor, createTauriPandocFileImporter } from "../../lib/markdownImportExport/tauriExecutor";
import { useToastStore } from "../../stores/toastStore";
import { countMarkdown } from "../../lib/markdownStatistics";
import { scopeEditorCss } from "../../lib/markdownEditor/preferences";
import { useMarkWiselyPreferencesStore } from "../../stores/markWiselyPreferencesStore";

type Props = { target?: DesktopTarget; sessionId?: string; hostKey?: string; sessionTitle?: string | null };
type View = "start" | "create" | "create-folder" | "open-folder" | "open" | "workspace-folder" | "save-as-folder" | "save-as" | "edit";
const EMPTY_RECENTS: ReturnType<ReturnType<typeof useMarkWiselyStore.getState>["getRecentFiles"]> = [];
const EMPTY_DOCUMENTS: ReturnType<ReturnType<typeof useMarkWiselyStore.getState>["getDocuments"]> = [];

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
  const [pandocFormats, setPandocFormats] = useState<string[]>([]);
  const [pandocInputFormats, setPandocInputFormats] = useState<string[]>([]);
  const [conversionActive, setConversionActive] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0);
  const conversionAbortRef = useRef<AbortController | null>(null);
  const pendingImportedMarkdownRef = useRef<string | null>(null);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [outlineOpen, setOutlineOpen] = useState(false);
  const [showSavedFlash, setShowSavedFlash] = useState(false);
  const savedFlashTimerRef = useRef<number | null>(null);
  const previousSaveRef = useRef<{ documentId: string; savedText: string; pendingSaved: boolean } | null>(null);
  const [sourceMode, setSourceMode] = useState(false);
  const [folderDialogReturnView, setFolderDialogReturnView] = useState<"start" | "create">("start");
  const [filePickerReturnView, setFilePickerReturnView] = useState<"start" | "edit">("start");
  const [workspaceRoots, setWorkspaceRoots] = useState<Record<string, string>>({});
  const document = useMarkWiselyStore((state) => state.documents[targetKey]);
  const openDocuments = useMarkWiselyStore((state) => state.openDocuments[targetKey] ?? EMPTY_DOCUMENTS);
  const activeDocumentId = useMarkWiselyStore((state) => state.activeDocumentIds[targetKey] ?? null);
  const recents = useMarkWiselyStore((state) => state.recentFiles[activeHostKey] ?? EMPTY_RECENTS);
  const openDocument = useMarkWiselyStore((state) => state.openDocument);
  const createDocument = useMarkWiselyStore((state) => state.createDocument);
  const saveAsDocument = useMarkWiselyStore((state) => state.saveAsDocument);
  const setEditorValue = useMarkWiselyStore((state) => state.setEditorValue);
  const saveDocument = useMarkWiselyStore((state) => state.saveDocument);
  const closeDocument = useMarkWiselyStore((state) => state.closeDocument);
  const restoreDraft = useMarkWiselyStore((state) => state.restoreDraft);
  const discardDraft = useMarkWiselyStore((state) => state.discardDraft);
  const dirty = !!document && document.text !== document.savedText;
  const deferredDocumentText = useDeferredValue(document?.text ?? "");
  const statistics = useMemo(() => countMarkdown(deferredDocumentText), [deferredDocumentText]);
  const editorPreferences = useMarkWiselyPreferencesStore((state) => state.preferences);
  const updateEditorPreferences = useMarkWiselyPreferencesStore((state) => state.updatePreferences);
  const scopedEditorCss = useMemo(() => scopeEditorCss(editorPreferences.customCss), [editorPreferences.customCss]);
  const flushId = useMemo(() => `markwisely-${targetKey}`, [targetKey]);
  const workspaceRoot = workspaceRoots[targetKey] ?? (document ? parentLocalPath(document.path) : parentDir);

  useEffect(() => { setSourceMode(false); }, [activeDocumentId]);

  useEffect(() => {
    const previous = previousSaveRef.current;
    if (!document) {
      previousSaveRef.current = null;
      setShowSavedFlash(false);
      return;
    }

    let pendingSaved = previous?.documentId === document.documentId ? previous.pendingSaved : false;
    if (previous?.documentId === document.documentId && previous.savedText !== document.savedText) {
      pendingSaved = true;
    }
    const savedSuccessfully = pendingSaved && !document.saving && document.text === document.savedText;
    if (savedSuccessfully) {
      setShowSavedFlash(true);
      if (savedFlashTimerRef.current !== null) window.clearTimeout(savedFlashTimerRef.current);
      savedFlashTimerRef.current = window.setTimeout(() => {
        setShowSavedFlash(false);
        savedFlashTimerRef.current = null;
      }, 1500);
      pendingSaved = false;
    } else if (previous?.documentId !== document.documentId || dirty || document.saving) {
      setShowSavedFlash(false);
      if (savedFlashTimerRef.current !== null) {
        window.clearTimeout(savedFlashTimerRef.current);
        savedFlashTimerRef.current = null;
      }
    } else {
      pendingSaved = false;
    }
    previousSaveRef.current = { documentId: document.documentId, savedText: document.savedText, pendingSaved };
  }, [dirty, document]);

  useEffect(() => () => {
    if (savedFlashTimerRef.current !== null) window.clearTimeout(savedFlashTimerRef.current);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void invoke<string[]>("markdown_pandoc_formats")
      .then((formats) => { if (!cancelled) setPandocFormats(Array.isArray(formats) ? formats : []); })
      .catch(() => { if (!cancelled) setPandocFormats([]); });
    void invoke<string[]>("markdown_pandoc_input_formats")
      .then((formats) => { if (!cancelled) setPandocInputFormats(Array.isArray(formats) ? formats : []); })
      .catch(() => { if (!cancelled) setPandocInputFormats([]); });
    return () => { cancelled = true; };
  }, []);

  const save = useCallback(async () => {
    const latest = flushPreviewEditor(flushId);
    if (latest !== null) setEditorValue(targetKey, latest);
    const current = useMarkWiselyStore.getState().getDocument(targetKey);
    if (!current || current.text === current.savedText) return true;
    setBusy(true);
    setError(null);
    try {
      const current = useMarkWiselyStore.getState().getDocument(targetKey);
      await saveDocument(targetKey, current?.documentId);
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
    const latest = flushPreviewEditor(flushId);
    const current = useMarkWiselyStore.getState().getDocument(targetKey);
    if (latest !== null && current) setEditorValue(targetKey, latest, current.documentId);
    const documents = useMarkWiselyStore.getState().getDocuments(targetKey);
    for (const document of documents) {
      if (document.text === document.savedText) continue;
      try {
        await saveDocument(targetKey, document.documentId);
      } catch (cause) {
        setError(cause instanceof Error && cause.message ? cause.message : document.error ?? t("markwisely.saveFailed"));
        return false;
      }
    }
    await closeDocument(targetKey);
    setView("start");
    return true;
  }, [closeDocument, flushId, saveDocument, setEditorValue, t, targetKey]);

  const activateTab = async (documentId: string) => {
    const current = useMarkWiselyStore.getState().getDocument(targetKey);
    const latest = flushPreviewEditor(flushId);
    if (latest !== null && current) setEditorValue(targetKey, latest, current.documentId);
    const refreshed = useMarkWiselyStore.getState().getDocument(targetKey);
    if (refreshed && refreshed.text !== refreshed.savedText) {
      try {
        await saveDocument(targetKey, refreshed.documentId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      }
    }
    useMarkWiselyStore.getState().activateDocument(targetKey, documentId);
    setError(null);
    setView("edit");
  };

  const closeTab = async (documentId: string) => {
    const current = useMarkWiselyStore.getState().getDocument(targetKey);
    if (current?.documentId === documentId) {
      const latest = flushPreviewEditor(flushId);
      if (latest !== null) setEditorValue(targetKey, latest, documentId);
    }
    const documentToClose = useMarkWiselyStore.getState().getDocuments(targetKey)
      .find((item) => item.documentId === documentId);
    if (documentToClose && documentToClose.text !== documentToClose.savedText) {
      try {
        await saveDocument(targetKey, documentId);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : String(cause));
        return;
      }
    }
    await closeDocument(targetKey, documentId);
    const remaining = useMarkWiselyStore.getState().getDocument(targetKey);
    setView(remaining ? "edit" : "start");
  };

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

  const importIntoNewDocument = async () => {
    if (!document) return;
    if (pandocInputFormats.length === 0) {
      setError(t("markwisely.pandocUnavailable"));
      return;
    }
    setError(null);
    try {
      const extensions = [...new Set(pandocInputFormats.filter((format) => /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/.test(format)))];
      const selected = await showOpenDialog({
        multiple: false,
        title: t("markwisely.importTitle"),
        filters: [{ name: t("markwisely.importSupportedFiles"), extensions }],
      });
      if (typeof selected !== "string") return;
      const extension = selected.split(/[\\/.]/).pop()?.toLowerCase() ?? "";
      const format = pandocInputFormats.find((candidate) => candidate.toLowerCase() === extension);
      if (!format) throw new Error(t("markwisely.importUnsupported"));
      const controller = new AbortController();
      conversionAbortRef.current = controller;
      setConversionActive(true);
      setBusy(true);
      const imported = await importDocumentFromPath(format, selected, {
        pandocPath: "detected",
        importFile: createTauriPandocFileImporter(invoke),
        signal: controller.signal,
      });
      if (!imported.ok) throw new Error(imported.error);
      const separator = document.path.includes("\\") ? "\\" : "/";
      const parent = parentLocalPath(document.path);
      const sourceName = selected.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, "") || "Imported document";
      const defaultPath = `${parent.replace(/[/\\]+$/, "")}${separator}${sourceName}.md`;
      pendingImportedMarkdownRef.current = imported.source;
      setParentDir(parent);
      setName(defaultPath.split(/[\\/]/).pop() ?? `${sourceName}.md`);
      setFolderReady(true);
      setView("create");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.toLowerCase().includes("cancelled")) setError(t("markwisely.conversionCancelled"));
      else setError(message);
    } finally {
      if (conversionAbortRef.current) {
        conversionAbortRef.current = null;
        setConversionActive(false);
        setBusy(false);
      }
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
      const createdDocument = useMarkWiselyStore.getState().getDocument(targetKey);
      const importedMarkdown = pendingImportedMarkdownRef.current;
      if (importedMarkdown !== null) {
        if (!createdDocument) throw new Error(t("markwisely.importCreateFailed"));
        pendingImportedMarkdownRef.current = null;
        setEditorValue(targetKey, importedMarkdown, createdDocument.documentId);
        setEditorRevision((revision) => revision + 1);
      }
      setView("edit");
      if (importedMarkdown !== null && createdDocument) await saveDocument(targetKey, createdDocument.documentId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const openMarkdownPicker = async (from: "file" | "folder" | "workspace-root") => {
    if (dirty && !(await save())) return;
    setError(null);
    setFilePickerReturnView(view === "edit" ? "edit" : "start");
    setView(from === "file" ? "open" : from === "workspace-root" ? "workspace-folder" : "open-folder");
  };

  const openSidebarPath = async (path: string) => {
    if (dirty && !(await save())) return;
    await openPath(path);
  };

  useEffect(() => {
    if (view !== "edit") return;
    const onEditorShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        void save();
      } else if (key === "o") {
        event.preventDefault();
        void openMarkdownPicker("file");
      }
    };
    window.addEventListener("keydown", onEditorShortcut);
    return () => window.removeEventListener("keydown", onEditorShortcut);
  }, [view, save, document?.documentId, dirty]);

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

  const exportMarkWiselyDocument = async (format: string) => {
    setExportMenuOpen(false);
    const latest = flushPreviewEditor(flushId);
    const current = useMarkWiselyStore.getState().getDocument(targetKey);
    const content = latest ?? current?.text;
    if (content == null || !current) return;
    setError(null);
    setBusy(true);
    try {
      const stem = (current.path.split(/[\\/]/).pop() || "document.md").replace(/\.(md|markdown)$/i, "");
      const extension = format;
      const filterName = format === "html"
        ? t("markwisely.htmlFiles")
        : format === "pdf" ? t("markwisely.pdfFiles") : format === "docx" ? t("markwisely.wordFiles") : `Pandoc (${format})`;
      const selectedPath = await showSaveDialog({
        title: t("markwisely.exportTitle"),
        defaultPath: `${stem}.${extension}`,
        filters: [{ name: filterName, extensions: [extension] }],
      });
      if (!selectedPath) return;
      const controller = pandocFormats.includes(format) ? new AbortController() : null;
      conversionAbortRef.current = controller;
      setConversionActive(!!controller);
      const path = normalizeMarkWiselyExportPath(selectedPath, extension);
      const parent = parentLocalPath(path);
      const fileName = path.split(/[\\/]/).pop();
      if (!fileName) throw new Error(t("markwisely.exportFailed"));
      const directory = await listLocalDirectory(parent);
      if (!directory.entries.some((entry) => entry.path === path)) {
        await createLocalPath(parent, fileName, "file");
      }
      const exported = await exportMarkdownDocument(format, content, {
        title: current.path.split(/[\\/]/).pop() || fileName,
        ...(pandocFormats.includes(format) ? {
          pandocPath: "detected",
          executor: createTauriPandocExecutor(invoke),
          ...(controller ? { signal: controller.signal } : {}),
        } : {}),
      });
      if (!exported.ok) throw new Error(exported.error);
      if (exported.mimeType === "text/html" || exported.mimeType === "text/markdown") {
        await writeLocalText(path, new TextDecoder().decode(exported.bytes));
      } else {
        await writeLocalBytes(path, exported.bytes);
      }
      useToastStore.getState().pushToast(t("markwisely.exported", { path }), true);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      if (message.toLowerCase().includes("cancelled")) {
        setError(t("markwisely.conversionCancelled"));
      } else {
        setError(message);
        useToastStore.getState().pushToast(t("markwisely.exportFailed"), false);
      }
    } finally {
      conversionAbortRef.current = null;
      setConversionActive(false);
      setBusy(false);
    }
  };

  const editorHeaderActions = view === "edit" && document ? (
    <div className="markwisely-window-header-tools" data-testid="markwisely-window-header-tools">
      <button type="button" className="markwisely-header-control" aria-pressed={editorPreferences.sidebarVisible} aria-label={t(editorPreferences.sidebarVisible ? "markwisely.hideSidebar" : "markwisely.showSidebar")} title={t(editorPreferences.sidebarVisible ? "markwisely.hideSidebar" : "markwisely.showSidebar")} onClick={() => updateEditorPreferences({ sidebarVisible: !editorPreferences.sidebarVisible })} data-testid="markwisely-sidebar-toggle"><PanelLeft aria-hidden="true" size={16} /></button>
      <button type="button" className="markwisely-header-control" aria-pressed={sourceMode} aria-label={t(sourceMode ? "markwisely.wysiwygMode" : "markwisely.sourceMode")} title={t(sourceMode ? "markwisely.wysiwygMode" : "markwisely.sourceMode")} onClick={() => setSourceMode((mode) => !mode)} data-testid="markwisely-view-mode-toggle"><Code2 aria-hidden="true" size={16} /></button>
      <button type="button" className="markwisely-header-control markwisely-header-menu-trigger" aria-expanded={actionsMenuOpen} aria-label={t("markwisely.documentActions")} title={t("markwisely.documentActions")} onClick={() => setActionsMenuOpen((open) => !open)} data-testid="markwisely-document-actions"><ChevronDown aria-hidden="true" size={16} /></button>
      {actionsMenuOpen ? <div className="markwisely-action-menu markwisely-header-menu" role="menu" data-testid="markwisely-action-menu">
        <div className="markwisely-action-menu-divider" />
        <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); void openMarkdownPicker("file"); }}><FileText aria-hidden="true" size={15} />{t("markwisely.toolbarOpen")}</button>
        <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); void openMarkdownPicker("folder"); }}><FolderOpen aria-hidden="true" size={15} />{t("markwisely.toolbarOpenFolder")}</button>
        <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); void save(); }}><Save aria-hidden="true" size={15} />{t("markwisely.toolbarSave")}</button>
        <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); beginSaveAs(); }}><FilePlus2 aria-hidden="true" size={15} />{t("markwisely.toolbarSaveAs")}</button>
        <button type="button" role="menuitem" onClick={() => { setActionsMenuOpen(false); setExportMenuOpen(true); }}><FileDown aria-hidden="true" size={15} />{t("markwisely.toolbarExport")}</button>
        {pandocInputFormats.length ? <button type="button" role="menuitem" data-testid="markwisely-import-document" onClick={() => { setActionsMenuOpen(false); void importIntoNewDocument(); }}><Import aria-hidden="true" size={15} />{t("markwisely.importTitle")}</button> : null}
      </div> : null}
    </div>
  ) : undefined;
  const editorTrailingActions = view === "edit" && document ? (
    <button
      type="button"
      className="markwisely-header-control markwisely-outline-header-control"
      aria-pressed={outlineOpen}
      aria-label={t(outlineOpen ? "markwisely.hideOutline" : "markwisely.showOutline")}
      title={t(outlineOpen ? "markwisely.hideOutline" : "markwisely.showOutline")}
      onClick={() => setOutlineOpen((open) => !open)}
      data-testid="markwisely-outline-toggle"
    ><PanelRight aria-hidden="true" size={16} /></button>
  ) : undefined;
  const editorHeaderTabs = view === "edit" && document && openDocuments.length > 1 ? (
    <MarkWiselyDocumentTabs
      documents={openDocuments}
      activeDocumentId={activeDocumentId}
      tabsLabel={t("markwisely.documentTabs")}
      unsavedLabel={t("markwisely.unsaved")}
      closeLabel={t("markwisely.closeDocument")}
      onActivate={(documentId) => void activateTab(documentId)}
      onClose={(documentId) => void closeTab(documentId)}
    />
  ) : undefined;

  return (
    <DesktopAppWindow
      appId="markwisely"
      title={t("desktop.appMarkWisely")}
      headerTabs={editorHeaderTabs}
      headerLeadingActions={editorHeaderActions}
      headerActions={editorTrailingActions}
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
        <div className={`markwisely-editor-view editor-theme-${editorPreferences.theme}${editorPreferences.focusMode ? " is-focus-mode" : ""}${editorPreferences.typewriterMode ? " is-typewriter-mode" : ""}${editorPreferences.sidebarVisible ? " is-sidebar-visible" : ""}`} data-editor-theme={editorPreferences.theme} data-testid="markwisely-editor-view">
          {scopedEditorCss ? <style id="markwisely-custom-editor-css">{scopedEditorCss}</style> : null}
          {document.recoveryText !== null ? (
            <div className="markwisely-recovery-banner" role="alert" data-testid="markwisely-recovery-banner">
              <span>{t("markwisely.recoveryAvailable", { path: document.path })}</span>
              <button type="button" onClick={() => restoreDraft(targetKey, document.documentId)}>
                {t("markwisely.restoreDraft")}
              </button>
              <button type="button" onClick={() => discardDraft(targetKey, document.documentId)}>
                {t("markwisely.discardDraft")}
              </button>
            </div>
          ) : null}
          {error || document.error ? <div className="markwisely-error" role="alert">{error ?? document.error}</div> : null}
          <div className="markwisely-workspace">
            {editorPreferences.sidebarVisible ? <MarkWiselySidebar
              key={targetKey}
              target={activeTarget}
              sessionId={activeTarget.kind === "ssh" ? sessionId : undefined}
              root={workspaceRoot}
              recents={recents}
              onChooseRoot={() => void openMarkdownPicker("workspace-root")}
              onOpen={(path) => void openSidebarPath(path)}
            /> : null}
            <div className="markwisely-editor-workbench">
              <div className="markwisely-editor">
                <MarkdownWysiwygEditor
                  key={`${document.documentId}:${editorRevision}`}
                  tabId={flushId}
                  sessionId={document.sessionId ?? undefined}
                  localFileSystem={document.target.kind === "local"}
                  preserveCompatibility
                  viewMode={sourceMode ? "source" : "wysiwyg"}
                  hideToolbar
                  enableContextMenu
                  storeClipboardImages
                  typewriterMode={editorPreferences.typewriterMode}
                  spellcheck={editorPreferences.spellcheck}
                  filePath={document.path}
                  text={document.text}
                  editable
                  toolbarActions={[]}
                  onChange={(value) => { setError(null); setEditorValue(targetKey, value, document.documentId); }}
                />
              </div>
            </div>
            {outlineOpen ? <MarkWiselyOutlinePanel
              documentText={document.text}
              onNavigateToHeading={(index) => {
                const editable = Array.from(globalThis.document.querySelectorAll<HTMLElement>(".markwisely-editor .vditor-ir .vditor-reset[contenteditable='true']")).find((element) => element.getClientRects().length > 0);
                const heading = editable?.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6")[index];
                heading?.scrollIntoView({ block: "start", behavior: "smooth" });
              }}
            /> : null}
          </div>
          {exportMenuOpen ? (
            <div className="markwisely-export-menu" role="group" aria-label={t("markwisely.exportTitle")} data-testid="markwisely-export-menu">
              <button type="button" onClick={() => void exportMarkWiselyDocument("html")} disabled={busy}>HTML</button>
              <button type="button" onClick={() => void exportMarkWiselyDocument("pdf")} disabled={busy}>PDF</button>
              <button type="button" onClick={() => void exportMarkWiselyDocument("docx")} disabled={busy}>{t("markwisely.exportWord")}</button>
              {pandocFormats.length ? (
                <details className="markwisely-pandoc-formats">
                  <summary>{t("markwisely.pandocFormats")}</summary>
                  {pandocFormats.filter((format) => !["markdown", "html", "pdf", "docx"].includes(format)).map((format) => (
                    <button key={format} type="button" onClick={() => void exportMarkWiselyDocument(format)} disabled={busy}>{format}</button>
                  ))}
                </details>
              ) : <span className="markwisely-pandoc-hint">{t("markwisely.pandocUnavailable")}</span>}
            </div>
          ) : null}
          {document.saving || busy || dirty || showSavedFlash ? <span className={`markwisely-save-state${dirty ? " is-dirty" : ""}`} role="status" data-testid="markwisely-save-status">
            {document.saving || busy ? t("markwisely.saving") : dirty ? t("markwisely.unsaved") : t("markwisely.saved")}
          </span> : null}
          {conversionActive ? (
            <button type="button" className="markwisely-conversion-cancel" onClick={() => conversionAbortRef.current?.abort()} data-testid="markwisely-conversion-cancel">
              {t("markwisely.cancelConversion")}
            </button>
          ) : null}
          <span className="markwisely-statistics" role="status" data-testid="markwisely-statistics">
            {t("markwisely.statistics", { ...statistics })}
          </span>
        </div>
      ) : view === "create" || view === "save-as" ? (
        <section className="markwisely-form-view" data-testid="markwisely-create-view">
          <button type="button" className="markwisely-back" onClick={() => { if (pendingImportedMarkdownRef.current !== null) pendingImportedMarkdownRef.current = null; setView(view === "save-as" ? "edit" : "start"); }}>{t("markwisely.back")}</button>
          <h2>{t(view === "save-as" ? "markwisely.saveAsTitle" : "markwisely.newTitle")}</h2>
          <label>{t("markwisely.folderLabel")}
            <div className="markwisely-folder-row"><input aria-label={t("markwisely.folderLabel")} value={parentDir} onChange={(event) => setParentDir(event.target.value)} /><button type="button" onClick={() => { if (view === "save-as") setView("save-as-folder"); else { setFolderDialogReturnView("create"); setView("create-folder"); } }} aria-label={t("markwisely.chooseFolder")}><FolderOpen aria-hidden="true" /></button></div>
          </label>
          <label>{t("markwisely.fileNameLabel")}<input data-testid="markwisely-file-name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          {error ? <div className="markwisely-error" role="alert">{error}</div> : null}
          <div className="markwisely-form-actions"><button type="button" className="markwisely-back" onClick={() => { if (pendingImportedMarkdownRef.current !== null) pendingImportedMarkdownRef.current = null; setView(view === "save-as" ? "edit" : "start"); }}>{t("markwisely.cancel")}</button><button type="button" className="markwisely-primary" data-testid={view === "save-as" ? "markwisely-save-as-submit" : "markwisely-create-submit"} disabled={busy || !folderReady || !parentDir.trim() || !name.trim()} onClick={() => void (view === "save-as" ? createSaveAs() : createFile())}>{busy ? t("markwisely.creating") : t(view === "save-as" ? "markwisely.saveAs" : "markwisely.create")}</button></div>
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
      {view === "create-folder" || view === "open-folder" || view === "open" || view === "workspace-folder" || view === "save-as-folder" ? (
        <div className="markwisely-open-backdrop" data-testid={view === "open" ? "markwisely-open-backdrop" : "markwisely-folder-backdrop"}>
          <MarkWiselyFilePicker
            key={`${view}:${parentDir}`}
            sessionId={activeTarget.kind === "ssh" ? sessionId : undefined}
            target={activeTarget}
            mode={view === "open" ? "file" : "directory"}
            initialPath={view === "workspace-folder" ? workspaceRoot : view === "open" ? parentDir : parentDir || undefined}
            onCancel={() => setView(view === "create-folder" ? folderDialogReturnView : view === "save-as-folder" || view === "workspace-folder" ? "edit" : filePickerReturnView)}
            onSelect={(path) => {
              if (view === "workspace-folder") {
                setWorkspaceRoots((roots) => ({ ...roots, [targetKey]: path }));
                setView("edit");
              } else if (view === "create-folder" || view === "open-folder" || view === "save-as-folder") {
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
