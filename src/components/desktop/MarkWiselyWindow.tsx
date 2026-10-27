import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { FilePlus2, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import "./MarkWiselyWindow.css";
import { DesktopAppWindow } from "./DesktopAppWindow";
import { MarkWiselyFilePicker } from "./MarkWiselyFilePicker";
import { MarkdownWysiwygEditor } from "../preview/MarkdownWysiwygEditor";
import { flushPreviewEditor } from "../../lib/previewEditorFlush";
import { useDesktopStore } from "../../stores/desktopStore";
import { useMarkWiselyStore } from "../../stores/markWiselyStore";
import { MarkWiselyIcon } from "../WorkspaceToolIcons";
import { desktopTargetKey, type DesktopTarget } from "../../lib/desktopTarget";
import { listLocalRoots } from "../../lib/localFsApi";

type Props = { target?: DesktopTarget; sessionId?: string; hostKey?: string; sessionTitle?: string | null };
type View = "start" | "create" | "create-folder" | "open-folder" | "open" | "edit";
const EMPTY_RECENTS: ReturnType<ReturnType<typeof useMarkWiselyStore.getState>["getRecentFiles"]> = [];

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
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [folderDialogReturnView, setFolderDialogReturnView] = useState<"start" | "create">("start");
  const document = useMarkWiselyStore((state) => state.documents[targetKey]);
  const recents = useMarkWiselyStore((state) => state.recentFiles[activeHostKey] ?? EMPTY_RECENTS);
  const openDocument = useMarkWiselyStore((state) => state.openDocument);
  const createDocument = useMarkWiselyStore((state) => state.createDocument);
  const setEditorValue = useMarkWiselyStore((state) => state.setEditorValue);
  const saveDocument = useMarkWiselyStore((state) => state.saveDocument);
  const closeDocument = useMarkWiselyStore((state) => state.closeDocument);
  const dirty = !!document && document.text !== document.savedText;
  const flushId = useMemo(() => `markwisely-${targetKey}`, [targetKey]);

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

  const requestNavigation = useCallback((action: () => void) => {
    if (dirty) {
      setPendingAction(() => action);
      setConfirmDiscard(true);
      return;
    }
    void closeDocument(targetKey);
    action();
  }, [closeDocument, dirty, targetKey]);

  const handleCloseRequest = useCallback(async () => {
    if (dirty) {
      setPendingAction(null);
      setConfirmDiscard(true);
      return false;
    }
    await closeDocument(targetKey);
    return true;
  }, [closeDocument, dirty, targetKey]);

  const confirmLeave = async () => {
    await closeDocument(targetKey);
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

  const save = async () => {
    const latest = flushPreviewEditor(flushId);
    if (latest !== null) setEditorValue(targetKey, latest);
    setBusy(true);
    setError(null);
    try {
      await saveDocument(targetKey);
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
              sessionId={document.sessionId ?? undefined}
              filePath={document.path}
              text={document.text}
              editable
              onChange={(value) => setEditorValue(targetKey, value)}
            />
          </div>
        </div>
      ) : view === "create" ? (
        <section className="markwisely-form-view" data-testid="markwisely-create-view">
          <button type="button" className="markwisely-back" onClick={() => setView("start")}>{t("markwisely.back")}</button>
          <h2>{t("markwisely.newTitle")}</h2>
          <label>{t("markwisely.folderLabel")}
            <div className="markwisely-folder-row"><input aria-label={t("markwisely.folderLabel")} value={parentDir} onChange={(event) => setParentDir(event.target.value)} /><button type="button" onClick={() => { setFolderDialogReturnView("create"); setView("create-folder"); }} aria-label={t("markwisely.chooseFolder")}><FolderOpen aria-hidden="true" /></button></div>
          </label>
          <label>{t("markwisely.fileNameLabel")}<input data-testid="markwisely-file-name" value={name} onChange={(event) => setName(event.target.value)} /></label>
          {error ? <div className="markwisely-error" role="alert">{error}</div> : null}
          <div className="markwisely-form-actions"><button type="button" className="markwisely-back" onClick={() => setView("start")}>{t("markwisely.cancel")}</button><button type="button" className="markwisely-primary" data-testid="markwisely-create-submit" disabled={busy || !folderReady || !parentDir.trim() || !name.trim()} onClick={() => void createFile()}>{busy ? t("markwisely.creating") : t("markwisely.create")}</button></div>
        </section>
      ) : (
        <section
          className="markwisely-home"
          data-testid="markwisely-home"
          aria-hidden={view === "open" || view === "open-folder" || view === "create-folder"}
          inert={view === "open" || view === "open-folder" || view === "create-folder" ? true : undefined}
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
      {view === "create-folder" || view === "open-folder" || view === "open" ? (
        <div className="markwisely-open-backdrop" data-testid={view === "open" ? "markwisely-open-backdrop" : "markwisely-folder-backdrop"}>
          <MarkWiselyFilePicker
            key={`${view}:${parentDir}`}
            sessionId={activeTarget.kind === "ssh" ? sessionId : undefined}
            target={activeTarget}
            mode={view === "open" ? "file" : "directory"}
            initialPath={view === "open" ? parentDir : parentDir || undefined}
            onCancel={() => setView(view === "create-folder" ? folderDialogReturnView : "start")}
            onSelect={(path) => {
              if (view === "create-folder" || view === "open-folder") {
                setParentDir(path);
                if (view === "create-folder") setView("create");
                else setView("open");
              } else {
                void openPath(path);
              }
            }}
          />
        </div>
      ) : null}
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
