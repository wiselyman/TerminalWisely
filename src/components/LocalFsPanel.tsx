import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { isExtractableArchivePath } from "../lib/archivePath";
import { formatAppError } from "../lib/formatAppError";
import { invokeWithSudoRetry } from "../lib/invokeWithSudoRetry";
import { downloadRemotePath } from "../lib/sessionDownload";
import {
  canSendPathToChat,
  sendRemotePathToChat,
} from "../lib/aiEngineer/sendToChat";
import { uploadLocalPathsToSession } from "../lib/sessionUpload";
import { readTerminalPromptCwd } from "../lib/terminalContext";
import { getTerminalSession } from "../lib/terminalSelectionDrag";
import type { FindFileEntry, LocalFsEntry, PathSizeResult, ProcessEntry } from "../types";
import { useFindStore } from "../stores/findStore";
import { useLocalFsStore } from "../stores/localFsStore";
import { useTaskManagerStore } from "../stores/taskManagerStore";
import { useSessionStore } from "../stores/sessionStore";
import { usePreviewStore } from "../stores/previewStore";
import { useToastStore } from "../stores/toastStore";
import { LocalFsContextMenu, type LocalFsContextMenuProps } from "./LocalFsContextMenu";
import { LocalFsCwdIcon, LocalFsHiddenIcon, LocalFsHomeIcon, LocalFsRefreshIcon, LocalFsSettingsIcon } from "./LocalFsIcons";
import { LocalFsTreeView } from "./LocalFsTreeView";
import { PathInput } from "./PathInput";
import { PathSizeDialog } from "./PathSizeDialog";
import { TaskManagerTable } from "./TaskManagerTable";
import { FindInFilesIcon, LocalFilesIcon, TaskManagerIcon } from "./WorkspaceToolIcons";
import {
  TerminalFsDialog,
  type TerminalFsDialogMode,
} from "./TerminalFsDialog";
import { WorkspacePanelBackdrop } from "./WorkspacePanelBackdrop";
import { WorkspacePanelHeadActions } from "./WorkspacePanelHeadActions";
import { useWorkspacePanelEnter } from "../lib/useWorkspacePanelEnter";
import { openAppSettings } from "../stores/downloadSettingsStore";

type Props = {
  sessionId: string;
  sessionTitle?: string | null;
};

function basename(path: string) {
  const parts = path.split(/[/\\]/).filter(Boolean);
  return parts[parts.length - 1] || path;
}

function formatFindSize(sizeBytes: number | null | undefined) {
  if (sizeBytes == null) return "—";
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function findEntryLabel(entry: FindFileEntry) {
  const parts = entry.path.split(/[/\\]/);
  return parts[parts.length - 1] || entry.path;
}

function matchesProcessFilter(process: ProcessEntry, query: string) {
  const trimmed = query.trim();
  if (!trimmed) return true;
  const lower = trimmed.toLowerCase();
  const portQuery = trimmed.replace(/^:/, "");
  if (/^\d+$/.test(portQuery)) {
    return process.ports.includes(Number(portQuery));
  }
  if (process.name.toLowerCase().includes(lower)) return true;
  if (process.command?.toLowerCase().includes(lower)) return true;
  return false;
}

export function LocalFsPanel({ sessionId, sessionTitle }: Props) {
  const { t } = useTranslation(["tools", "terminal", "shell"]);
  const panelRef = useWorkspacePanelEnter<HTMLElement>();
  const pushToast = useToastStore((s) => s.pushToast);
  const openPreview = usePreviewStore((s) => s.openPreview);
  const openSendTo = useSessionStore((s) => s.openSendTo);
  const {
    width,
    setWidth,
    activeTab,
    setActiveTab,
    rootPath,
    rootLabel,
    loadingRoot,
    error,
    showHidden,
    setShowHidden,
    selectedPath,
    setSelectedPath,
    initTree,
    refreshTree,
    getUploadDirectory,
  } = useLocalFsStore();
  const {
    sessionCwd,
    followTerminalCwd,
    searchPath,
    setSearchPath,
    resetSearchPathToTerminal,
    namePattern,
    setNamePattern,
    typeFilter,
    setTypeFilter,
    maxDepth,
    setMaxDepth,
    caseInsensitive,
    setCaseInsensitive,
    entries,
    truncated,
    loading: findLoading,
    error: findError,
    lastRunAt,
    runFind,
    focusNonce,
  } = useFindStore();
  const {
    processes,
    loading: taskLoading,
    syncing,
    portsLoading,
    error: taskError,
    filterQuery,
    setFilterQuery,
    sortKey,
    sortDirection,
    setSort,
    killProcess,
  } = useTaskManagerStore();
  const findNameInputRef = useRef<HTMLInputElement>(null);

  const [dialog, setDialog] = useState<{
    mode: TerminalFsDialogMode;
    path: string;
    kind: "file" | "directory";
  } | null>(null);
  const [menu, setMenu] = useState<LocalFsContextMenuProps | null>(null);
  const [pathSizeDialog, setPathSizeDialog] = useState<{
    path: string;
    pathKind: "file" | "directory";
    loading: boolean;
    result: PathSizeResult | null;
    error: string | null;
  } | null>(null);
  const [addressPath, setAddressPath] = useState("");

  const panelTitle = sessionTitle
    ? t("localFs.titleWithHost", { host: sessionTitle })
    : t("localFs.title");

  useEffect(() => {
    if (rootPath) setAddressPath(rootPath);
  }, [rootPath]);

  useEffect(() => {
    if (activeTab === "find") {
      const { activeSessionId, activateSession } = useFindStore.getState();
      if (activeSessionId !== sessionId) {
        activateSession(sessionId);
      } else {
        void useFindStore.getState().loadSessionCwd(sessionId);
      }
      findNameInputRef.current?.focus();
    }
  }, [activeTab, focusNonce, sessionId]);

  const navigateToAddress = (path: string) => {
    void initTree(path);
  };

  const navigateToTerminalCwd = async () => {
    try {
      // Prefer the live prompt (PTY). Exec `pwd` on a new SSH channel always starts at $HOME.
      const term = getTerminalSession(sessionId);
      const fromPrompt = term ? readTerminalPromptCwd(term) : null;
      let cwd = fromPrompt;
      if (!cwd) {
        cwd = await invoke<string>("get_session_cwd", {
          request: { session_id: sessionId },
        });
      }
      if (!cwd) {
        pushToast(t("localFs.cwdUnavailable"), false);
        return;
      }
      setAddressPath(cwd);
      await initTree(cwd);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const handleOpenFile = (entry: LocalFsEntry) => {
    void openPreview(sessionId, entry.path, undefined, entry.size_bytes).catch(
      (err) => {
        pushToast(formatAppError(err), false);
      },
    );
  };

  const handleDownload = async (entry: LocalFsEntry) => {
    try {
      await downloadRemotePath(
        sessionId,
        entry.path,
        entry.kind === "directory" ? "directory" : "file",
      );
      pushToast(t("localFs.downloadOk"), true);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const copyText = async (text: string) => {
    try {
      const { copyToClipboard } = await import("../lib/clipboard");
      await copyToClipboard(text);
      pushToast(t("localFs.copied"), true);
    } catch {
      pushToast(t("localFs.copyFailed"), false);
    }
  };

  const handleViewSize = (path: string) => {
    setPathSizeDialog({
      path,
      pathKind: "directory",
      loading: true,
      result: null,
      error: null,
    });
    void (async () => {
      try {
        const result = await invokeWithSudoRetry<PathSizeResult>(
          (sudoPassword) =>
            invoke<PathSizeResult>("get_path_size", {
              request: {
                session_id: sessionId,
                path,
                sudo_password: sudoPassword ?? null,
              },
            }),
          { action: t("shell:sudoActionViewSize"), path },
        );
        setPathSizeDialog({
          path,
          pathKind: "directory",
          loading: false,
          result,
          error: null,
        });
      } catch (err) {
        setPathSizeDialog({
          path,
          pathKind: "directory",
          loading: false,
          result: null,
          error: formatAppError(err),
        });
      }
    })();
  };

  const uploadLocalFilesTo = async (remoteDir: string) => {
    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const picked = await open({
        multiple: true,
        title: t("terminal:uploadDialogTitle"),
      });
      if (picked == null) return;
      const localPaths = Array.isArray(picked) ? picked : [picked];
      if (localPaths.length === 0) return;
      await uploadLocalPathsToSession(sessionId, localPaths, remoteDir);
      pushToast(t("localFs.uploadOk"), true);
      void refreshTree();
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const uploadLocalFilesHere = async () => {
    const remoteDir = getUploadDirectory();
    if (!remoteDir) return;
    await uploadLocalFilesTo(remoteDir);
  };

  const handleCompress = (path: string) => {
    pushToast(t("terminal:toastCompressing"), true);
    void invokeWithSudoRetry(
      (sudoPassword) =>
        invoke("compress_path", {
          request: {
            session_id: sessionId,
            path,
            sudo_password: sudoPassword ?? null,
          },
        }),
      { action: t("terminal:compress"), path },
    )
      .then(() => {
        pushToast(t("terminal:toastCompressed"), true);
        void refreshTree();
      })
      .catch((err) => {
        pushToast(formatAppError(err), false);
      });
  };

  const handleExtract = (path: string) => {
    pushToast(t("terminal:toastExtracting"), true);
    void invokeWithSudoRetry(
      (sudoPassword) =>
        invoke("extract_archive", {
          request: {
            session_id: sessionId,
            path,
            sudo_password: sudoPassword ?? null,
          },
        }),
      { action: t("terminal:extract"), path },
    )
      .then(() => {
        pushToast(t("terminal:toastExtracted"), true);
        void refreshTree();
      })
      .catch((err) => {
        pushToast(formatAppError(err), false);
      });
  };

  const openEntryMenu = (event: ReactMouseEvent, entry: LocalFsEntry) => {
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    useLocalFsStore.getState().setSelectedPath(entry.path);
    const pathKind = entry.kind === "directory" ? "directory" : "file";
    setMenu({
      kind: "entry",
      x: event.clientX,
      y: event.clientY,
      entry,
      onClose: () => setMenu(null),
      onCopyName: () => {
        void copyText(basename(entry.path));
      },
      onCopyPath: () => {
        void copyText(entry.path);
      },
      onSendToChat:
        pathKind === "file" &&
        canSendPathToChat(entry.path, entry.size_bytes)
          ? () => {
              void sendRemotePathToChat(
                sessionId,
                entry.path,
                useSessionStore.getState().tabs.find((item) => item.id === sessionId)
                  ?.server_id ?? undefined,
              );
            }
          : undefined,
      onDownload: () => {
        void handleDownload(entry);
      },
      onUpload:
        pathKind === "directory"
          ? () => {
              void uploadLocalFilesTo(entry.path);
            }
          : undefined,
      onSendToRemote: () => {
        openSendTo({
          fromSessionId: sessionId,
          remotePath: entry.path,
        });
      },
      onPreview:
        pathKind === "file"
          ? () => {
              handleOpenFile(entry);
            }
          : undefined,
      onCompress: () => {
        handleCompress(entry.path);
      },
      onExtract: isExtractableArchivePath(entry.path)
        ? () => {
            handleExtract(entry.path);
          }
        : undefined,
      onViewSize:
        pathKind === "directory"
          ? () => {
              handleViewSize(entry.path);
            }
          : undefined,
      onRename: () =>
        setDialog({
          mode: "rename",
          path: entry.path,
          kind: pathKind,
        }),
      onMove: () =>
        setDialog({
          mode: "move",
          path: entry.path,
          kind: pathKind,
        }),
      onDelete: () =>
        setDialog({
          mode: "delete",
          path: entry.path,
          kind: pathKind,
        }),
    });
  };

  const openBackgroundMenu = (event: ReactMouseEvent) => {
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    setMenu({
      kind: "background",
      x: event.clientX,
      y: event.clientY,
      onClose: () => setMenu(null),
      onRefresh: () => {
        void refreshTree();
      },
      onUploadLocal: () => {
        void uploadLocalFilesHere();
      },
    });
  };

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startW = width;
    document.body.classList.add("find-panel-resizing");
    const onMove = (moveEvent: MouseEvent) => {
      setWidth(startW + (startX - moveEvent.clientX));
    };
    const onUp = () => {
      document.body.classList.remove("find-panel-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleRunFind = () => {
    void runFind(sessionId);
  };

  const handleFindEntryClick = (entry: FindFileEntry) => {
    if (entry.kind === "directory") {
      void initTree(entry.path);
      setActiveTab("files");
      return;
    }
    void openPreview(sessionId, entry.path, undefined, entry.size_bytes).catch(
      (err) => {
        pushToast(formatAppError(err), false);
      },
    );
  };

  const taskProcesses = useMemo(
    () => processes.filter((process) => matchesProcessFilter(process, filterQuery)),
    [filterQuery, processes],
  );
  const findResultSummary =
    lastRunAt == null
      ? t("find.hintBeforeRun")
      : `${t("find.resultCount", { count: entries.length })}${truncated ? t("find.resultTruncated") : ""}`;

  return (
    <>
      <WorkspacePanelBackdrop panelId="localFs" />
      <aside
        ref={panelRef}
        className="local-fs-panel find-panel open"
        style={{ width }}
        aria-label={panelTitle}
      >
        <div
          className="find-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("localFs.resizeAria")}
          onMouseDown={startResize}
        />
        <div className="find-panel-head">
          <div className="find-panel-title-wrap">
            <h2 className="find-panel-title">{panelTitle}</h2>
          </div>
          <WorkspacePanelHeadActions panelId="localFs" sessionId={sessionId}>
            <div className="workspace-panel-inline-tabs" role="tablist" aria-label={t("localFs.tabsAria")}>
              <button
                type="button"
                role="tab"
                className={`workspace-panel-icon-btn${activeTab === "files" ? " active" : ""}`}
                aria-label={t("localFs.tabFiles")}
                title={t("localFs.tabFiles")}
                aria-selected={activeTab === "files"}
                onClick={() => setActiveTab("files")}
              >
                <LocalFilesIcon />
              </button>
              <button
                type="button"
                role="tab"
                className={`workspace-panel-icon-btn${activeTab === "find" ? " active" : ""}`}
                aria-label={t("localFs.tabFind")}
                title={t("localFs.tabFind")}
                aria-selected={activeTab === "find"}
                onClick={() => setActiveTab("find")}
              >
                <FindInFilesIcon />
              </button>
              <button
                type="button"
                role="tab"
                className={`workspace-panel-icon-btn${activeTab === "taskManager" ? " active" : ""}`}
                aria-label={t("localFs.tabProcesses")}
                title={t("localFs.tabProcesses")}
                aria-selected={activeTab === "taskManager"}
                onClick={() => setActiveTab("taskManager")}
              >
                <TaskManagerIcon />
              </button>
            </div>
          </WorkspacePanelHeadActions>
        </div>

        {activeTab === "files" ? (
        <div className="local-fs-toolbar">
          <div className="local-fs-tool-group">
            <button
              type="button"
              className={`local-fs-tool-btn${rootLabel === "~" ? " is-active" : ""}`}
              onClick={() => void initTree("~")}
              title={t("localFs.home")}
              aria-label={t("localFs.home")}
            >
              <LocalFsHomeIcon />
            </button>
            <button
              type="button"
              className={`local-fs-tool-btn local-fs-root-btn${rootLabel === "/" ? " is-active" : ""}`}
              onClick={() => void initTree("/")}
              title={t("localFs.root")}
              aria-label={t("localFs.root")}
            >
              /
            </button>
            <button
              type="button"
              className="local-fs-tool-btn"
              onClick={() => void refreshTree()}
              disabled={loadingRoot}
              title={t("localFs.refresh")}
              aria-label={t("localFs.refresh")}
            >
              <LocalFsRefreshIcon />
            </button>
            <button
              type="button"
              className="local-fs-tool-btn"
              onClick={() => void navigateToTerminalCwd()}
              disabled={loadingRoot}
              title={t("localFs.currentDir")}
              aria-label={t("localFs.currentDir")}
            >
              <LocalFsCwdIcon />
            </button>
            <button
              type="button"
              className={`local-fs-tool-btn${showHidden ? " is-active" : ""}`}
              onClick={() => setShowHidden(!showHidden)}
              disabled={loadingRoot}
              title={showHidden ? t("localFs.hideHidden") : t("localFs.showHidden")}
              aria-label={showHidden ? t("localFs.hideHidden") : t("localFs.showHidden")}
              aria-pressed={showHidden}
            >
              <LocalFsHiddenIcon show={showHidden} />
            </button>
            <button
              type="button"
              className="local-fs-tool-btn"
              onClick={() => openAppSettings()}
              title={t("shell:settingsOpen")}
              aria-label={t("shell:settingsOpen")}
            >
              <LocalFsSettingsIcon />
            </button>
          </div>
          <div className="local-fs-address-bar">
            <PathInput
              sessionId={sessionId}
              value={addressPath}
              onChange={setAddressPath}
              placeholder={t("localFs.addressPlaceholder")}
              disabled={loadingRoot}
              onSubmit={navigateToAddress}
            />
          </div>
        </div>
        ) : null}

        {/* Home sits above the file tree (no chevron), same slot as IDE workspace root. */}
        {activeTab === "files" && rootPath ? (
          <div
            className={`local-fs-tree-root${selectedPath === rootPath ? " is-selected" : ""}`}
            onContextMenu={(e) => {
              e.preventDefault();
              openEntryMenu(e, {
                path: rootPath,
                name: rootLabel === "~" ? t("localFs.home") : rootLabel,
                kind: "directory",
              });
            }}
          >
            <button
              type="button"
              className="local-fs-tree-root-label"
              title={rootPath}
              onClick={() => setSelectedPath(rootPath)}
            >
              {rootLabel === "~" ? t("localFs.home") : rootLabel}
              {loadingRoot ? (
                <span className="local-fs-tree-spinner" aria-hidden />
              ) : null}
            </button>
          </div>
        ) : null}

        {activeTab === "files" ? (
          <>
            {error ? <p className="find-panel-error">{error}</p> : null}
            <LocalFsTreeView
              contextMenuPath={menu?.kind === "entry" ? menu.entry.path : null}
              onEntryContextMenu={openEntryMenu}
              onBackgroundContextMenu={openBackgroundMenu}
              onOpenFile={handleOpenFile}
            />
          </>
        ) : null}

        {activeTab === "find" ? (
          <>
            <div className="find-panel-toolbar">
              <label className="find-panel-field find-panel-scope-field">
                <span>{t("find.scope")}</span>
                <PathInput
                  sessionId={sessionId}
                  value={followTerminalCwd ? (sessionCwd ?? "") : searchPath}
                  onChange={setSearchPath}
                  placeholder={sessionCwd ?? t("find.cwdPlaceholder")}
                />
                {!followTerminalCwd ? (
                  <button
                    type="button"
                    className="find-panel-follow-cwd"
                    onClick={() => {
                      resetSearchPathToTerminal();
                      void useFindStore.getState().loadSessionCwd(sessionId);
                    }}
                  >
                    {t("find.followCwd")}
                  </button>
                ) : null}
              </label>

              <label className="find-panel-field">
                <span>{t("find.nameLabel")}</span>
                <input
                  ref={findNameInputRef}
                  type="text"
                  value={namePattern}
                  onChange={(event) => setNamePattern(event.target.value)}
                  placeholder={t("find.namePlaceholder")}
                  aria-label={t("find.nameAria")}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      handleRunFind();
                    }
                  }}
                />
              </label>

              <div className="find-panel-field-row">
                <label className="find-panel-field find-panel-field-inline">
                  <span>{t("find.typeLabel")}</span>
                  <select
                    value={typeFilter}
                    onChange={(event) =>
                      setTypeFilter(event.target.value as "all" | "file" | "directory")
                    }
                    aria-label={t("find.typeAria")}
                  >
                    <option value="all">{t("find.typeAll")}</option>
                    <option value="file">{t("find.typeFile")}</option>
                    <option value="directory">{t("find.typeDirectory")}</option>
                  </select>
                </label>
                <label className="find-panel-field find-panel-field-inline">
                  <span>{t("find.depth")}</span>
                  <input
                    type="number"
                    min={1}
                    max={32}
                    value={maxDepth}
                    onChange={(event) => setMaxDepth(Number(event.target.value) || 8)}
                    aria-label={t("find.depthAria")}
                  />
                </label>
                <label className="find-panel-checkbox">
                  <input
                    type="checkbox"
                    checked={caseInsensitive}
                    onChange={(event) => setCaseInsensitive(event.target.checked)}
                  />
                  <span>{t("find.iname")}</span>
                </label>
              </div>
              <div className="find-panel-actions">
                <button
                  type="button"
                  className="find-panel-run"
                  disabled={findLoading || !namePattern.trim()}
                  onClick={handleRunFind}
                >
                  {findLoading ? t("find.running") : t("find.run")}
                </button>
                <span className="find-panel-meta">{findResultSummary}</span>
              </div>
              {findError ? <p className="find-panel-error">{findError}</p> : null}
            </div>

            <div className="find-panel-results">
              {entries.length === 0 && !findLoading && lastRunAt != null ? (
                <p className="find-panel-empty">{t("find.empty")}</p>
              ) : null}
              <ul className="find-panel-result-list">
                {entries.map((entry) => (
                  <li key={entry.path}>
                    <button
                      type="button"
                      className={`find-panel-result-item find-panel-result-${entry.kind}`}
                      onClick={() => handleFindEntryClick(entry)}
                      title={entry.path}
                    >
                      <span className="find-panel-result-name">{findEntryLabel(entry)}</span>
                      <span className="find-panel-result-kind">
                        {entry.kind === "directory" ? t("find.kindDirectory") : t("find.kindFile")}
                      </span>
                      <span className="find-panel-result-size">
                        {formatFindSize(entry.size_bytes)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </>
        ) : null}

        {activeTab === "taskManager" ? (
          <>
            <div className="task-manager-toolbar">
              <input
                type="search"
                className="task-manager-search"
                placeholder={t("taskManager.filterPlaceholder")}
                value={filterQuery}
                onChange={(event) => setFilterQuery(event.target.value)}
              />
            </div>
            {taskError ? <div className="task-manager-error">{taskError}</div> : null}
            <TaskManagerTable
              processes={taskProcesses}
              loading={taskLoading}
              syncing={syncing}
              portsLoading={portsLoading}
              sortKey={sortKey}
              sortDirection={sortDirection}
              onSort={setSort}
              onKill={(process) => void killProcess(sessionId, process.pid, process.name)}
            />
          </>
        ) : null}
      </aside>

      {menu ? <LocalFsContextMenu {...menu} /> : null}

      {pathSizeDialog ? (
        <PathSizeDialog
          path={pathSizeDialog.path}
          pathKind={pathSizeDialog.pathKind}
          loading={pathSizeDialog.loading}
          result={pathSizeDialog.result}
          error={pathSizeDialog.error}
          onClose={() => setPathSizeDialog(null)}
        />
      ) : null}

      {dialog ? (
        <TerminalFsDialog
          mode={dialog.mode}
          sessionId={sessionId}
          path={dialog.path}
          pathKind={dialog.kind}
          onClose={() => {
            setDialog(null);
            void refreshTree();
          }}
        />
      ) : null}
    </>
  );
}
