import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { invoke } from "@tauri-apps/api/core";
import { isExtractableArchivePath } from "../lib/archivePath";
import { formatAppError } from "../lib/formatAppError";
import { invokeWithSudoRetry } from "../lib/invokeWithSudoRetry";
import { pasteTargetDir, parentRemotePath, isSameOrDescendantPath, normalizeRemotePath, sanitizeDeleteSelection, isProtectedDeletePath } from "../lib/localFsOps";
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
import { useDesktopStore } from "../stores/desktopStore";
import { useTaskManagerStore } from "../stores/taskManagerStore";
import { useSessionStore } from "../stores/sessionStore";
import { usePreviewStore } from "../stores/previewStore";
import { useToastStore } from "../stores/toastStore";
import { clampWorkspacePanelWidth } from "../lib/workspacePanelWidth";
import { LocalFsContextMenu, type LocalFsContextMenuProps } from "./LocalFsContextMenu";
import { LocalFsBackIcon, LocalFsCwdIcon, LocalFsHiddenIcon, LocalFsHomeIcon, LocalFsRefreshIcon, LocalFsSettingsIcon, LocalFsUpIcon, LocalFsViewGridIcon, LocalFsViewListIcon } from "./LocalFsIcons";
import { LocalFsContentsView } from "./LocalFsContentsView";
import { LocalFsPathBreadcrumb } from "./LocalFsPathBreadcrumb";
import { LocalFsTreeView } from "./LocalFsTreeView";
import { PathInput } from "./PathInput";
import { StatusBarTransfers } from "./StatusBarTransfers";
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
  /**
   * side — legacy right workspace panel (unused by desktop mode).
   * embedded — body only; parent supplies float chrome (FileManagerPanel).
   */
  presentation?: "side" | "embedded";
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

export function LocalFsPanel({
  sessionId,
  sessionTitle,
  presentation = "side",
}: Props) {
  const { t } = useTranslation(["tools", "terminal", "shell", "common"]);
  const panelRef = useWorkspacePanelEnter<HTMLElement>();
  const isEmbedded = presentation === "embedded";
  const pushToast = useToastStore((s) => s.pushToast);
  const openPreview = usePreviewStore((s) => s.openPreview);
  const openSendTo = useSessionStore((s) => s.openSendTo);
  const transferCount = useSessionStore(
    (s) => Object.keys(s.activeTransfers).length,
  );
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
    selectedPaths,
    clipboard,
    setClipboard,
    getEntryByPath,
    initTree,
    refreshTree,
    reloadDirectory,
    getUploadDirectory,
    contentsPath,
    contentsHistory,
    openDirectory,
    goBack,
    goUp,
    viewMode,
    setViewMode,
    splitTreeWidth,
    setSplitTreeWidth,
  } = useLocalFsStore();

  const splitDragRef = useRef<{ startX: number; startWidth: number } | null>(
    null,
  );

  const reloadDirsLocally = (dirs: string[]) => {
    const unique = [...new Set(dirs.map((d) => d.trim()).filter(Boolean))];
    for (const dir of unique) {
      void reloadDirectory(dir, { ensureExpanded: true });
    }
  };
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
    resetResults,
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
    paths?: string[];
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
  const [addressEditing, setAddressEditing] = useState(false);

  const panelTitle = sessionTitle
    ? t("localFs.titleWithHost", { host: sessionTitle })
    : t("localFs.title");

  useEffect(() => {
    setAddressEditing(false);
    setAddressPath(contentsPath ?? "");
  }, [sessionId]);

  useEffect(() => {
    if (!addressEditing && contentsPath) setAddressPath(contentsPath);
  }, [contentsPath, addressEditing]);

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

  useEffect(() => {
    if (!isEmbedded) return;
    findNameInputRef.current?.focus();
  }, [focusNonce, isEmbedded]);

  const navigateToAddress = (path: string) => {
    const target = normalizeRemotePath(path);
    if (!target) return;
    setAddressEditing(false);
    if (rootPath && isSameOrDescendantPath(rootPath, target)) {
      void openDirectory(target);
      return;
    }
    void initTree(target);
  };

  const canGoBack = contentsHistory.length > 0;
  const canGoUp = Boolean(
    contentsPath &&
      normalizeRemotePath(parentRemotePath(contentsPath)) !==
        normalizeRemotePath(contentsPath),
  );

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

  const operationPaths = (entry: LocalFsEntry) => {
    if (selectedPaths.includes(entry.path) && selectedPaths.length > 0) {
      return selectedPaths;
    }
    return [entry.path];
  };

  const setFsClipboard = (op: "copy" | "cut", paths: string[]) => {
    setClipboard({ sessionId, op, paths });
    pushToast(
      t(op === "copy" ? "terminal:toastCopiedItems" : "terminal:toastCutItems", {
        count: paths.length,
      }),
      true,
    );
  };

  const handlePaste = async (destHint?: string) => {
    const clip = clipboard;
    if (!clip || clip.sessionId !== sessionId || clip.paths.length === 0) {
      pushToast(t("terminal:toastNothingToPaste"), false);
      return;
    }
    const entry = destHint ? getEntryByPath(destHint) : selectedPath
      ? getEntryByPath(selectedPath)
      : null;
    // Prefer explicit dest → selected dir/file parent → contents pane → tree root.
    const dest =
      destHint && entry?.kind === "directory"
        ? destHint
        : destHint && !entry
          ? destHint
          : pasteTargetDir(
              selectedPath,
              entry?.kind === "directory"
                ? "directory"
                : entry
                  ? "file"
                  : null,
              contentsPath ?? rootPath,
            );
    if (!dest) {
      pushToast(t("terminal:toastNeedDestDir"), false);
      return;
    }
    try {
      const passwordRef: { current?: string } = {};
      for (const path of clip.paths) {
        if (clip.op === "cut") {
          await invokeWithSudoRetry(
            (sudoPassword) =>
              invoke("move_path", {
                request: {
                  session_id: sessionId,
                  path,
                  dest_dir: dest,
                  sudo_password: sudoPassword ?? null,
                },
              }),
            { action: t("terminal:moveToDir"), path, passwordRef },
          );
        } else {
          await invokeWithSudoRetry(
            (sudoPassword) =>
              invoke("copy_path", {
                request: {
                  session_id: sessionId,
                  path,
                  dest_dir: dest,
                  sudo_password: sudoPassword ?? null,
                },
              }),
            { action: t("terminal:copy"), path, passwordRef },
          );
        }
      }
      if (clip.op === "cut") setClipboard(null);
      pushToast(t("terminal:toastPasted"), true);
      const parents = clip.paths.map((p) => parentRemotePath(p));
      reloadDirsLocally([...parents, dest]);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const handleDuplicate = async (path: string) => {
    try {
      await invoke("duplicate_path", {
        request: { session_id: sessionId, path },
      });
      pushToast(t("terminal:toastDuplicated"), true);
      reloadDirsLocally([parentRemotePath(path)]);
    } catch (err) {
      pushToast(formatAppError(err), false);
    }
  };

  const handleMovePaths = async (paths: string[], destDir: string) => {
    try {
      const passwordRef: { current?: string } = {};
      for (const path of paths) {
        await invokeWithSudoRetry(
          (sudoPassword) =>
            invoke("move_path", {
              request: {
                session_id: sessionId,
                path,
                dest_dir: destDir,
                sudo_password: sudoPassword ?? null,
              },
            }),
          { action: t("terminal:moveToDir"), path, passwordRef },
        );
      }
      pushToast(t("terminal:toastMoved"), true);
      reloadDirsLocally([...paths.map((p) => parentRemotePath(p)), destDir]);
    } catch (err) {
      pushToast(formatAppError(err) || t("terminal:toastMoveFailed"), false);
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
      reloadDirsLocally([remoteDir]);
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
        reloadDirsLocally([parentRemotePath(path)]);
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
        reloadDirsLocally([parentRemotePath(path)]);
      })
      .catch((err) => {
        pushToast(formatAppError(err), false);
      });
  };

  const openEntryMenu = (event: ReactMouseEvent, entry: LocalFsEntry) => {
    event.preventDefault();
    event.stopPropagation();
    window.getSelection()?.removeAllRanges();
    if (!selectedPaths.includes(entry.path)) {
      useLocalFsStore.getState().setSelectedPath(entry.path);
    }
    const pathKind = entry.kind === "directory" ? "directory" : "file";
    const paths = operationPaths(entry);
    const canPaste = Boolean(
      clipboard && clipboard.sessionId === sessionId && clipboard.paths.length,
    );
    setMenu({
      kind: "entry",
      x: event.clientX,
      y: event.clientY,
      entry,
      canPaste,
      onClose: () => setMenu(null),
      onCopyName: () => {
        void copyText(basename(entry.path));
      },
      onCopyPath: () => {
        void copyText(entry.path);
      },
      onCopyItems: () => setFsClipboard("copy", paths),
      onCutItems: () => setFsClipboard("cut", paths),
      onPasteItems: canPaste
        ? () => {
            void handlePaste(
              pathKind === "directory" ? entry.path : undefined,
            );
          }
        : undefined,
      onDuplicate: () => {
        void handleDuplicate(entry.path);
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
      onNewFile:
        pathKind === "directory"
          ? () =>
              setDialog({
                mode: "createFile",
                path: entry.path,
                kind: "directory",
              })
          : undefined,
      onNewFolder:
        pathKind === "directory"
          ? () =>
              setDialog({
                mode: "createDir",
                path: entry.path,
                kind: "directory",
              })
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
      onDelete: () => {
        const toDelete = sanitizeDeleteSelection(paths, contentsPath);
        if (toDelete.length === 0) return;
        if (
          toDelete.length > 1 &&
          toDelete.some((p) => isProtectedDeletePath(p, rootPath))
        ) {
          pushToast(t("terminal:deleteProtectedBlocked"), false);
          return;
        }
        const anyDir = toDelete.some((p) => {
          const hit = getEntryByPath(p);
          return (
            hit?.kind === "directory" ||
            (p === entry.path && pathKind === "directory")
          );
        });
        setDialog({
          mode: "delete",
          path: toDelete[0],
          paths: toDelete,
          kind: anyDir ? "directory" : "file",
        });
      },
    });
  };

  const openBackgroundMenu = (
    event: ReactMouseEvent,
    parentDir?: string | null,
  ) => {
    event.preventDefault();
    window.getSelection()?.removeAllRanges();
    const canPaste = Boolean(
      clipboard && clipboard.sessionId === sessionId && clipboard.paths.length,
    );
    // Contents pane must paste into the folder currently shown on the right —
    // never silently fall back to the tree root (often `/`).
    const parent =
      (parentDir && parentDir.trim()) ||
      contentsPath ||
      rootPath ||
      ".";
    setMenu({
      kind: "background",
      x: event.clientX,
      y: event.clientY,
      canPaste,
      onClose: () => setMenu(null),
      onRefresh: () => {
        void refreshTree();
      },
      onUploadLocal: () => {
        void uploadLocalFilesHere();
      },
      onNewFile: () =>
        setDialog({
          mode: "createFile",
          path: parent,
          kind: "directory",
        }),
      onNewFolder: () =>
        setDialog({
          mode: "createDir",
          path: parent,
          kind: "directory",
        }),
      onPasteItems: canPaste
        ? () => {
            void handlePaste(parent);
          }
        : undefined,
    });
  };

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startW = width;
    let latest = startW;
    const shell = document.querySelector(".app-shell") as HTMLElement | null;
    document.body.classList.add("find-panel-resizing");
    const onMove = (moveEvent: MouseEvent) => {
      latest = clampWorkspacePanelWidth(startW + (startX - moveEvent.clientX));
      if (panelRef.current) panelRef.current.style.width = `${latest}px`;
      shell?.style.setProperty("--workspace-panel-width", `${latest}px`);
    };
    const onUp = () => {
      document.body.classList.remove("find-panel-resizing");
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setWidth(latest);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  useEffect(() => {
    if (isEmbedded && activeTab !== "files") {
      setActiveTab("files");
      useDesktopStore.getState().setFilesTab("files");
    }
  }, [isEmbedded, activeTab, setActiveTab]);

  const clearInlineSearch = () => {
    setNamePattern("");
    resetResults();
  };

  const handleRunFind = () => {
    if (isEmbedded) {
      const scope = contentsPath || rootPath || ".";
      useFindStore.setState({
        searchPath: scope,
        followTerminalCwd: false,
      });
    }
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

  const searchMode =
    isEmbedded && lastRunAt != null && Boolean(namePattern.trim());
  const searchEntries = useMemo((): LocalFsEntry[] | null => {
    if (!searchMode) return null;
    return entries.map((entry) => ({
      name: findEntryLabel(entry),
      path: entry.path,
      kind: entry.kind,
      size_bytes: entry.size_bytes,
    }));
  }, [entries, searchMode]);

  const showFilesUi = isEmbedded || activeTab === "files";

  return (
    <>
      {!isEmbedded ? <WorkspacePanelBackdrop panelId="localFs" /> : null}
      <aside
        ref={isEmbedded ? undefined : panelRef}
        className={
          isEmbedded
            ? "local-fs-panel find-panel open local-fs-embedded"
            : "local-fs-panel find-panel open"
        }
        style={isEmbedded ? undefined : { width }}
        aria-label={panelTitle}
        data-testid={isEmbedded ? "host-file-manager-body" : undefined}
      >
        {!isEmbedded ? (
        <div
          className="find-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t("localFs.resizeAria")}
          onMouseDown={startResize}
        />
        ) : null}
        {!isEmbedded ? (
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
        ) : null}

        {showFilesUi ? (
        <div className="local-fs-toolbar">
          <div className="local-fs-tool-group">
            <button
              type="button"
              className="local-fs-tool-btn"
              onClick={() => {
                clearInlineSearch();
                void goBack();
              }}
              disabled={!canGoBack || loadingRoot}
              title={t("localFs.goBack")}
              aria-label={t("localFs.goBack")}
            >
              <LocalFsBackIcon />
            </button>
            <button
              type="button"
              className="local-fs-tool-btn"
              onClick={() => {
                clearInlineSearch();
                void goUp();
              }}
              disabled={!canGoUp || loadingRoot}
              title={t("localFs.goUp")}
              aria-label={t("localFs.goUp")}
            >
              <LocalFsUpIcon />
            </button>
            <button
              type="button"
              className={`local-fs-tool-btn${rootLabel === "~" ? " is-active" : ""}`}
              onClick={() => {
                clearInlineSearch();
                void initTree("~");
              }}
              title={t("localFs.home")}
              aria-label={t("localFs.home")}
            >
              <LocalFsHomeIcon />
            </button>
            <button
              type="button"
              className={`local-fs-tool-btn local-fs-root-btn${rootLabel === "/" ? " is-active" : ""}`}
              onClick={() => {
                clearInlineSearch();
                void initTree("/");
              }}
              title={t("localFs.root")}
              aria-label={t("localFs.root")}
            >
              /
            </button>
            <button
              type="button"
              className="local-fs-tool-btn"
              onClick={() => {
                if (searchMode) {
                  handleRunFind();
                  return;
                }
                void refreshTree();
              }}
              disabled={loadingRoot || (searchMode && findLoading)}
              title={searchMode ? t("find.run") : t("localFs.refresh")}
              aria-label={searchMode ? t("find.run") : t("localFs.refresh")}
            >
              <LocalFsRefreshIcon />
            </button>
            <button
              type="button"
              className="local-fs-tool-btn"
              onClick={() => {
                clearInlineSearch();
                void navigateToTerminalCwd();
              }}
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
            <button
              type="button"
              className={`local-fs-tool-btn${viewMode === "list" ? " is-active" : ""}`}
              onClick={() => setViewMode("list")}
              title={t("localFs.viewList")}
              aria-label={t("localFs.viewList")}
              aria-pressed={viewMode === "list"}
            >
              <LocalFsViewListIcon />
            </button>
            <button
              type="button"
              className={`local-fs-tool-btn${viewMode === "grid" ? " is-active" : ""}`}
              onClick={() => setViewMode("grid")}
              title={t("localFs.viewGrid")}
              aria-label={t("localFs.viewGrid")}
              aria-pressed={viewMode === "grid"}
            >
              <LocalFsViewGridIcon />
            </button>
          </div>
          <div className="local-fs-address-bar">
            {addressEditing ? (
              <PathInput
                sessionId={sessionId}
                value={addressPath}
                onChange={setAddressPath}
                placeholder={t("localFs.addressPlaceholder")}
                disabled={loadingRoot}
                autoFocus
                onFocus={() => setAddressEditing(true)}
                onBlur={() => setAddressEditing(false)}
                onSubmit={(path) => {
                  clearInlineSearch();
                  setAddressEditing(false);
                  navigateToAddress(path);
                }}
              />
            ) : (
              <LocalFsPathBreadcrumb
                path={addressPath || contentsPath || "/"}
                disabled={loadingRoot}
                onNavigate={(path) => {
                  clearInlineSearch();
                  setAddressPath(path);
                  navigateToAddress(path);
                }}
                onEdit={() => setAddressEditing(true)}
              />
            )}
          </div>
          {isEmbedded ? (
            <div className="local-fs-search-bar">
              <input
                ref={findNameInputRef}
                type="search"
                data-testid="file-manager-search"
                value={namePattern}
                onChange={(event) => {
                  const next = event.target.value;
                  setNamePattern(next);
                  if (!next.trim()) {
                    resetResults();
                  }
                }}
                placeholder={t("find.namePlaceholder")}
                aria-label={t("find.nameAria")}
                disabled={findLoading}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    handleRunFind();
                  }
                  if (event.key === "Escape") {
                    event.preventDefault();
                    clearInlineSearch();
                  }
                }}
              />
              {namePattern || searchMode ? (
                <button
                  type="button"
                  className="local-fs-search-clear"
                  data-testid="file-manager-search-clear"
                  title={t("common:close")}
                  aria-label={t("find.clearSearch")}
                  onClick={() => clearInlineSearch()}
                >
                  ×
                </button>
              ) : null}
              {searchMode || findLoading ? (
                <span className="local-fs-search-meta" data-testid="file-manager-search-meta">
                  {findLoading ? t("find.running") : findResultSummary}
                </span>
              ) : null}
            </div>
          ) : null}
        </div>
        ) : null}

        {/* Home sits above the file tree (no chevron), same slot as IDE workspace root. */}
        {showFilesUi && rootPath ? (
          <div
            className={`local-fs-tree-root${contentsPath === rootPath || selectedPath === rootPath ? " is-selected" : ""}`}
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
              onClick={() => {
                clearInlineSearch();
                void openDirectory(rootPath);
              }}
            >
              {rootLabel === "~" ? t("localFs.home") : rootLabel}
              {loadingRoot ? (
                <span className="local-fs-tree-spinner" aria-hidden />
              ) : null}
            </button>
          </div>
        ) : null}

        {showFilesUi ? (
          <>
            {error ? <p className="find-panel-error">{error}</p> : null}
            {isEmbedded && findError ? (
              <p className="find-panel-error">{findError}</p>
            ) : null}
            <div className="local-fs-split" data-testid="local-fs-split">
              <div
                className="local-fs-split-tree"
                style={{ width: splitTreeWidth }}
              >
                <LocalFsTreeView
                  contextMenuPath={
                    menu?.kind === "entry" ? menu.entry.path : null
                  }
                  onEntryContextMenu={openEntryMenu}
                  onBackgroundContextMenu={(e) =>
                    openBackgroundMenu(e, rootPath)
                  }
                  onMovePaths={(paths, dest) => {
                    void handleMovePaths(paths, dest);
                  }}
                />
              </div>
              <div
                className="local-fs-split-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label={t("localFs.splitResizeAria")}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  event.preventDefault();
                  splitDragRef.current = {
                    startX: event.clientX,
                    startWidth: splitTreeWidth,
                  };
                  const onMove = (ev: PointerEvent) => {
                    const drag = splitDragRef.current;
                    if (!drag) return;
                    setSplitTreeWidth(
                      drag.startWidth + (ev.clientX - drag.startX),
                    );
                  };
                  const onUp = () => {
                    splitDragRef.current = null;
                    window.removeEventListener("pointermove", onMove);
                    window.removeEventListener("pointerup", onUp);
                  };
                  window.addEventListener("pointermove", onMove);
                  window.addEventListener("pointerup", onUp);
                }}
              />
              <div className="local-fs-split-contents">
                <LocalFsContentsView
                  contextMenuPath={
                    menu?.kind === "entry" ? menu.entry.path : null
                  }
                  onEntryContextMenu={openEntryMenu}
                  onBackgroundContextMenu={(e) =>
                    openBackgroundMenu(e, contentsPath)
                  }
                  onOpenFile={handleOpenFile}
                  onMovePaths={(paths, dest) => {
                    void handleMovePaths(paths, dest);
                  }}
                  entriesOverride={searchEntries}
                  loadingOverride={searchMode ? findLoading : undefined}
                  emptyLabel={
                    searchMode && lastRunAt != null ? t("find.empty") : undefined
                  }
                  onLeaveSearch={clearInlineSearch}
                />
              </div>
            </div>
            {transferCount > 0 ? (
              <div
                className="local-fs-transfer-strip"
                data-testid="local-fs-transfer-strip"
              >
                <StatusBarTransfers />
              </div>
            ) : null}
          </>
        ) : null}

        {!isEmbedded && activeTab === "find" ? (
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

        {activeTab === "taskManager" && !isEmbedded ? (
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
          paths={dialog.paths}
          pathKind={dialog.kind}
          onClose={() => setDialog(null)}
          onCommitted={({ reloadDirs }) => {
            reloadDirsLocally(reloadDirs);
            useLocalFsStore.getState().setSelectedPaths([]);
          }}
        />
      ) : null}
    </>
  );
}
