import { useEffect, useRef, useState } from "react";
import { save as showSaveDialog } from "@tauri-apps/plugin-dialog";
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { closeBrackets } from "@codemirror/autocomplete";
import { defaultHighlightStyle, syntaxHighlighting, indentOnInput } from "@codemirror/language";
import { search, searchKeymap, openSearchPanel } from "@codemirror/search";
import { useTranslation } from "react-i18next";
import { Save, Search, FolderOpen, PanelLeft } from "lucide-react";
import type { DesktopTarget } from "../../lib/desktopTarget";
import { desktopTargetKey } from "../../lib/desktopTarget";
import { editorLanguageExtension } from "../../lib/editorWiselyLanguages";
import { editorWiselyDirectoryForPath, readEditorWiselyRecents } from "../../lib/editorWiselyRecents";
import { useEditorWiselyStore, type EditorDocument } from "../../stores/editorWiselyStore";
import { useDesktopStore } from "../../stores/desktopStore";
import { DesktopAppWindow } from "./DesktopAppWindow";
import { EditorWiselyIcon } from "../WorkspaceToolIcons";
import { MarkWiselyFilePicker } from "./MarkWiselyFilePicker";
import { EditorWiselyTree } from "./EditorWiselyTree";
import "./EditorWiselyWindow.css";

const EMPTY_DOCUMENTS: EditorDocument[] = [];

export function EditorWiselyWindow({ target, unified = false }: { target: DesktopTarget; unified?: boolean }) {
  const { t } = useTranslation("tools");
  const key = desktopTargetKey(target);
  const docs = useEditorWiselyStore((s) => s.docs[key] ?? EMPTY_DOCUMENTS);
  const activeId = useEditorWiselyStore((s) => s.active[key] ?? null);
  const active = docs.find((d) => d.id === activeId) ?? null;
  const edit = useEditorWiselyStore((s) => s.edit);
  const save = useEditorWiselyStore((s) => s.save);
  const saveAsLocal = useEditorWiselyStore((s) => s.saveAsLocal);
  const activate = useEditorWiselyStore((s) => s.activate);
  const close = useEditorWiselyStore((s) => s.close);
  const closeApp = useDesktopStore((s) => s.closeApp);
  const host = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const [cursor, setCursor] = useState({ line: 1, col: 1 });
  const [confirmClose, setConfirmClose] = useState<string | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [treeOpen, setTreeOpen] = useState(unified);
  const [recentPaths, setRecentPaths] = useState(() => readEditorWiselyRecents(target));
  const dirty = docs.some((d) => d.text !== d.savedText);

  useEffect(() => {
    setRecentPaths(readEditorWiselyRecents(target));
  }, [key, docs.length, active?.path, target]);

  const openPath = async (path: string) => {
    await useEditorWiselyStore.getState().open(target, path);
    setRecentPaths(readEditorWiselyRecents(target));
    setPickerOpen(false);
  };
  const saveAs = async (doc: EditorDocument) => {
    const selectedPath = await showSaveDialog({ title: t("editor.saveAs"), defaultPath: doc.path });
    if (selectedPath) await saveAsLocal(doc.id, selectedPath);
  };

  useEffect(() => {
    if (!host.current || !active || active.loading) return;
    viewRef.current?.destroy();
    const lang = editorLanguageExtension(active.language);
    const state = EditorState.create({ doc: active.text, extensions: [lineNumbers(), highlightActiveLine(), highlightActiveLineGutter(), history(), closeBrackets(), indentOnInput(), syntaxHighlighting(defaultHighlightStyle, { fallback: true }), search(), ...(lang ? [lang] : []), keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]), EditorView.updateListener.of((update) => { if (update.docChanged) edit(target, active.id, update.state.doc.toString()); if (update.selectionSet) { const pos = update.state.selection.main.head; const line = update.state.doc.lineAt(pos); setCursor({ line: line.number, col: pos - line.from + 1 }); } }), EditorView.theme({ "&": { height: "100%", fontSize: "14px" }, ".cm-scroller": { overflow: "auto", fontFamily: "var(--font-mono, monospace)" } })] });
    viewRef.current = new EditorView({ state, parent: host.current });
    return () => { viewRef.current?.destroy(); viewRef.current = null; };
  }, [active?.id, active?.loading, target, edit]);

  useEffect(() => {
    if (!active || active.text === active.savedText || active.saving || active.error) return;
    const timeout = window.setTimeout(() => { void save(target, active.id); }, 800);
    return () => window.clearTimeout(timeout);
  }, [active?.id, active?.text, active?.savedText, active?.saving, active?.error, target, save]);

  const requestClose = (id: string) => { const doc = docs.find((d) => d.id === id); if (doc && doc.text !== doc.savedText) setConfirmClose(id); else close(target, id); };
  return <DesktopAppWindow appId="editorwisely" title={unified ? "FileWisely" : "EditorWisely"} leading={<EditorWiselyIcon />} panelTestId="editorwisely-window" floatTestId="editorwisely-window-float" minimizeTestId="editorwisely-minimize" maximizeTestId="editorwisely-maximize" closeTestId="editorwisely-close" bodyClassName={unified ? "editorwisely-window filewisely-window" : "editorwisely-window"} onCloseRequest={() => { if (dirty) { const id = active?.id; if (id) setConfirmClose(id); return false; } closeApp("editorwisely"); return true; }} headerLeadingActions={<div className="editorwisely-tabs" role="tablist">{docs.map((doc) => <span className={`editorwisely-tab${doc.id === activeId ? " active" : ""}`} key={doc.id}><button role="tab" aria-selected={doc.id === activeId} onClick={() => activate(target, doc.id)}>{doc.path.split(/[\\/]/).pop()} {doc.text !== doc.savedText ? "●" : ""}</button><button aria-label={t("editor.closeDocument", { name: doc.path.split(/[\\/]/).pop() })} onClick={() => requestClose(doc.id)}>×</button></span>)}</div>} headerActions={<><button type="button" className="preview-toolbar-icon" title={t(treeOpen ? "editor.hideTree" : "editor.showTree")} aria-label={t(treeOpen ? "editor.hideTree" : "editor.showTree")} aria-pressed={treeOpen} data-testid="editorwisely-tree-toggle" onClick={() => setTreeOpen((open) => !open)}><PanelLeft size={16}/></button><button className="preview-toolbar-icon" title={t("editor.find")} aria-label={t("editor.find")} onClick={() => { if (viewRef.current) openSearchPanel(viewRef.current); }}><Search size={16}/></button><button className="preview-toolbar-icon" title={t("editor.save")} aria-label={t("editor.save")} onClick={() => void save(target)} disabled={!active || active.text === active.savedText}><Save size={16}/></button></>}>
    <div className="editorwisely-workspace">
      {treeOpen ? <EditorWiselyTree target={target} activePath={active?.path ?? null} onOpen={(path) => void openPath(path)} /> : null}
      <main className="editorwisely-main">
        <div className="editorwisely-toolbar"><span>{active?.path ?? t("editor.empty")}</span><span>{active?.loading ? t("editor.loading") : active?.saving ? t("editor.saving") : active && active.text === active.savedText ? t("editor.saved") : t("editor.unsaved")}</span></div>
        {active?.error ? <div role="alert" className="editorwisely-error">{t(`editor.error.${active.error}`, { defaultValue: active.error })}{target.kind === "local" ? <button type="button" data-testid="editorwisely-save-as" onClick={() => void saveAs(active)}>{t("editor.saveAs")}</button> : null}</div> : null}
        {active ? active.loading ? <div className="editorwisely-loading" role="status">{t("editor.loading")}</div> : <div className="editorwisely-cm" ref={host} data-testid="editorwisely-editor"/> : <section className="editorwisely-home" data-testid="editorwisely-home"><header><EditorWiselyIcon/><div><h2>EditorWisely</h2><p>{t("editor.subtitle")}</p></div></header><button type="button" data-testid="editorwisely-open-document" onClick={() => setPickerOpen(true)}><FolderOpen/><span>{t("editor.openDocument")}</span></button><section><h3>{t("editor.recentTitle")}</h3>{recentPaths.length ? recentPaths.map((path) => <button type="button" className="editorwisely-recent" key={path} onClick={() => void openPath(path)}><strong>{path.split(/[\\/]/).pop()}</strong><small>{path}</small></button>) : <p>{t("editor.noRecentFiles")}</p>}</section></section>}
        {active ? <footer className="editorwisely-status"><span>{active.language}</span><span>Ln {cursor.line}, Col {cursor.col}</span><span>UTF-8{active.format.bom ? " BOM" : ""}</span><span>{active.format.newline === "\r\n" ? "CRLF" : "LF"}</span></footer> : null}
      </main>
    </div>
    {confirmClose ? <div className="editorwisely-confirm" role="dialog" aria-modal="true"><p>{t("editor.unsavedClose")}</p><button onClick={() => setConfirmClose(null)}>{t("editor.cancel")}</button><button onClick={() => { close(target, confirmClose); setConfirmClose(null); }}>{t("editor.discard")}</button><button onClick={async () => { const id = confirmClose; await save(target, id); const state = useEditorWiselyStore.getState(); const doc = state.docs[key]?.find((d) => d.id === id); if (doc && doc.text === doc.savedText) close(target, id); setConfirmClose(null); }}>{t("editor.save")}</button></div> : null}
    {pickerOpen ? <div className="markwisely-open-backdrop"><MarkWiselyFilePicker key={`editor:${key}`} target={target} sessionId={target.kind === "ssh" ? target.sessionId : undefined} mode="file" fileFilter="text" initialPath={editorWiselyDirectoryForPath(readEditorWiselyRecents(target)[0])} onCancel={() => setPickerOpen(false)} onSelect={(path) => void openPath(path)} /></div> : null}
  </DesktopAppWindow>;
}
