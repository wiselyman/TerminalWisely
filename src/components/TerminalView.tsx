import { useEffect, useRef, useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  PathSizeResult,
  SessionKind,
  SessionLifecyclePayload,
  TerminalOutputPayload,
  TransferCompletePayload,
} from "../types";
import {
  buildLineColumnMap,
  extractDroppedPaths,
  findRemotePathMatches,
  isModifierClick,
  isPrimaryLinkActivate,
  isShiftClick,
  matchToXtermRange,
  stripOsc8Hyperlinks,
} from "../lib/terminalLinks";
import {
  findRemotePathAtCell,
  getTerminalMouseCell,
  isRemoteDragModifier,
} from "../lib/terminalMouse";
import { resetTerminalMouseTracking } from "../lib/terminalMouseMode";
import {
  armChromeClickSuppress,
  bindTerminalSelectionDragRelease,
  isSyntheticTerminalMouseEvent,
  registerTerminalSession,
  shouldSuppressChromeClickAfterTerminalRelease,
  unregisterTerminalSession,
} from "../lib/terminalSelectionDrag";
import { startRemotePointerDrag, DRAG_THRESHOLD_PX } from "../lib/remotePointerDrag";
import { getLinePlainText, isLineInLsOutput, resolvePathFromListing } from "../lib/terminalContext";
import {
  clearUploadHighlights,
  scheduleUploadHighlight,
} from "../lib/terminalHighlight";
import { useSessionStore } from "../stores/sessionStore";
import { usePreviewStore } from "../stores/previewStore";
import { isTabReordering } from "../lib/tabPointerReorder";
import { TERMINAL_FONT_SIZE, TERMINAL_LINE_HEIGHT, ensureTerminalFontsLoaded, getTerminalFontFamily } from "../lib/terminalFont";
import { uploadLocalPathsToSession } from "../lib/sessionUpload";
import { downloadRemotePath } from "../lib/sessionDownload";
import { formatTransferError } from "../lib/transferError";
import { formatAppError } from "../lib/formatAppError";
import { localizeTerminalOutputChunk } from "../lib/localizeTerminalOutput";
import { invokeWithSudoRetry } from "../lib/invokeWithSudoRetry";
import { copyToClipboard, readClipboardText } from "../lib/clipboard";
import i18n from "../i18n";
import { TERMINAL_FOCUS_EVENT } from "../stores/commandNavigatorStore";
import { useToastStore } from "../stores/toastStore";
import { TerminalStatusOverlay } from "./TerminalStatusOverlay";
import { PathSizeDialog } from "./PathSizeDialog";
import { TerminalLinkContextMenu, TerminalBlankContextMenu } from "./TerminalLinkContextMenu";
import {
  TerminalFsDialog,
  type TerminalFsDialogMode,
} from "./TerminalFsDialog";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  sessionId: string;
  kind: SessionKind;
  active: boolean;
  connectionStatus?: "connecting" | "ready";
  title: string;
  layoutRevision?: string;
}

async function listenSafely<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}

function terminalPathBasename(path: string): string {
  return path.split("/").pop() || path.split("\\").pop() || path;
}

export function TerminalView({
  sessionId,
  kind,
  active,
  connectionStatus = "ready",
  title,
  layoutRevision = "",
}: TerminalViewProps) {
  const { t } = useTranslation("terminal");
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const lastSizeRef = useRef({ cols: 0, rows: 0 });
  const lastContainerSizeRef = useRef({ width: 0, height: 0 });
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingFilenamesRef = useRef<string[]>([]);
  const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upsertTransfer = useSessionStore((s) => s.upsertTransfer);
  const removeTransfer = useSessionStore((s) => s.removeTransfer);
  const setStatusMessage = useSessionStore((s) => s.setStatusMessage);
  const openSendTo = useSessionStore((s) => s.openSendTo);
  const startRemoteTransfer = useSessionStore((s) => s.startRemoteTransfer);
  const setSessionDisconnected = useSessionStore((s) => s.setSessionDisconnected);
  const openPreview = usePreviewStore((s) => s.openPreview);
  const pushToast = useToastStore((s) => s.pushToast);
  const openPreviewRef = useRef(openPreview);
  const openSendToRef = useRef(openSendTo);
  const pushToastRef = useRef(pushToast);
  const startRemoteTransferRef = useRef(startRemoteTransfer);
  const upsertTransferRef = useRef(upsertTransfer);
  const removeTransferRef = useRef(removeTransfer);

  openPreviewRef.current = openPreview;
  openSendToRef.current = openSendTo;
  pushToastRef.current = pushToast;
  startRemoteTransferRef.current = startRemoteTransfer;
  upsertTransferRef.current = upsertTransfer;
  removeTransferRef.current = removeTransfer;
  const [isDragOver, setIsDragOver] = useState(false);
  const [bootOverlayVisible, setBootOverlayVisible] = useState(true);
  const [bootOverlayFading, setBootOverlayFading] = useState(false);
  const [fsContextMenu, setFsContextMenu] = useState<{
    x: number;
    y: number;
    path: string;
    pathKind: "file" | "directory";
  } | null>(null);
  const [blankContextMenu, setBlankContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [fsDialog, setFsDialog] = useState<{
    mode: TerminalFsDialogMode;
    path: string;
    pathKind: "file" | "directory";
  } | null>(null);
  const [pathSizeDialog, setPathSizeDialog] = useState<{
    path: string;
    pathKind: "file" | "directory";
    loading: boolean;
    result: PathSizeResult | null;
    error: string | null;
  } | null>(null);
  const setFsContextMenuRef = useRef(setFsContextMenu);
  const setBlankContextMenuRef = useRef(setBlankContextMenu);
  const setFsDialogRef = useRef(setFsDialog);
  const fsContextMenuProbeRef = useRef(0);
  setFsContextMenuRef.current = setFsContextMenu;
  setBlankContextMenuRef.current = setBlankContextMenu;
  setFsDialogRef.current = setFsDialog;
  const dragDepthRef = useRef(0);
  const bootPendingRef = useRef(true);
  const bootOverlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingOutputRef = useRef<string[]>([]);
  const isConnecting = connectionStatus === "connecting";

  const markFirstOutput = useCallback(() => {
    if (!bootPendingRef.current) return;
    bootPendingRef.current = false;
    setBootOverlayFading(true);
    if (bootOverlayTimerRef.current !== null) {
      clearTimeout(bootOverlayTimerRef.current);
    }
    bootOverlayTimerRef.current = setTimeout(() => {
      bootOverlayTimerRef.current = null;
      setBootOverlayVisible(false);
      setBootOverlayFading(false);
    }, 220);
  }, []);

  useEffect(() => {
    bootPendingRef.current = true;
    pendingOutputRef.current = [];
    setBootOverlayVisible(true);
    setBootOverlayFading(false);
    return () => {
      if (bootOverlayTimerRef.current !== null) {
        clearTimeout(bootOverlayTimerRef.current);
        bootOverlayTimerRef.current = null;
      }
    };
  }, [sessionId]);

  const scheduleHighlight = useCallback(
    (filenames: string[]) => {
      if (filenames.length === 0) return;
      pendingFilenamesRef.current = filenames;
      const terminal = terminalRef.current;
      if (!terminal) return;
      scheduleUploadHighlight(terminal, sessionId, filenames);
    },
    [sessionId],
  );

  activeRef.current = active;

  const syncSize = useCallback(async () => {
    const container = containerRef.current;
    const host = hostRef.current;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!container || !host || !terminal || !fitAddon || !activeRef.current) return;

    const width = host.clientWidth;
    const height = host.clientHeight;
    if (width <= 0 || height <= 0) return;

    const last = lastContainerSizeRef.current;
    if (last.width === width && last.height === height) {
      return;
    }
    lastContainerSizeRef.current = { width, height };

    try {
      fitAddon.fit();
    } catch {
      return;
    }

    const cols = terminal.cols;
    const rows = terminal.rows;
    if (
      cols === lastSizeRef.current.cols &&
      rows === lastSizeRef.current.rows
    ) {
      return;
    }

    lastSizeRef.current = { cols, rows };
    await invoke("resize_terminal", {
      sessionId,
      cols,
      rows,
    });
  }, [sessionId]);

  const scheduleSyncSize = useCallback(() => {
    if (resizeTimerRef.current !== null) {
      clearTimeout(resizeTimerRef.current);
    }
    resizeTimerRef.current = setTimeout(() => {
      resizeTimerRef.current = null;
      void syncSize();
    }, 120);
  }, [syncSize]);

  useEffect(() => {
    if (isConnecting || !containerRef.current || !hostRef.current) return;

    let disposed = false;
    const host = hostRef.current;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: TERMINAL_FONT_SIZE,
      lineHeight: TERMINAL_LINE_HEIGHT,
      fontFamily: getTerminalFontFamily(),
      fontWeight: 400,
      fontWeightBold: 700,
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
      },
      scrollback: 5000,
      allowProposedApi: true,
      rightClickSelectsWord: false,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    resetTerminalMouseTracking(terminal);
    registerTerminalSession(sessionId, terminal);
    const cleanupSelectionDrag = bindTerminalSelectionDragRelease(host, terminal);
    fitAddonRef.current = fitAddon;
    terminalRef.current = terminal;

    void ensureTerminalFontsLoaded().finally(() => {
      if (disposed || !fitAddonRef.current || !terminalRef.current) return;
      try {
        fitAddonRef.current.fit();
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
      } catch {
        // Terminal may already be disposed.
      }
    });

    const onHostFocus = () => resetTerminalMouseTracking(terminal);
    host.addEventListener("focus", onHostFocus, true);

    const onHostMouseDown = (event: MouseEvent) => {
      if (event.button === 2) {
        armChromeClickSuppress(800);
      }
    };

    const screenElement =
      host.querySelector<HTMLElement>(".xterm-screen") ?? host;

    const onHostContextMenu = (event: MouseEvent) => {
      armChromeClickSuppress(800);

      if (kind !== "ssh" && kind !== "local") return;

      const cell = getTerminalMouseCell(terminal, screenElement, event);
      if (!cell) {
        event.preventDefault();
        event.stopPropagation();
        setFsContextMenuRef.current(null);
        setBlankContextMenuRef.current({
          x: event.clientX,
          y: event.clientY,
        });
        return;
      }

      const hit = findRemotePathAtCell(terminal, cell);
      if (!hit) {
        event.preventDefault();
        event.stopPropagation();
        setFsContextMenuRef.current(null);
        setBlankContextMenuRef.current({
          x: event.clientX,
          y: event.clientY,
        });
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      setBlankContextMenuRef.current(null);

      const now = Date.now();
      if (now - fsContextMenuProbeRef.current < 400) return;
      fsContextMenuProbeRef.current = now;

      void (async () => {
        let pathKind: "file" | "directory" = hit.directoryHint
          ? "directory"
          : "file";
        try {
          const probe = await invoke<string>(
            kind === "ssh" ? "probe_remote_path" : "probe_path",
            {
              request: {
                session_id: sessionId,
                path: hit.path,
              },
            },
          );
          pathKind = probe === "directory" ? "directory" : "file";
        } catch {
          // Path may still be valid for file ops; avoid noisy toasts on right-click.
        }
        setFsContextMenuRef.current({
          x: event.clientX,
          y: event.clientY,
          path: hit.path,
          pathKind,
        });
      })();
    };
    host.addEventListener("mousedown", onHostMouseDown, true);
    host.addEventListener("contextmenu", onHostContextMenu, true);

    let cleanupRemoteDrag: (() => void) | undefined;

    if (kind === "ssh" || kind === "local") {
      let suppressModifierActivate = false;

      if (kind === "ssh" || kind === "local") {
        const handleRemoteMouseDown = (event: MouseEvent) => {
          if (!isRemoteDragModifier(event)) return;
          if (event.button !== 0) return;

          const cell = getTerminalMouseCell(terminal, screenElement, event);
          if (!cell) return;

          const hit = findRemotePathAtCell(terminal, cell);
          if (!hit) return;

          const remotePath = hit.path;

          const startX = event.clientX;
          const startY = event.clientY;
          let dragStarted = false;
          let disposed = false;

          const cleanupPending = () => {
            if (disposed) return;
            disposed = true;
            document.removeEventListener("mousemove", onPendingMove, true);
            document.removeEventListener("mouseup", onPendingUp, true);
          };

          const setSourceDragVisual = (active: boolean) => {
            containerRef.current?.classList.toggle(
              "remote-drag-source-active",
              active,
            );
            host.classList.toggle("remote-drag-source-active", active);
          };

          const onPendingMove = (moveEvent: MouseEvent) => {
            if (disposed || dragStarted) return;

            const dx = moveEvent.clientX - startX;
            const dy = moveEvent.clientY - startY;
            if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return;

            dragStarted = true;
            suppressModifierActivate = true;
            terminal.clearSelection();
            cleanupPending();
            setSourceDragVisual(true);

            startRemotePointerDrag({
              fromSessionId: sessionId,
              remotePath,
              startX,
              startY,
              onDragStart: () => {
                suppressModifierActivate = true;
              },
              onDragEnd: () => {
                setSourceDragVisual(false);
              },
              onDrop: (toSessionId) => {
                void startRemoteTransferRef
                  .current(sessionId, remotePath, toSessionId)
                  .catch((err) => {
                    pushToastRef.current(formatAppError(err), false);
                  });
              },
              onCancel: () => {
                pushToastRef.current(i18n.t("terminal:dragDropOtherTabHint"), false);
              },
            });
          };

          const onPendingUp = () => {
            cleanupPending();
          };

          document.addEventListener("mousemove", onPendingMove, true);
          document.addEventListener("mouseup", onPendingUp, true);
        };

        host.addEventListener("mousedown", handleRemoteMouseDown, true);
        cleanupRemoteDrag = () => {
          host.removeEventListener("mousedown", handleRemoteMouseDown, true);
        };
      }

      terminal.registerLinkProvider({
        provideLinks: (bufferLineNumber, callback) => {
          try {
            const line = terminal.buffer.active.getLine(bufferLineNumber - 1);
            if (!line) {
              callback(undefined);
              return;
            }

            const map = buildLineColumnMap(line);
            const getLinePlain = (lineNumber: number) =>
              getLinePlainText(
                (n) => terminal.buffer.active.getLine(n - 1),
                lineNumber,
              );
            const matches = findRemotePathMatches(map.plain, {
              inLsOutput: isLineInLsOutput(getLinePlain, bufferLineNumber),
            });
            if (matches.length === 0) {
              callback(undefined);
              return;
            }

            const links = matches.map(({ path, start, end }) => {
              const resolveClickedPath = () =>
                resolvePathFromListing(
                  getLinePlain,
                  terminal.buffer.active.length,
                  bufferLineNumber,
                  path,
                );

              return {
                range: matchToXtermRange(map, line, start, end, bufferLineNumber),
                text: path,
                decorations: {
                  pointerCursor: true,
                  underline: true,
                },
                activate: (event: MouseEvent, _uri: string) => {
                  if (!isPrimaryLinkActivate(event)) return;
                  if (isSyntheticTerminalMouseEvent(event)) return;
                  if (shouldSuppressChromeClickAfterTerminalRelease()) return;

                  const targetPath = resolveClickedPath();
                  if (isModifierClick(event)) {
                    if (suppressModifierActivate) {
                      suppressModifierActivate = false;
                      return;
                    }
                  }
                  if (isShiftClick(event)) {
                    void (async () => {
                      try {
                        const probe = await invoke<string>(
                          kind === "ssh" ? "probe_remote_path" : "probe_path",
                          {
                            request: {
                              session_id: sessionId,
                              path: targetPath,
                            },
                          },
                        );
                        if (probe === "file" || probe === "directory") {
                          openSendToRef.current({
                            fromSessionId: sessionId,
                            remotePath: targetPath,
                          });
                        } else {
                          pushToastRef.current(i18n.t("terminal:pathUnrecognized"), false);
                        }
                      } catch (err) {
                        pushToastRef.current(formatAppError(err), false);
                      }
                    })();
                    return;
                  }
                  if (isModifierClick(event)) {
                    if (kind !== "ssh") {
                      return;
                    }
                    void (async () => {
                      try {
                        const probe = await invoke<string>("probe_remote_path", {
                          request: {
                            session_id: sessionId,
                            path: targetPath,
                          },
                        });
                        await downloadRemotePath(
                          sessionId,
                          targetPath,
                          probe === "directory" ? "directory" : "file",
                        );
                      } catch (err) {
                        pushToastRef.current(formatTransferError(err), false);
                      }
                    })();
                    return;
                  }

                  void (async () => {
                    try {
                      const probe = await invoke<string>("probe_path", {
                        request: {
                          session_id: sessionId,
                          path: targetPath,
                        },
                      });
                      if (probe === "directory") {
                        await invoke("enter_directory", {
                          request: {
                            session_id: sessionId,
                            path: targetPath,
                          },
                        });
                      } else {
                        await openPreviewRef.current(sessionId, targetPath);
                      }
                    } catch (err) {
                      pushToastRef.current(formatAppError(err), false);
                    }
                  })();
                },
              };
            });

            callback(links);
          } catch (err) {
            console.error("Terminal link provider failed:", err);
            callback(undefined);
          }
        },
      });

    }

    const onData = terminal.onData((data) => {
      if (!activeRef.current) return;

      const store = useSessionStore.getState();
      if (store.disconnectedSessionIds.has(sessionId) && kind === "ssh") {
        if (data === "\r" || data === "\n") {
          const { cols, rows } = lastSizeRef.current;
          void store.reconnectSession(
            sessionId,
            cols > 0 ? cols : 80,
            rows > 0 ? rows : 24,
          );
        }
        return;
      }

      void invoke("terminal_input", { sessionId, data }).catch((err) => {
        const message = String(err);
        if (
          message.includes("ERR_SSH_DISCONNECTED") ||
          message.includes("按 Enter 重新连接") ||
          message.includes("终端连接已断开") ||
          message.includes("channel closed") ||
          message.includes("Session not found")
        ) {
          if (kind === "ssh") {
            setSessionDisconnected(sessionId);
          }
        }
      });
    });

    void syncSize();

    const buffered = pendingOutputRef.current.splice(0);
    for (const chunk of buffered) {
      terminal.write(stripOsc8Hyperlinks(localizeTerminalOutputChunk(chunk)));
    }
    if (buffered.some((chunk) => chunk.length > 0)) {
      markFirstOutput();
    }

    return () => {
      disposed = true;
      cleanupSelectionDrag();
      unregisterTerminalSession(sessionId);
      cleanupRemoteDrag?.();
      if (resizeTimerRef.current !== null) {
        clearTimeout(resizeTimerRef.current);
      }
      if (highlightTimerRef.current !== null) {
        clearTimeout(highlightTimerRef.current);
      }
      clearUploadHighlights(sessionId);
      host.removeEventListener("mousedown", onHostMouseDown, true);
      host.removeEventListener("contextmenu", onHostContextMenu, true);
      host.removeEventListener("focus", onHostFocus, true);
      onData.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      lastContainerSizeRef.current = { width: 0, height: 0 };
      lastSizeRef.current = { cols: 0, rows: 0 };
    };
  }, [isConnecting, kind, markFirstOutput, sessionId, setSessionDisconnected, syncSize]);

  useEffect(() => {
    const onFocusRequest = (event: Event) => {
      const detail = (event as CustomEvent<{ sessionId: string }>).detail;
      if (detail?.sessionId !== sessionId || !activeRef.current) return;
      terminalRef.current?.focus();
    };
    window.addEventListener(TERMINAL_FOCUS_EVENT, onFocusRequest);
    return () => window.removeEventListener(TERMINAL_FOCUS_EVENT, onFocusRequest);
  }, [sessionId]);

  useEffect(() => {
    if (isConnecting || !active) return;

    lastContainerSizeRef.current = { width: 0, height: 0 };

    const onWindowResize = () => scheduleSyncSize();
    window.addEventListener("resize", onWindowResize);

    let unlistenResized: UnlistenFn | undefined;
    let disposed = false;
    void getCurrentWindow()
      .onResized(onWindowResize)
      .then((unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        unlistenResized = unlisten;
      });

    const host = hostRef.current;
    const container = containerRef.current;
    const resizeObserver =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(() => scheduleSyncSize())
        : null;
    if (resizeObserver && host) {
      resizeObserver.observe(host);
    }
    if (resizeObserver && container) {
      resizeObserver.observe(container);
    }

    scheduleSyncSize();
    const raf = requestAnimationFrame(() => scheduleSyncSize());
    terminalRef.current?.focus();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onWindowResize);
      unlistenResized?.();
      resizeObserver?.disconnect();
    };
  }, [active, isConnecting, kind, sessionId, scheduleSyncSize, layoutRevision]);

  useEffect(() => {
    let disposed = false;
    let unlisteners: UnlistenFn[] = [];

    void (async () => {
      const [output, complete, disconnected] = await Promise.all([
        listenSafely<TerminalOutputPayload>("terminal-output", (payload) => {
          if (payload.session_id !== sessionId) return;
          const terminal = terminalRef.current;
          if (!terminal) {
            pendingOutputRef.current.push(payload.data);
            return;
          }
          terminal.write(
            stripOsc8Hyperlinks(localizeTerminalOutputChunk(payload.data)),
          );
          if (payload.data.length > 0) {
            markFirstOutput();
          }

          if (pendingFilenamesRef.current.length === 0) return;
          if (highlightTimerRef.current !== null) {
            clearTimeout(highlightTimerRef.current);
          }
          highlightTimerRef.current = setTimeout(() => {
            highlightTimerRef.current = null;
            scheduleHighlight([...pendingFilenamesRef.current]);
          }, 200);
        }),
        listenSafely<TransferCompletePayload>("transfer-complete", (payload) => {
          if (payload.session_id !== sessionId) return;
          if (payload.direction === "upload" && payload.filenames.length > 0) {
            scheduleHighlight(payload.filenames);
          }
        }),
        listenSafely<SessionLifecyclePayload>("session-disconnected", (payload) => {
          if (payload.session_id !== sessionId) return;
          if (kind !== "ssh") return;
          resetTerminalMouseTracking(terminalRef.current);
          setSessionDisconnected(sessionId);
        }),
      ]);

      if (disposed) {
        output();
        complete();
        disconnected();
        return;
      }

      unlisteners = [output, complete, disconnected];
    })();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [kind, markFirstOutput, sessionId, scheduleHighlight, setSessionDisconnected]);

  useEffect(() => {
    if (isConnecting || !active) return;

    const setDragActive = (activeState: boolean) => {
      setIsDragOver(activeState);
    };

    const hasFiles = (event: DragEvent) =>
      Array.from(event.dataTransfer?.types ?? []).includes("Files");

    const handleDragEnter = (event: DragEvent) => {
      if (isTabReordering()) return;
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current += 1;
      setDragActive(true);
    };

    const handleDragLeave = (event: DragEvent) => {
      if (isTabReordering()) return;
      if (!hasFiles(event)) return;
      event.preventDefault();
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
      if (dragDepthRef.current === 0) {
        setDragActive(false);
      }
    };

    const handleDrop = async (event: DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      dragDepthRef.current = 0;
      setDragActive(false);
      const paths = extractDroppedPaths(event);
      if (paths.length === 0) return;

      if (kind === "ssh") {
        try {
          const results = await uploadLocalPathsToSession(sessionId, paths);
          pendingFilenamesRef.current = results.map((item) => item.filename);
          scheduleHighlight(pendingFilenamesRef.current);
        } catch (err) {
          pushToast(formatTransferError(err), false);
        }
      } else {
        try {
          await invoke("insert_local_paths_command", {
            request: {
              session_id: sessionId,
              local_paths: paths,
            },
          });
        } catch (err) {
          setStatusMessage(formatAppError(err));
        }
      }
    };

    const preventDefaults = (event: DragEvent) => {
      if (isTabReordering()) return;
      if (!hasFiles(event)) return;
      event.preventDefault();
      if (event.dataTransfer) {
        event.dataTransfer.dropEffect = kind === "ssh" ? "copy" : "link";
      }
    };

    const container = containerRef.current;
    container?.addEventListener("dragenter", handleDragEnter);
    container?.addEventListener("dragleave", handleDragLeave);
    container?.addEventListener("dragover", preventDefaults);
    container?.addEventListener("drop", handleDrop);

    let dragUnlisten: UnlistenFn | undefined;
    let dragDisposed = false;

    const appWindow = getCurrentWindow();
    void appWindow.onDragDropEvent(async (event) => {
      if (!activeRef.current) return;
      if (isTabReordering()) return;

      if (event.payload.type === "enter" || event.payload.type === "over") {
        setIsDragOver(true);
        return;
      }

      if (event.payload.type === "leave") {
        setIsDragOver(false);
        return;
      }

      if (event.payload.type !== "drop") return;
      setIsDragOver(false);
      const paths = event.payload.paths;
      if (paths.length === 0) return;

      if (kind === "ssh") {
        try {
          const results = await uploadLocalPathsToSession(sessionId, paths);
          pendingFilenamesRef.current = results.map((item) => item.filename);
          scheduleHighlight(pendingFilenamesRef.current);
        } catch (err) {
          pushToast(formatTransferError(err), false);
        }
      } else {
        try {
          await invoke("insert_local_paths_command", {
            request: {
              session_id: sessionId,
              local_paths: paths,
            },
          });
        } catch (err) {
          setStatusMessage(formatAppError(err));
        }
      }
    }).then((unlisten) => {
      if (dragDisposed) {
        unlisten();
        return;
      }
      dragUnlisten = unlisten;
    });

    return () => {
      dragDisposed = true;
      dragDepthRef.current = 0;
      setIsDragOver(false);
      dragUnlisten?.();
      container?.removeEventListener("dragenter", handleDragEnter);
      container?.removeEventListener("dragleave", handleDragLeave);
      container?.removeEventListener("dragover", preventDefaults);
      container?.removeEventListener("drop", handleDrop);
    };
  }, [active, isConnecting, kind, sessionId, pushToast, scheduleHighlight, setStatusMessage]);

  useEffect(() => {
    if (!active || isConnecting) return;
    resetTerminalMouseTracking(terminalRef.current);
  }, [active, isConnecting, sessionId]);

  useEffect(() => {
    if (!active) {
      dragDepthRef.current = 0;
      setIsDragOver(false);
    }
  }, [active]);

  const dropHint =
    kind === "ssh" ? t("dropHintUpload") : t("dropHintInsertPath");

  const bootMessage =
    kind === "ssh" ? t("bootMessageSsh") : t("bootMessageLocal");
  const connectingMessage =
    kind === "ssh" ? t("connectingMessageSsh") : t("connectingMessageLocal");

  return (
    <div
      className={`terminal-view ${active ? "active" : ""} ${isDragOver ? "drag-over" : ""}${isConnecting ? " terminal-view-connecting" : ""}`}
    >
      <div
        ref={containerRef}
        className="terminal-view-inner"
        onClick={() => active && terminalRef.current?.focus()}
      >
        <div
          ref={hostRef}
          className={`tw-terminal-host${isConnecting ? " tw-terminal-host-hidden" : ""}`}
        />
      </div>
      {isConnecting && active ? (
        <TerminalStatusOverlay message={connectingMessage} subtitle={title} />
      ) : null}
      {!isConnecting && bootOverlayVisible && active ? (
        <TerminalStatusOverlay
          message={bootMessage}
          subtitle={title}
          fading={bootOverlayFading}
        />
      ) : null}
      {isDragOver && active && (
        <div className="terminal-drop-overlay" aria-hidden="true">
          <div className="terminal-drop-overlay-card">
            <div className="terminal-drop-overlay-icon">⇪</div>
            <p>{dropHint}</p>
          </div>
        </div>
      )}
      {fsContextMenu && active ? (
        <TerminalLinkContextMenu
          x={fsContextMenu.x}
          y={fsContextMenu.y}
          pathKind={fsContextMenu.pathKind}
          path={fsContextMenu.path}
          onClose={() => setFsContextMenu(null)}
          onCopyName={() => {
            void copyToClipboard(terminalPathBasename(fsContextMenu.path))
              .then(() => {
                pushToast(t("toastCopiedName"), true);
              })
              .catch((err) => {
                pushToast(formatAppError(err), false);
              });
          }}
          onCopyPath={() => {
            void copyToClipboard(fsContextMenu.path)
              .then(() => {
                pushToast(t("toastCopiedPath"), true);
              })
              .catch((err) => {
                pushToast(formatAppError(err), false);
              });
          }}
          onDownload={
            kind === "ssh"
              ? () => {
                  const { path, pathKind } = fsContextMenu;
                  void downloadRemotePath(sessionId, path, pathKind).catch(
                    (err) => {
                      pushToast(formatTransferError(err), false);
                    },
                  );
                }
              : undefined
          }
          onSendToRemote={
            kind === "ssh"
              ? () => {
                  openSendTo({
                    fromSessionId: sessionId,
                    remotePath: fsContextMenu.path,
                  });
                }
              : undefined
          }
          onPreview={() => {
            void openPreview(sessionId, fsContextMenu.path);
          }}
          onCompress={() => {
            const { path } = fsContextMenu;
            pushToast(t("toastCompressing"), true);
            void invokeWithSudoRetry(
              (sudoPassword) =>
                invoke("compress_path", {
                  request: {
                    session_id: sessionId,
                    path,
                    sudo_password: sudoPassword ?? null,
                  },
                }),
              { action: t("compress"), path },
            )
              .then(() => {
                pushToast(t("toastCompressed"), true);
              })
              .catch((err) => {
                pushToast(formatAppError(err), false);
              });
          }}
          onExtract={
            fsContextMenu.pathKind === "file"
              ? () => {
                  const { path } = fsContextMenu;
                  pushToast(t("toastExtracting"), true);
                  void invokeWithSudoRetry(
                    (sudoPassword) =>
                      invoke("extract_archive", {
                        request: {
                          session_id: sessionId,
                          path,
                          sudo_password: sudoPassword ?? null,
                        },
                      }),
                    { action: t("extract"), path },
                  )
                    .then(() => {
                      pushToast(t("toastExtracted"), true);
                    })
                    .catch((err) => {
                      pushToast(formatAppError(err), false);
                    });
                }
              : undefined
          }
          onViewSize={() => {
            const { path, pathKind } = fsContextMenu;
            setPathSizeDialog({
              path,
              pathKind,
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
                  { action: t("sudoActionViewSize"), path },
                );
                setPathSizeDialog({
                  path,
                  pathKind,
                  loading: false,
                  result,
                  error: null,
                });
              } catch (err) {
                setPathSizeDialog({
                  path,
                  pathKind,
                  loading: false,
                  result: null,
                  error: formatAppError(err),
                });
              }
            })();
          }}
          onRename={() => {
            setFsDialog({
              mode: "rename",
              path: fsContextMenu.path,
              pathKind: fsContextMenu.pathKind,
            });
          }}
          onDelete={() => {
            setFsDialog({
              mode: "delete",
              path: fsContextMenu.path,
              pathKind: fsContextMenu.pathKind,
            });
          }}
          onMove={() => {
            setFsDialog({
              mode: "move",
              path: fsContextMenu.path,
              pathKind: fsContextMenu.pathKind,
            });
          }}
        />
      ) : null}
      {blankContextMenu && active ? (
        <TerminalBlankContextMenu
          x={blankContextMenu.x}
          y={blankContextMenu.y}
          showUpload={kind === "ssh"}
          onClose={() => setBlankContextMenu(null)}
          onUpload={
            kind === "ssh"
              ? () => {
                  void (async () => {
                    try {
                      const { open } = await import("@tauri-apps/plugin-dialog");
                      const selected = await open({
                        multiple: true,
                        title: t("uploadDialogTitle"),
                      });
                      if (selected == null) return;
                      const paths = Array.isArray(selected)
                        ? selected
                        : [selected];
                      if (paths.length === 0) return;
                      const results = await uploadLocalPathsToSession(
                        sessionId,
                        paths,
                      );
                      pendingFilenamesRef.current = results.map(
                        (item) => item.filename,
                      );
                      scheduleHighlight(pendingFilenamesRef.current);
                    } catch (err) {
                      pushToast(formatTransferError(err), false);
                    }
                  })();
                }
              : undefined
          }
          onPaste={() => {
            void (async () => {
              try {
                const text = await readClipboardText();
                if (!text) {
                  pushToast(t("toastClipboardEmpty"), false);
                  return;
                }
                const term = terminalRef.current;
                if (term) {
                  term.paste(text);
                } else {
                  await invoke("terminal_input", {
                    sessionId,
                    data: text,
                  });
                }
              } catch (err) {
                pushToast(formatAppError(err), false);
              }
            })();
          }}
        />
      ) : null}
      {fsDialog && active ? (
        <TerminalFsDialog
          mode={fsDialog.mode}
          sessionId={sessionId}
          path={fsDialog.path}
          pathKind={fsDialog.pathKind}
          onClose={() => setFsDialog(null)}
        />
      ) : null}
      {pathSizeDialog && active ? (
        <PathSizeDialog
          path={pathSizeDialog.path}
          pathKind={pathSizeDialog.pathKind}
          loading={pathSizeDialog.loading}
          result={pathSizeDialog.result}
          error={pathSizeDialog.error}
          onClose={() => setPathSizeDialog(null)}
        />
      ) : null}
    </div>
  );
}
