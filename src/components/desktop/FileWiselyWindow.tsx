import { useEffect, useMemo, useState } from "react";
import { PanelLeft, Save } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { DesktopTarget } from "../../lib/desktopTarget";
import { desktopTargetKey } from "../../lib/desktopTarget";
import { fileWiselyViewForPath } from "../../lib/fileWiselyRouting";
import { useEditorWiselyStore, type EditorDocument } from "../../stores/editorWiselyStore";
import { useMarkWiselyStore } from "../../stores/markWiselyStore";
import { previewTabId } from "../../stores/previewTypes";
import { usePreviewStore } from "../../stores/previewStore";
import { DesktopAppWindow } from "./DesktopAppWindow";
import { EditorWiselyTree } from "./EditorWiselyTree";
import { EditorWiselyWindow } from "./EditorWiselyWindow";
import { MarkWiselyWindow } from "./MarkWiselyWindow";
import { NativePdfPreview } from "../preview/NativePdfPreview";
import { OfvReadonlyPreview } from "../preview/OfvReadonlyPreview";

const EMPTY_EDITOR_DOCUMENTS: EditorDocument[] = [];

/** Unified file workspace that routes into the existing editor document stores. */
export function FileWiselyWindow({ target }: { target: DesktopTarget }) {
  const { t } = useTranslation("tools");
  const key = desktopTargetKey(target);
  const editorDocs = useEditorWiselyStore((state) => state.docs[key] ?? EMPTY_EDITOR_DOCUMENTS);
  const editorActiveId = useEditorWiselyStore((state) => state.active[key] ?? null);
  const markdownDocument = useMarkWiselyStore((state) => {
    const activeId = state.activeDocumentIds[key];
    return state.openDocuments[key]?.find((document) => document.documentId === activeId) ?? null;
  });
  const activeEditorPath = editorDocs.find((document) => document.id === editorActiveId)?.path ?? null;
  const [activePath, setActivePath] = useState<string | null>(activeEditorPath ?? markdownDocument?.path ?? null);
  const [treeOpen, setTreeOpen] = useState(true);
  const remotePreviewTabId = target.kind === "ssh" && activePath ? previewTabId(target.sessionId, activePath) : null;
  const remotePreview = usePreviewStore((state) => remotePreviewTabId ? state.tabs.find((tab) => tab.id === remotePreviewTabId) ?? null : null);
  const view = useMemo(() => activePath ? fileWiselyViewForPath(activePath) : "editor", [activePath]);

  useEffect(() => {
    const storePath = view === "markdown" ? markdownDocument?.path : activeEditorPath;
    if (storePath && storePath !== activePath) setActivePath(storePath);
  }, [activeEditorPath, activePath, markdownDocument?.path, view]);

  const openPath = async (path: string) => {
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
      appId="editorwisely"
      title="FileWisely"
      panelTestId="editorwisely-window"
      floatTestId="editorwisely-window-float"
      minimizeTestId="editorwisely-minimize"
      maximizeTestId="editorwisely-maximize"
      closeTestId="editorwisely-close"
      bodyClassName="filewisely-window"
      showWindowTitle
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
          {view === "editor" ? <button type="button" className="preview-toolbar-icon" title={t("editor.save")} aria-label={t("editor.save")} onClick={() => void useEditorWiselyStore.getState().save(target)} disabled={!activeEditorPath || editorDocs.find((document) => document.path === activeEditorPath)?.text === editorDocs.find((document) => document.path === activeEditorPath)?.savedText}><Save size={16} /></button> : null}
        </>
      )}
    >
      <div className="filewisely-workspace" data-testid="filewisely-workspace">
        {treeOpen ? <EditorWiselyTree target={target} activePath={activePath} onOpen={(path) => void openPath(path)} /> : null}
        <main className="filewisely-content" data-file-kind={view}>
          {view === "editor" ? <EditorWiselyWindow target={target} embedded /> : null}
          {view === "markdown" ? <MarkWiselyWindow target={target} sessionId={target.kind === "ssh" ? target.sessionId : undefined} hostKey={target.kind === "ssh" ? target.sessionId : "local"} embedded /> : null}
          {view === "preview" && activePath?.toLowerCase().endsWith(".pdf") ? <div data-testid="filewisely-native-pdf">{target.kind === "local" ? <NativePdfPreview path={activePath} fileName={activePath.split(/[\\/]/).pop() ?? activePath} /> : remotePreview?.loading ? <div role="status">加载预览…</div> : remotePreview?.error ? <div role="alert">{remotePreview.error}</div> : remotePreview?.data?.local_cache_path ? <NativePdfPreview path={remotePreview.data.local_cache_path} fileName={remotePreview.data.filename} /> : <div role="status">等待预览资源…</div>}</div> : null}
          {view === "preview" && !activePath?.toLowerCase().endsWith(".pdf") ? <div data-testid="filewisely-image-preview">{target.kind === "local" ? <OfvReadonlyPreview path={activePath ?? ""} fileName={activePath?.split(/[\\/]/).pop() ?? ""} /> : remotePreview?.loading ? <div role="status">加载预览…</div> : remotePreview?.error ? <div role="alert">{remotePreview.error}</div> : remotePreview?.data?.local_cache_path ? <OfvReadonlyPreview path={remotePreview.data.local_cache_path} fileName={remotePreview.data.filename} /> : <div role="status">等待预览资源…</div>}</div> : null}
          {view === "unsupported" ? <div className="filewisely-message" role="status">无法预览此文件</div> : null}
        </main>
      </div>
    </DesktopAppWindow>
  );
}
