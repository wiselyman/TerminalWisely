import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useTranslation } from "react-i18next";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { getAppTheme, subscribeAppTheme, terminalThemeFor } from "../../lib/appTheme";
import { isTauriRuntime } from "../../lib/isTauri";
import { getDesktopTerminalHost, subscribeDesktopEmbedHosts } from "../../lib/desktopEmbedHost";
import { useDesktopStore } from "../../stores/desktopStore";
import {
  ensureTerminalFontsLoaded,
  getTerminalFontFamily,
  getTerminalFontSize,
  handleTerminalFontSizeHotkey,
  subscribeTerminalFontSize,
  TERMINAL_LINE_HEIGHT,
} from "../../lib/terminalFont";
import "@xterm/xterm/css/xterm.css";

type OutputPayload = { id: string; data: string };

export function LocalTerminal({ active = true }: { active?: boolean }) {
  const { t } = useTranslation("terminal");
  const slotRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const resizeRef = useRef<() => void>(() => {});
  const desktopHost = useSyncExternalStore(
    subscribeDesktopEmbedHosts,
    getDesktopTerminalHost,
    getDesktopTerminalHost,
  );
  const terminalWindow = useDesktopStore((state) => state.apps.terminal);
  const target = useDesktopStore((state) => state.target);
  const embedHost = active && target?.kind === "local" && terminalWindow.open && !terminalWindow.minimized
    ? desktopHost
    : null;
  const translateRef = useRef(t);
  translateRef.current = t;

  useLayoutEffect(() => {
    const node = hostRef.current;
    const parent = embedHost ?? slotRef.current;
    if (!node || !parent || node.parentElement === parent) return;
    parent.appendChild(node);
    requestAnimationFrame(() => {
      resizeRef.current();
    });
  }, [embedHost]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let disposed = false;
    let terminalId: string | null = null;
    let unlistenOutput: UnlistenFn | undefined;
    const terminal = new Terminal({
      allowProposedApi: true,
      cursorBlink: true,
      fontFamily: getTerminalFontFamily(),
      fontSize: getTerminalFontSize(),
      lineHeight: TERMINAL_LINE_HEIGHT,
      fontWeight: 400,
      fontWeightBold: 700,
      rightClickSelectsWord: false,
      theme: terminalThemeFor(getAppTheme()),
    });
    const fit = new FitAddon();
    terminal.loadAddon(fit);
    terminal.open(host);
    terminal.attachCustomKeyEventHandler((event) => {
      if (handleTerminalFontSizeHotkey(event)) {
        event.preventDefault();
        return false;
      }
      return true;
    });

    const sendSize = () => {
      if (disposed) return;
      try {
        fit.fit();
        if (terminalId) {
          void invoke("local_terminal_resize", {
            id: terminalId,
            cols: terminal.cols,
            rows: terminal.rows,
          }).catch(() => undefined);
        }
      } catch {
        // xterm can briefly report a zero-sized cell while Home is mounting.
      }
    };
    resizeRef.current = sendSize;
    const observer = new ResizeObserver(sendSize);
    observer.observe(host);
    requestAnimationFrame(sendSize);
    const unsubscribeFontSize = subscribeTerminalFontSize((size) => {
      terminal.options.fontSize = size;
      sendSize();
      terminal.refresh(0, terminal.rows - 1);
    });
    const unsubscribeTheme = subscribeAppTheme((theme) => {
      terminal.options.theme = terminalThemeFor(theme);
      terminal.refresh(0, terminal.rows - 1);
    });
    void ensureTerminalFontsLoaded().finally(() => {
      if (!disposed) sendSize();
    });

    if (!isTauriRuntime()) {
      terminal.write(translateRef.current("localTerminalDesktopOnly", "Local terminal is available in the desktop app."));
    } else {
      void (async () => {
        try {
          unlistenOutput = await listen<OutputPayload>("local-terminal-output", (event) => {
            if (event.payload.id === terminalId) terminal.write(event.payload.data);
          });
          if (disposed) {
            unlistenOutput();
            return;
          }
          terminalId = await invoke<string>("local_terminal_start", {
            cols: terminal.cols,
            rows: terminal.rows,
          });
          if (disposed) {
            void invoke("local_terminal_stop", { id: terminalId });
            return;
          }
          terminal.onData((data) => {
            if (terminalId) {
              void invoke("local_terminal_input", { id: terminalId, data }).catch((error) => {
                terminal.write(`\r\n${String(error)}\r\n`);
              });
            }
          });
          sendSize();
        } catch (error) {
          terminal.write(`\r\n${translateRef.current("localTerminalStartFailed", "Could not start local terminal")}: ${String(error)}\r\n`);
        }
      })();
    }

    return () => {
      disposed = true;
      observer.disconnect();
      resizeRef.current = () => {};
      unsubscribeFontSize();
      unsubscribeTheme();
      unlistenOutput?.();
      if (terminalId) void invoke("local_terminal_stop", { id: terminalId });
      terminal.dispose();
    };
  }, []);

  return (
    <div className="home-local-terminal-slot" ref={slotRef}>
      <div className="home-local-terminal" data-testid="home-local-terminal" ref={hostRef} />
    </div>
  );
}
