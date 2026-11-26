import { useEffect, useMemo, useState } from "react";
import { PanelLeft } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DesktopTarget } from "../../lib/desktopTarget";
import { desktopTargetKey } from "../../lib/desktopTarget";
import { fileWiselyViewForPath } from "../../lib/fileWiselyRouting";
import { useEditorWiselyStore, type EditorDocument } from "../../stores/editorWiselyStore";
import { useMarkWiselyStore, type MarkWiselyDocument } from "../../stores/markWiselyStore";
import { previewTabId } from "../../stores/previewTypes";
import { usePreviewStore } from "../../stores/previewStore";
import { DesktopAppWindow } from "./DesktopAppWindow";
import { EditorWiselyTree } from "./EditorWiselyTree";
import { EditorWiselyWindow } from "./EditorWiselyWindow";
import { MarkWiselyWindow } from "./MarkWiselyWindow";
import { NativePdfPreview } from "../preview/NativePdfPreview";
import { OfvReadonlyPreview } from "../preview/OfvReadonlyPreview";
import { flushPreviewEditor } from "../../lib/previewEditorFlush";
import { useToastStore } from "../../stores/toastStore";
import "./FileWiselyWindow.css";

const EMPTY_EDITOR_DOCUMENTS: EditorDocument[] = [];
const EMPTY_MARKDOWN_DOCUMENTS: MarkWiselyDocument[] = [];

/** Unified file workspace that routes into the existing editor document stores. */
export function FileWiselyWindow({ target }: { target: DesktopTarget }) {
  const { t } = useTranslation("tools");
  const key = desktopTargetKey(target);
  const editorDocs = useEditorWiselyStore((state) => state.docs[key] ?? EMPTY_EDITOR_DOCUMENTS);
  const editorActiveId = useEditorWiselyStore((state) => state.active[key] ?? null);
  const markdownDocuments = useMarkWiselyStore((state) => state.openDocuments[key] ?? EMPTY_MARKDOWN_DOCUMENTS);
  const markdownDocument = useMarkWiselyStore((state) => {
    const activeId = state.activeDocumentIds[key];
    return state.openDocuments[key]?.find((document) => document.documentId === activeId) ?? null;
  });
  const activeEditorPath = editorDocs.find((document) => document.id === editorActiveId)?.path ?? null;
  const [activePath, setActivePath] = useState<string | null>(activeEditorPath ?? markdownDocument?.path ?? null);
  const [welcomeTool, setWelcomeTool] = useState<"editor" | "markdown" | null>(null);
  const [pendingEditorCloseId, setPendingEditorCloseId] = useState<string | null>(null);
  const [treeOpen, setTreeOpen] = useState(true);
  const remotePreviewTabId = target.kind === "ssh" && activePath ? previewTabId(target.sessionId, activePath) : null;
  const remotePreview = usePreviewStore((state) => remotePreviewTabId ? state.tabs.find((tab) => tab.id === remotePreviewTabId) ?? null : null);
  const view = useMemo(() => activePath ? fileWiselyViewForPath(activePath) : welcomeTool ?? "welcome", [activePath, welcomeTool]);
  const fileTabs = [
    ...editorDocs.map((document) => ({ kind: "editor" as const, id: document.id, path: document.path, dirty: document.text !== document.savedText })),
    ...markdownDocuments.map((document) => ({ kind: "markdown" as const, id: document.documentId, path: document.path, dirty: document.text !== document.savedText })),
  ];

  const activateFileTab = (tab: (typeof fileTabs)[number]) => {
    setWelcomeTool(null);
    setActivePath(tab.path);
    if (tab.kind === "editor") useEditorWiselyStore.getState().activate(target, tab.id);
    else useMarkWiselyStore.getState().activateDocument(key, tab.id);
  };

  const syncActivePath = (preferredKind?: "editor" | "markdown") => {
    const editorState = useEditorWiselyStore.getState();
    const activeEditor = (editorState.docs[key] ?? []).find((document) => document.id === editorState.active[key]);
    const markdownState = useMarkWiselyStore.getState();
    const activeMarkdownId = markdownState.activeDocumentIds[key];
    const activeMarkdown = (markdownState.openDocuments[key] ?? []).find((document) => document.documentId === activeMarkdownId);
    const path = preferredKind === "markdown"
      ? activeMarkdown?.path ?? activeEditor?.path ?? null
      : activeEditor?.path ?? activeMarkdown?.path ?? null;
    setActivePath(path);
    if (!path) setWelcomeTool(null);
  };

  const closeFileTab = async (tab: (typeof fileTabs)[number]) => {
    const wasActive = activePath === tab.path;
    if (tab.kind === "editor") {
      if (tab.dirty) {
        setPendingEditorCloseId(tab.id);
        return;
      }
      useEditorWiselyStore.getState().close(target, tab.id);
      if (wasActive) syncActivePath("editor");
      return;
    }
    const latest = flushPreviewEditor(`markwisely-${key}`);
    if (latest !== null) useMarkWiselyStore.getState().setEditorValue(key, latest, tab.id);
    try {
      const current = useMarkWiselyStore.getState().getDocuments(key).find((document) => document.documentId === tab.id);
      if (current && current.text !== current.savedText) await useMarkWiselyStore.getState().saveDocument(key, tab.id);
      await useMarkWiselyStore.getState().closeDocument(key, tab.id);
      if (wasActive) syncActivePath("markdown");
    } catch (error) {
      useToastStore.getState().pushToast(error instanceof Error ? error.message : String(error), false);
    }
  };

  const resolveEditorClose = async (saveChanges: boolean) => {
    if (!pendingEditorCloseId) return;
    const id = pendingEditorCloseId;
    const path = useEditorWiselyStore.getState().docs[key]?.find((item) => item.id === id)?.path;
    const wasActive = path !== undefined && path === activePath;
    if (saveChanges) {
      await useEditorWiselyStore.getState().save(target, id);
      const document = useEditorWiselyStore.getState().docs[key]?.find((item) => item.id === id);
      if (document && document.text !== document.savedText) return;
    }
    useEditorWiselyStore.getState().close(target, id);
    setPendingEditorCloseId(null);
    if (wasActive) syncActivePath("editor");
  };

  useEffect(() => {
    const storePath = view === "markdown" ? markdownDocument?.path : view === "editor" ? activeEditorPath : activeEditorPath ?? markdownDocument?.path;
    if (storePath && storePath !== activePath) setActivePath(storePath);
  }, [activeEditorPath, activePath, markdownDocument?.path, view]);

  const openPath = async (path: string) => {
    setWelcomeTool(null);
    setActivePath(path);
    const nextView = fileWiselyViewForPath(path);
    if (nextView === "markdown") {
      await useMarkWiselyStore.getState().openDocument({
        target,
        sessionId: target.kind === "ssh" ? target.sessionId : undefined,
        hostKey: target.kind === "local" ? "local" : target.sessionId,
        path,
      });
    } else if (nextView === "editor") {
      await useEditorWiselyStore.getState().open(target, path);
    } else if (nextView === "preview" && target.kind === "ssh") {
      const store = usePreviewStore.getState();
      await store.openPreview(target.sessionId, path);
      usePreviewStore.getState().minimizePreview();
    }
  };

  return (
    <DesktopAppWindow
      appId="filewisely"
      title={t("desktop.appFileWisely")}
      panelTestId="editorwisely-window"
      floatTestId="editorwisely-window-float"
      minimizeTestId="editorwisely-minimize"
      maximizeTestId="editorwisely-maximize"
      closeTestId="editorwisely-close"
      bodyClassName="filewisely-window"
      showWindowTitle
      onCloseRequest={async () => {
        const latestMarkdown = flushPreviewEditor(`markwisely-${key}`);
        if (latestMarkdown !== null) {
          const activeId = useMarkWiselyStore.getState().activeDocumentIds[key];
          if (activeId) useMarkWiselyStore.getState().setEditorValue(key, latestMarkdown, activeId);
        }
        try {
          for (const document of useMarkWiselyStore.getState().getDocuments(key)) {
            const current = useMarkWiselyStore.getState().getDocuments(key).find((item) => item.documentId === document.documentId);
            if (current && current.text !== current.savedText) await useMarkWiselyStore.getState().saveDocument(key, current.documentId);
          }
        } catch (error) {
          useToastStore.getState().pushToast(error instanceof Error ? error.message : String(error), false);
          return false;
        }
        for (const document of useEditorWiselyStore.getState().docs[key] ?? []) {
          if (document.text === document.savedText) continue;
          await useEditorWiselyStore.getState().save(target, document.id);
          const saved = useEditorWiselyStore.getState().docs[key]?.find((item) => item.id === document.id);
          if (saved && saved.text !== saved.savedText) return false;
        }
        return true;
      }}
      headerLeadingActions={fileTabs.length ? <div className="editorwisely-tabs filewisely-document-tabs" role="tablist" data-testid="filewisely-document-tabs">{fileTabs.map((tab) => { const name = tab.path.split(/[\\/]/).pop() ?? tab.path; return <span className={`editorwisely-tab${activePath === tab.path ? " active" : ""}`} key={`${tab.kind}:${tab.id}`}><button type="button" role="tab" aria-selected={activePath === tab.path} onClick={() => activateFileTab(tab)}>{name}{tab.dirty ? " ●" : ""}</button><button type="button" aria-label={t(tab.kind === "editor" ? "editor.closeDocument" : "markwisely.closeDocument", { name })} onClick={() => void closeFileTab(tab)}>×</button></span>; })}</div> : undefined}
      headerActions={(
        <>
          <button
            type="button"
            className="preview-toolbar-icon"
            title={t(treeOpen ? "editor.hideTree" : "editor.showTree")}
            aria-label={t(treeOpen ? "editor.hideTree" : "editor.showTree")}
            aria-pressed={treeOpen}
            data-testid="editorwisely-tree-toggle"
            onClick={() => setTreeOpen((open) => !open)}
          ><PanelLeft size={16} /></button>
        </>
      )}
    >
      <div className="filewisely-workspace" data-testid="filewisely-workspace">
        {treeOpen ? <EditorWiselyTree target={target} activePath={activePath} onOpen={(path) => void openPath(path)} /> : null}
        <main className="filewisely-content" data-file-kind={view}>
          {view === "welcome" ? <div className="filewisely-welcome" data-testid="filewisely-welcome"><MarkWiselyWindow target={target} sessionId={target.kind === "ssh" ? target.sessionId : undefined} hostKey={target.kind === "ssh" ? target.sessionId : "local"} embedded showTabs={false} onOpenText={() => setWelcomeTool("editor")} /></div> : null}
          {view === "editor" ? <EditorWiselyWindow target={target} embedded showTabs={false} /> : null}
          {view === "markdown" ? <MarkWiselyWindow target={target} sessionId={target.kind === "ssh" ? target.sessionId : undefined} hostKey={target.kind === "ssh" ? target.sessionId : "local"} embedded showTabs={false} onOpenText={() => setWelcomeTool("editor")} /> : null}
          {view === "preview" && activePath?.toLowerCase().endsWith(".pdf") ? <div className="filewisely-native-pdf" data-testid="filewisely-native-pdf">{target.kind === "local" ? <NativePdfPreview path={activePath} fileName={activePath.split(/[\\/]/).pop() ?? activePath} /> : remotePreview?.loading ? <div role="status">{t("fileWisely.loadingPreview")}</div> : remotePreview?.error ? <div role="alert">{remotePreview.error}</div> : remotePreview?.data?.local_cache_path ? <NativePdfPreview path={remotePreview.data.local_cache_path} fileName={remotePreview.data.filename} /> : <div role="status">{t("fileWisely.waitingPreview")}</div>}</div> : null}
          {view === "preview" && !activePath?.toLowerCase().endsWith(".pdf") ? <div className="filewisely-image-preview" data-testid="filewisely-image-preview">{target.kind === "local" ? <OfvReadonlyPreview path={activePath ?? ""} fileName={activePath?.split(/[\\/]/).pop() ?? ""} /> : remotePreview?.loading ? <div role="status">{t("fileWisely.loadingPreview")}</div> : remotePreview?.error ? <div role="alert">{remotePreview.error}</div> : remotePreview?.data?.local_cache_path ? <OfvReadonlyPreview path={remotePreview.data.local_cache_path} fileName={remotePreview.data.filename} /> : <div role="status">{t("fileWisely.waitingPreview")}</div>}</div> : null}
          {view === "unsupported" ? <div className="filewisely-message" role="status">{t("fileWisely.unsupportedPreview")}</div> : null}
          {pendingEditorCloseId ? <div className="editorwisely-confirm" role="dialog" aria-modal="true"><p>{t("editor.unsavedClose")}</p><button type="button" onClick={() => setPendingEditorCloseId(null)}>{t("editor.cancel")}</button><button type="button" onClick={() => void resolveEditorClose(false)}>{t("editor.discard")}</button><button type="button" onClick={() => void resolveEditorClose(true)}>{t("editor.save")}</button></div> : null}
        </main>
      </div>
    </DesktopAppWindow>
  );
}
