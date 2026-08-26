import { useEffect, useRef } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import {
  k8sPodShellInput,
  k8sPodShellResize,
  k8sPodShellStart,
  k8sPodShellStop,
} from "../../lib/k8s/api";
import type { K8sClusterTarget } from "../../lib/k8s/types";
import {
  TERMINAL_FONT_SIZE,
  TERMINAL_LINE_HEIGHT,
  ensureTerminalFontsLoaded,
  getTerminalFontFamily,
} from "../../lib/terminalFont";
import "@xterm/xterm/css/xterm.css";

type Props = {
  cluster: K8sClusterTarget;
  namespace: string;
  pod: string;
  container?: string | null;
  onExit?: () => void;
  onReady?: (shellId: string) => void;
  onError?: (message: string) => void;
};

export function K8sPodShellTerminal({
  cluster,
  namespace,
  pod,
  container,
  onExit,
  onReady,
  onError,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const shellIdRef = useRef<string | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let term: Terminal | null = null;
    let fit: FitAddon | null = null;
    const unlisteners: UnlistenFn[] = [];

    const cleanup = () => {
      disposed = true;
      for (const u of unlisteners) u();
      if (shellIdRef.current) {
        void k8sPodShellStop(shellIdRef.current);
        shellIdRef.current = null;
      }
      term?.dispose();
    };

    void (async () => {
      await ensureTerminalFontsLoaded();
      if (disposed) return;

      term = new Terminal({
        fontFamily: getTerminalFontFamily(),
        fontSize: TERMINAL_FONT_SIZE,
        lineHeight: TERMINAL_LINE_HEIGHT,
        cursorBlink: true,
        theme: {
          background: "#010409",
          foreground: "#e6edf3",
          cursor: "#58a6ff",
        },
        scrollback: 5000,
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();

      const resize = () => {
        if (!term || !fit || !shellIdRef.current) return;
        fit.fit();
        void k8sPodShellResize(
          shellIdRef.current,
          term.cols,
          term.rows,
        ).catch(() => {});
      };
      const ro = new ResizeObserver(() => resize());
      ro.observe(host);
      unlisteners.push(() => ro.disconnect());

      try {
        const info = await k8sPodShellStart(
          cluster,
          namespace,
          pod,
          container ?? null,
          term.cols,
          term.rows,
        );
        if (disposed) {
          void k8sPodShellStop(info.id);
          return;
        }
        shellIdRef.current = info.id;
        onReady?.(info.id);

        unlisteners.push(
          await listen<{ shell_id: string; data: string }>(
            "k8s-shell-output",
            (event) => {
              if (event.payload.shell_id !== info.id || !term) return;
              term.write(event.payload.data);
            },
          ),
        );
        unlisteners.push(
          await listen<{ shell_id: string }>("k8s-shell-exit", (event) => {
            if (event.payload.shell_id !== info.id) return;
            onExit?.();
          }),
        );

        term.onData((data) => {
          void k8sPodShellInput(info.id, data);
        });
        resize();
      } catch (err) {
        onError?.(err instanceof Error ? err.message : String(err));
      }
    })();

    return cleanup;
  }, [cluster, namespace, pod, container, onError, onExit, onReady]);

  return <div className="k8s-pod-shell-terminal" ref={hostRef} />;
}
