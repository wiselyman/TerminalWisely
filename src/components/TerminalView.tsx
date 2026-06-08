import { useEffect, useRef, useCallback, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type {
  SessionKind,
  TerminalOutputPayload,
  TransferCompletePayload,
} from "../types";
import {
  buildLineColumnMap,
  extractDroppedPaths,
  findRemotePathMatches,
  isModifierClick,
  isShiftClick,
  rangeToColumns,
} from "../lib/terminalLinks";
import {
  findRemotePathAtCell,
  getTerminalMouseCell,
  isRemoteDragModifier,
} from "../lib/terminalMouse";
import { startRemotePointerDrag, DRAG_THRESHOLD_PX } from "../lib/remotePointerDrag";
import { getLinePlainText, resolvePathFromListing } from "../lib/terminalContext";
import {
  clearUploadHighlights,
  scheduleUploadHighlight,
} from "../lib/terminalHighlight";
import { useSessionStore } from "../stores/sessionStore";
import { usePreviewStore } from "../stores/previewStore";
import { isTabReordering } from "../lib/tabPointerReorder";
import { uploadLocalPathsToSession } from "../lib/sessionUpload";
import { createTransferId } from "../lib/transferId";
import { useToastStore } from "../stores/toastStore";
import "@xterm/xterm/css/xterm.css";

interface TerminalViewProps {
  sessionId: string;
  kind: SessionKind;
  active: boolean;
}

async function listenSafely<T>(
  event: string,
  handler: (payload: T) => void,
): Promise<UnlistenFn> {
  return listen<T>(event, (e) => handler(e.payload));
}

export function TerminalView({ sessionId, kind, active }: TerminalViewProps) {
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
  const dragDepthRef = useRef(0);

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
    if (!containerRef.current || !hostRef.current) return;

    const host = hostRef.current;

    const terminal = new Terminal({
      cursorBlink: true,
      fontSize: 14,
      fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
      theme: {
        background: "#0d1117",
        foreground: "#e6edf3",
        cursor: "#58a6ff",
        selectionBackground: "#264f78",
      },
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    fitAddonRef.current = fitAddon;
    terminalRef.current = terminal;

    let cleanupRemoteDrag: (() => void) | undefined;

    if (kind === "ssh" || kind === "local") {
      let suppressModifierActivate = false;
      const screenElement =
        host.querySelector<HTMLElement>(".xterm-screen") ?? host;

      if (kind === "ssh") {
        const handleRemoteMouseDown = (event: MouseEvent) => {
          if (!isRemoteDragModifier(event)) return;
          if (event.button !== 0) return;

          const cell = getTerminalMouseCell(terminal, screenElement, event);
          if (!cell) return;

          const remotePath = findRemotePathAtCell(terminal, cell);
          if (!remotePath) return;

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
                    pushToastRef.current(String(err), false);
                  });
              },
              onCancel: () => {
                pushToastRef.current("请拖到其他 SSH 标签上再松开", false);
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
            const matches = findRemotePathMatches(map.plain);
            if (matches.length === 0) {
              callback(undefined);
              return;
            }

            const links = matches.map(({ path, start, end }) => {
              const { startCol, width } = rangeToColumns(map, line, start, end);
              const resolveClickedPath = () => {
                if (kind !== "ssh") return path;
                const getLinePlain = (lineNumber: number) =>
                  getLinePlainText(
                    (n) => terminal.buffer.active.getLine(n - 1),
                    lineNumber,
                  );
                return resolvePathFromListing(
                  getLinePlain,
                  terminal.buffer.active.length,
                  bufferLineNumber,
                  path,
                );
              };

              return {
                range: {
                  start: { x: startCol + 1, y: bufferLineNumber },
                  end: { x: startCol + width + 1, y: bufferLineNumber },
                },
                text: path,
                decorations: {
                  pointerCursor: true,
                  underline: false,
                },
                activate: (event: MouseEvent, _uri: string) => {
                  const targetPath = resolveClickedPath();
                  if (isModifierClick(event)) {
                    if (suppressModifierActivate) {
                      suppressModifierActivate = false;
                      return;
                    }
                  }
                  if (isShiftClick(event)) {
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
                        if (probe === "file") {
                          openSendToRef.current({
                            fromSessionId: sessionId,
                            remotePath: targetPath,
                          });
                        } else {
                          pushToastRef.current("这是目录，请选择文件路径", false);
                        }
                      } catch (err) {
                        pushToastRef.current(String(err), false);
                      }
                    })();
                    return;
                  }
                  if (isModifierClick(event)) {
                    if (kind !== "ssh") {
                      return;
                    }
                    const transferId = createTransferId();
                    const downloadName =
                      targetPath.split("/").pop() ||
                      targetPath.split("\\").pop() ||
                      targetPath;
                    upsertTransferRef.current({
                      transfer_id: transferId,
                      session_id: sessionId,
                      filename: downloadName,
                      transferred: 0,
                      total: 0,
                      direction: "download",
                    });
                    void invoke("download_file", {
                      request: {
                        session_id: sessionId,
                        remote_path: targetPath,
                        local_path: null,
                        transfer_id: transferId,
                      },
                    }).catch((err) => {
                      removeTransferRef.current(transferId);
                      pushToastRef.current(String(err), false);
                    });
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
                      pushToastRef.current(String(err), false);
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
      void invoke("terminal_input", { sessionId, data }).catch((err) => {
        const message = String(err);
        if (
          message.includes("终端连接已断开") ||
          message.includes("channel closed") ||
          message.includes("Session not found")
        ) {
          pushToast("终端连接已断开，请关闭此标签页后重新连接", false);
        }
      });
    });

    void syncSize();

    return () => {
      cleanupRemoteDrag?.();
      if (resizeTimerRef.current !== null) {
        clearTimeout(resizeTimerRef.current);
      }
      if (highlightTimerRef.current !== null) {
        clearTimeout(highlightTimerRef.current);
      }
      clearUploadHighlights(sessionId);
      onData.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      lastContainerSizeRef.current = { width: 0, height: 0 };
      lastSizeRef.current = { cols: 0, rows: 0 };
    };
  }, [kind, sessionId, syncSize]);

  useEffect(() => {
    if (!active) return;

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

    scheduleSyncSize();
    terminalRef.current?.focus();

    return () => {
      disposed = true;
      window.removeEventListener("resize", onWindowResize);
      unlistenResized?.();
    };
  }, [active, kind, sessionId, scheduleSyncSize]);

  useEffect(() => {
    let disposed = false;
    let unlisteners: UnlistenFn[] = [];

    void (async () => {
      const [output, complete] = await Promise.all([
        listenSafely<TerminalOutputPayload>("terminal-output", (payload) => {
          if (payload.session_id !== sessionId) return;
          const terminal = terminalRef.current;
          if (!terminal) return;
          terminal.write(payload.data);

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
      ]);

      if (disposed) {
        output();
        complete();
        return;
      }

      unlisteners = [output, complete];
    })();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [sessionId, scheduleHighlight]);

  useEffect(() => {
    if (!active) return;

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
          pushToast(String(err), false);
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
          setStatusMessage(String(err));
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
          pushToast(String(err), false);
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
          setStatusMessage(String(err));
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
  }, [active, kind, sessionId, pushToast, scheduleHighlight, setStatusMessage]);

  useEffect(() => {
    if (!active) {
      dragDepthRef.current = 0;
      setIsDragOver(false);
    }
  }, [active]);

  const dropHint =
    kind === "ssh" ? "释放文件以上传到远程服务器" : "释放文件以插入路径";

  return (
    <div
      className={`terminal-view ${active ? "active" : ""} ${isDragOver ? "drag-over" : ""}`}
    >
      <div
        ref={containerRef}
        className="terminal-view-inner"
        onClick={() => active && terminalRef.current?.focus()}
      >
        <div ref={hostRef} className="tw-terminal-host" />
      </div>
      {isDragOver && active && (
        <div className="terminal-drop-overlay" aria-hidden="true">
          <div className="terminal-drop-overlay-card">
            <div className="terminal-drop-overlay-icon">⇪</div>
            <p>{dropHint}</p>
          </div>
        </div>
      )}
    </div>
  );
}
