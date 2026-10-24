import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";
import "./MarkWiselyWindow.css";
import { DesktopAppWindow } from "./DesktopAppWindow";
import { MarkWiselyFilePicker } from "./MarkWiselyFilePicker";
import { MarkdownWysiwygEditor } from "../preview/MarkdownWysiwygEditor";
import { flushPreviewEditor } from "../../lib/previewEditorFlush";
import { useDesktopStore } from "../../stores/desktopStore";
import { useMarkWiselyStore } from "../../stores/markWiselyStore";

type Props = { sessionId: string; hostKey: string; sessionTitle?: string | null };
type View = "start" | "create" | "create-folder" | "open" | "edit";
const EMPTY_RECENTS: ReturnType<ReturnType<typeof useMarkWiselyStore.getState>["getRecentFiles"]> = [];

export function MarkWiselyWindow({ sessionId, hostKey, sessionTitle }: Props) {
  const { t } = useTranslation("tools");
  const [view, setView] = useState<View>("start");
  const [parentDir, setParentDir] = useState("/home");
  const [folderReady, setFolderReady] = useState(false);
  const [name, setName] = useState("未命名.md");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const document = useMarkWiselyStore((state) => state.documents[sessionId]);
  const recents = useMarkWiselyStore((state) => state.recentFiles[hostKey] ?? EMPTY_RECENTS);
  const openDocument = useMarkWiselyStore((state) => state.openDocument);
  const createDocument = useMarkWiselyStore((state) => state.createDocument);
  const setEditorValue = useMarkWiselyStore((state) => state.setEditorValue);
  const saveDocument = useMarkWiselyStore((state) => state.saveDocument);
  const closeDocument = useMarkWiselyStore((state) => state.closeDocument);
  const dirty = !!document && document.text !== document.savedText;
  const flushId = useMemo(() => `markwisely-${sessionId}`, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    setFolderReady(false);
    setParentDir("");
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
  }, [sessionId]);

  const requestNavigation = useCallback((action: () => void) => {
    if (dirty) {
      setPendingAction(() => action);
      setConfirmDiscard(true);
      return;
    }
    void closeDocument(sessionId);
    action();
  }, [closeDocument, dirty, sessionId]);

  const handleCloseRequest = useCallback(async () => {
    if (dirty) {
      setPendingAction(null);
      setConfirmDiscard(true);
      return false;
    }
    await closeDocument(sessionId);
    return true;
  }, [closeDocument, dirty, sessionId]);

  const confirmLeave = async () => {
    await closeDocument(sessionId);
    setConfirmDiscard(false);
    if (pendingAction) {
      const action = pendingAction;
      setPendingAction(null);
      action();
    } else {
      useDesktopStore.getState().closeApp("markwisely");
    }
  };

  const openPath = async (path: string) => {
    setBusy(true);
    setError(null);
    try {
      await openDocument({ sessionId, hostKey, path });
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
      await createDocument({ sessionId, hostKey, path: fullPath, parentDir, name: fileName });
      setView("edit");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    const latest = flushPreviewEditor(flushId);
    if (latest !== null) setEditorValue(sessionId, latest);
    setBusy(true);
    setError(null);
    try {
      await saveDocument(sessionId);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  };

  return (
    <DesktopAppWindow
      appId="markwisely"
      title={t("desktop.appMarkWisely")}
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
          <header className="markwisely-toolbar">
            <button type="button" className="markwisely-back" onClick={() => requestNavigation(() => setView("start"))}>{t("markwisely.allDocuments")}</button>
            <strong className="markwisely-current-file" title={document.path}>{document.path.split("/").pop()}</strong>
            <span className={`markwisely-save-state${dirty ? " is-dirty" : ""}`} role="status">
              {document.saving || busy ? t("markwisely.saving") : dirty ? t("markwisely.unsaved") : t("markwisely.saved")}
            </span>
            <button type="button" className="markwisely-primary" data-testid="markwisely-save" disabled={!dirty || busy} onClick={() => void save()}>{t("markwisely.save")}</button>
          </header>
          {error || document.error ? <div className="markwisely-error" role="alert">{error ?? document.error}</div> : null}
          <div className="markwisely-editor">
            <MarkdownWysiwygEditor
              tabId={flushId}
              sessionId={sessionId}
              filePath={document.path}
              text={document.text}
              editable
              onChange={(value) => setEditorValue(sessionId, value)}
            />
          </div>
        </div>
      ) : view === "open" || view === "create-folder" ? (
        <MarkWiselyFilePicker
          sessionId={sessionId}
          mode={view === "open" ? "file" : "directory"}
          onCancel={() => setView(view === "open" ? "start" : "create")}
          onSelect={(path) => {
            if (view === "create-folder") {
              setParentDir(path);
              setView("create");
            } else {
              void openPath(path);
            }
          }}
        />
      ) : view === "create" ? (
        <section className="markwisely-form-view" data-testid="markwisely-create-view">
          <button type="button" className="markwisely-back" onClick={() => setView("start")}>{t("markwisely.back")}</button>
          <h2>{t("markwisely.newTitle")}</h2>
          <label>{t("markwisely.folderLabel")}
            <div className="markwisely-folder-row"><input aria-label={t("markwisely.folderLabel")} value={parentDir} onChange={(event) => setParentDir(event.target.value)} /><button type="button" onClick={() => setView("create-folder")} aria-label={t("markwisely.chooseFolder")}>…</button></div>
          </label>
          <label>{t("markwisely.fileNameLabel")}<input data-testid="markwisely-file-name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          {error ? <div className="markwisely-error" role="alert">{error}</div> : null}
          <div className="markwisely-form-actions"><button type="button" className="markwisely-back" onClick={() => setView("start")}>{t("markwisely.cancel")}</button><button type="button" className="markwisely-primary" data-testid="markwisely-create-submit" disabled={busy || !folderReady || !parentDir.trim() || !name.trim()} onClick={() => void createFile()}>{busy ? t("markwisely.creating") : t("markwisely.create")}</button></div>
        </section>
      ) : (
        <section className="markwisely-home" data-testid="markwisely-home">
          <div className="markwisely-home-heading"><span className="markwisely-brand-mark">M</span><div><h2>MarkWisely</h2><p>{t("markwisely.subtitle")}</p></div></div>
          <div className="markwisely-home-actions">
            <button type="button" className="markwisely-primary" data-testid="markwisely-new-document" onClick={() => { setError(null); setView("create"); }}>{t("markwisely.newDocument")}</button>
            <button type="button" className="markwisely-secondary" data-testid="markwisely-open-document" onClick={() => { setError(null); setView("open"); }}>{t("markwisely.openDocument")}</button>
          </div>
          {error ? <div className="markwisely-error" role="alert">{error}</div> : null}
          <section className="markwisely-recents" aria-labelledby="markwisely-recents-title">
            <h3 id="markwisely-recents-title">{t("markwisely.recentTitle")}</h3>
            {recents.length === 0 ? <p className="markwisely-empty">{t("markwisely.noRecentFiles")}</p> : recents.map((recent) => (
              <button type="button" key={recent.path} className="markwisely-recent" onClick={() => void openPath(recent.path)} disabled={busy}>
                <span className="markwisely-recent-icon" aria-hidden>▤</span><span><strong>{recent.path.split("/").pop()}</strong><small>{recent.path}</small></span>
              </button>
            ))}
          </section>
        </section>
      )}
      {confirmDiscard ? (
        <div className="markwisely-confirm-backdrop">
          <section className="markwisely-confirm" role="alertdialog" aria-modal="true" aria-labelledby="markwisely-confirm-title">
            <h2 id="markwisely-confirm-title">{t("markwisely.discardTitle")}</h2><p>{t("markwisely.discardMessage")}</p>
            <div className="markwisely-form-actions"><button type="button" className="markwisely-back" onClick={() => { setConfirmDiscard(false); setPendingAction(null); }}>{t("markwisely.keepEditing")}</button><button type="button" className="markwisely-danger" data-testid="markwisely-discard" onClick={() => void confirmLeave()}>{t("markwisely.discard")}</button></div>
          </section>
        </div>
      ) : null}
    </DesktopAppWindow>
  );
}
