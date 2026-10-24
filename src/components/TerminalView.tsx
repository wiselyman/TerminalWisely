import { useEffect, useLayoutEffect, useRef, useCallback, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { invoke } from "@tauri-apps/api/core";
import { listen, UnlistenFn } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { SessionKind, SessionLifecyclePayload, TerminalOutputPayload } from "../types";
import { stripOsc8Hyperlinks } from "../lib/terminalLinks";
import { registerTerminalSelectionProvider } from "../lib/aiEngineer/terminalSelectionBridge";
import { sendConsoleSelectionToChat } from "../lib/aiEngineer/sendToChat";
import { resetTerminalMouseTracking } from "../lib/terminalMouseMode";
import {
  armChromeClickSuppress,
  armTerminalPointerSuppress,
  bindTerminalSelectionDragRelease,
  registerTerminalSession,
  releaseStaleXtermDocumentMouseListeners,
  shouldSuppressTerminalPointer,
  unregisterTerminalSession,
} from "../lib/terminalSelectionDrag";
import { getDesktopTerminalHost, subscribeDesktopEmbedHosts } from "../lib/desktopEmbedHost";
import { useDesktopStore } from "../stores/desktopStore";
import { useSessionStore } from "../stores/sessionStore";
import { useAiEngineerStore } from "../stores/aiEngineerStore";
import { shouldAutoReconnectSsh } from "../lib/aiEngineer/sshLease";
import {
  TERMINAL_LINE_HEIGHT,
  ensureTerminalFontsLoaded,
  getTerminalFontFamily,
  getTerminalFontSize,
  handleTerminalFontSizeHotkey,
  subscribeTerminalFontSize,
} from "../lib/terminalFont";
import { getAppTheme, subscribeAppTheme, terminalThemeFor } from "../lib/appTheme";
import { formatAppError } from "../lib/formatAppError";
import { localizeTerminalOutputChunk } from "../lib/localizeTerminalOutput";
import { copyToClipboard, readClipboardText } from "../lib/clipboard";
import { useToastStore } from "../stores/toastStore";
import { TerminalStatusOverlay } from "./TerminalStatusOverlay";
import { TerminalBlankContextMenu } from "./TerminalLinkContextMenu";
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

export function TerminalView({
  sessionId,
  kind,
  active,
  connectionStatus = "ready",
  title,
  layoutRevision = "",
}: TerminalViewProps) {
  const desktopOpen = useDesktopStore((s) => s.open);
  const desktopSessionId = useDesktopStore((s) => s.sessionId);
  const desktopTerminal = useDesktopStore((s) => s.apps.terminal);
  const terminalHost = useSyncExternalStore(
    subscribeDesktopEmbedHosts,
    getDesktopTerminalHost,
    getDesktopTerminalHost,
  );
  const terminalEmbedHost =
    active &&
    desktopOpen &&
    desktopSessionId === sessionId &&
    desktopTerminal.open &&
    !desktopTerminal.minimized
      ? terminalHost
      : null;
  const portalHostRef = useRef<HTMLDivElement | null>(null);
  if (!portalHostRef.current) {
    const el = document.createElement("div");
    el.className = "terminal-portal-host";
    portalHostRef.current = el;
  }
  const stackSlotRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const el = portalHostRef.current;
    const parent = terminalEmbedHost ?? stackSlotRef.current;
    if (!el || !parent || el.parentElement === parent) return;
    parent.appendChild(el);
  }, [terminalEmbedHost]);

  useEffect(() => {
    const el = portalHostRef.current;
    return () => {
      el?.remove();
    };
  }, []);
  const { t } = useTranslation("terminal");
  const { t: tTools } = useTranslation("tools");
  const containerRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const lastSizeRef = useRef({ cols: 0, rows: 0 });
  const lastContainerSizeRef = useRef({ width: 0, height: 0 });
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSessionDisconnected = useSessionStore((s) => s.setSessionDisconnected);
  const reconnectSession = useSessionStore((s) => s.reconnectSession);
  const isDisconnected = useSessionStore((s) =>
    s.disconnectedSessionIds.has(sessionId),
  );
  const aiSshLeased = useAiEngineerStore((s) =>
    Boolean(s.leasedSessionIds[sessionId]),
  );
  const pushToast = useToastStore((s) => s.pushToast);
  const pushToastRef = useRef(pushToast);
  pushToastRef.current = pushToast;
  const [bootOverlayVisible, setBootOverlayVisible] = useState(true);
  const [bootOverlayFading, setBootOverlayFading] = useState(false);
  const [autoReconnecting, setAutoReconnecting] = useState(false);
  const autoReconnectAttemptRef = useRef(0);
  const [blankContextMenu, setBlankContextMenu] = useState<{
    x: number;
    y: number;
    selection: string;
  } | null>(null);
  const setBlankContextMenuRef = useRef(setBlankContextMenu);
  /** Saved on right mousedown before contextmenu handlers can clear xterm selection. */
  const contextMenuSelectionRef = useRef("");
  /** Last non-empty selection — xterm often clears selection before contextmenu. */
  const lastSelectionRef = useRef("");
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

  activeRef.current = active;

  const syncSize = useCallback(async () => {
    const container = containerRef.current;
    const host = hostRef.current;
    const terminal = terminalRef.current;
    const fitAddon = fitAddonRef.current;
    if (!container || !host || !terminal || !fitAddon || !activeRef.current) return;

    const width = host.clientWidth;
    const height = host.clientHeight;
    // A 0-size box is not a finished layout. Do not remember it.
    if (width <= 0 || height <= 0) return;

    const last = lastContainerSizeRef.current;
    if (last.width === width && last.height === height) {
      return;
    }
    lastContainerSizeRef.current = { width, height };

    try {
      fitAddon.fit();
      terminal.refresh(0, Math.max(0, terminal.rows - 1));
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
      fontSize: getTerminalFontSize(),
      lineHeight: TERMINAL_LINE_HEIGHT,
      fontFamily: getTerminalFontFamily(),
      fontWeight: 400,
      fontWeightBold: 700,
      theme: terminalThemeFor(getAppTheme()),
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

    const applyFontSize = (size: number) => {
      if (disposed || !terminalRef.current || !fitAddonRef.current) return;
      try {
        terminalRef.current.options.fontSize = size;
        fitAddonRef.current.fit();
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
        scheduleSyncSize();
      } catch {
        // Terminal may already be disposed.
      }
    };

    terminal.attachCustomKeyEventHandler((ev) => {
      if (handleTerminalFontSizeHotkey(ev)) {
        ev.preventDefault();
        return false;
      }
      return true;
    });

    const unsubFontSize = subscribeTerminalFontSize(applyFontSize);
    const unsubTheme = subscribeAppTheme((theme) => {
      if (disposed || !terminalRef.current) return;
      try {
        terminalRef.current.options.theme = terminalThemeFor(theme);
        terminalRef.current.refresh(0, terminalRef.current.rows - 1);
      } catch {
        // Terminal may already be disposed.
      }
    });

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

    registerTerminalSelectionProvider(sessionId, () => {
      if (terminal.hasSelection()) return terminal.getSelection();
      return lastSelectionRef.current;
    });

    const onSelectionChange = terminal.onSelectionChange(() => {
      if (terminal.hasSelection()) {
        const text = terminal.getSelection();
        lastSelectionRef.current = text;
        contextMenuSelectionRef.current = text;
      }
    });

    const readContextMenuSelection = () => {
      // Prefer live selection, then mousedown snapshot, then last known selection
      // (xterm clears selection on contextmenu before our handler runs).
      if (terminal.hasSelection()) {
        const live = terminal.getSelection();
        if (live) return live;
      }
      const saved = contextMenuSelectionRef.current || lastSelectionRef.current;
      return saved;
    };

    const hasContextMenuSelection = () => readContextMenuSelection().length > 0;

    const onHostMouseDown = (event: MouseEvent) => {
      if (event.button === 2) {
        const snap = terminal.hasSelection()
          ? terminal.getSelection()
          : lastSelectionRef.current;
        contextMenuSelectionRef.current = snap;
        if (snap) lastSelectionRef.current = snap;
        armChromeClickSuppress(800);
        armTerminalPointerSuppress(400);
        releaseStaleXtermDocumentMouseListeners({ armClickSuppress: false });
        return;
      }
      // Trackpad: after two-finger right-click, the following one-finger left
      // press must not start an xterm selection drag.
      if (event.button === 0 && shouldSuppressTerminalPointer()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        terminal.clearSelection();
        releaseStaleXtermDocumentMouseListeners({ armClickSuppress: false });
      }
    };

    const openBlankMenu = (event: MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const selection = readContextMenuSelection();
      armTerminalPointerSuppress(400);
      releaseStaleXtermDocumentMouseListeners({ armClickSuppress: false });
      setBlankContextMenuRef.current({
        x: event.clientX,
        y: event.clientY,
        selection,
      });
    };

    const onHostContextMenu = (event: MouseEvent) => {
      if (terminal.hasSelection()) {
        const live = terminal.getSelection();
        contextMenuSelectionRef.current = live;
        lastSelectionRef.current = live;
      } else if (!contextMenuSelectionRef.current && lastSelectionRef.current) {
        contextMenuSelectionRef.current = lastSelectionRef.current;
      }
      armChromeClickSuppress(800);
      armTerminalPointerSuppress(400);
      releaseStaleXtermDocumentMouseListeners({ armClickSuppress: false });

      if (kind === "ssh" || hasContextMenuSelection()) {
        openBlankMenu(event);
      }
    };
    host.addEventListener("mousedown", onHostMouseDown, true);
    host.addEventListener("contextmenu", onHostContextMenu, true);

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
      unsubFontSize();
      unsubTheme();
      registerTerminalSelectionProvider(sessionId, null);
      cleanupSelectionDrag();
      unregisterTerminalSession(sessionId);
      if (resizeTimerRef.current !== null) {
        clearTimeout(resizeTimerRef.current);
      }
      host.removeEventListener("mousedown", onHostMouseDown, true);
      host.removeEventListener("contextmenu", onHostContextMenu, true);
      host.removeEventListener("focus", onHostFocus, true);
      onSelectionChange.dispose();
      onData.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
      lastContainerSizeRef.current = { width: 0, height: 0 };
      lastSizeRef.current = { cols: 0, rows: 0 };
    };
  }, [isConnecting, kind, markFirstOutput, scheduleSyncSize, sessionId, setSessionDisconnected, syncSize]);

  useEffect(() => {
    if (!active || isConnecting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (handleTerminalFontSizeHotkey(event)) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [active, isConnecting]);

  useEffect(() => {
    if (
      !shouldAutoReconnectSsh({
        kind,
        isDisconnected,
        leased: aiSshLeased,
      })
    ) {
      autoReconnectAttemptRef.current = 0;
      setAutoReconnecting(false);
      return;
    }

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const attempt = () => {
      if (cancelled) return;
      const n = autoReconnectAttemptRef.current;
      if (n >= 5) {
        setAutoReconnecting(false);
        return;
      }
      autoReconnectAttemptRef.current = n + 1;
      setAutoReconnecting(true);
      const { cols, rows } = lastSizeRef.current;
      void reconnectSession(
        sessionId,
        cols > 0 ? cols : 80,
        rows > 0 ? rows : 24,
        { silent: true },
      ).then((ok) => {
        if (cancelled) return;
        if (ok) {
          setAutoReconnecting(false);
          autoReconnectAttemptRef.current = 0;
          return;
        }
        const delay = Math.min(30_000, 1000 * 2 ** n);
        timer = setTimeout(attempt, delay);
      });
    };

    timer = setTimeout(attempt, 600);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [isDisconnected, kind, reconnectSession, sessionId, aiSshLeased]);

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
  }, [active, isConnecting, kind, sessionId, scheduleSyncSize, layoutRevision, terminalEmbedHost]);

  useEffect(() => {
    let disposed = false;
    let unlisteners: UnlistenFn[] = [];

    void (async () => {
      const [output, disconnected] = await Promise.all([
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
        disconnected();
        return;
      }

      unlisteners = [output, disconnected];
    })();

    return () => {
      disposed = true;
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [kind, markFirstOutput, sessionId, setSessionDisconnected]);


  useEffect(() => {
    if (!active || isConnecting) return;
    resetTerminalMouseTracking(terminalRef.current);
  }, [active, isConnecting, sessionId]);

  const bootMessage = t("bootMessageSsh");
  const connectingMessage = t("connectingMessageSsh");

  const terminalNode = (
    <div
      className={`terminal-view ${active ? "active" : ""}${isConnecting ? " terminal-view-connecting" : ""}`}
      data-testid="terminal-view"
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
      {isDisconnected && kind === "ssh" && active && !isConnecting ? (
        <div className="terminal-disconnect-banner" role="status">
          <span>
            {aiSshLeased
              ? tTools("sshLease.disconnectBanner")
              : autoReconnecting
                ? t("statusAutoReconnecting")
                : t("statusDisconnected")}
          </span>
          {!autoReconnecting && !aiSshLeased ? (
            <button
              type="button"
              className="terminal-disconnect-banner-btn"
              onClick={() => {
                const { cols, rows } = lastSizeRef.current;
                void reconnectSession(
                  sessionId,
                  cols > 0 ? cols : 80,
                  rows > 0 ? rows : 24,
                );
              }}
            >
              {t("reconnectNow")}
            </button>
          ) : null}
        </div>
      ) : null}
      {blankContextMenu && active ? (
        <TerminalBlankContextMenu
          x={blankContextMenu.x}
          y={blankContextMenu.y}
          canCopy={blankContextMenu.selection.length > 0}
          canSendToChat={blankContextMenu.selection.trim().length > 0}
          onClose={() => {
            contextMenuSelectionRef.current = "";
            terminalRef.current?.clearSelection();
            setBlankContextMenu(null);
          }}
          onCopy={() => {
            const text = blankContextMenu.selection;
            if (!text) return;
            void copyToClipboard(text).catch((err) => {
              pushToast(formatAppError(err), false);
            });
          }}
          onSendToChat={() => {
            const tab = useSessionStore
              .getState()
              .tabs.find((item) => item.id === sessionId);
            sendConsoleSelectionToChat(
              sessionId,
              blankContextMenu.selection,
              tab?.server_id ?? undefined,
            );
          }}
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

    </div>
  );
  return (
    <>
      <div
        ref={(el) => {
          stackSlotRef.current = el;
          const portal = portalHostRef.current;
          if (el && portal && !terminalEmbedHost && portal.parentElement !== el) {
            el.appendChild(portal);
          }
        }}
        className={`terminal-stack-slot${active ? " active" : ""}`}
      />
      {createPortal(terminalNode, portalHostRef.current)}
    </>
  );
}
