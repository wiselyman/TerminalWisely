import { useEffect, useRef, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { useTranslation } from "react-i18next";
import {
  k8sNodeShellStart,
  k8sPodShellInput,
  k8sPodShellResize,
  k8sPodShellStart,
  k8sPodShellStop,
} from "../../lib/k8s/api";
import type { K8sClusterTarget } from "../../lib/k8s/types";
import { copyToClipboard } from "../../lib/clipboard";
import {
  TERMINAL_LINE_HEIGHT,
  ensureTerminalFontsLoaded,
  getTerminalFontFamily,
  getTerminalFontSize,
  handleTerminalFontSizeHotkey,
  subscribeTerminalFontSize,
} from "../../lib/terminalFont";
import { K8sSelectionContextMenu } from "./K8sSelectionContextMenu";
import "@xterm/xterm/css/xterm.css";

type Props = {
  cluster: K8sClusterTarget;
  mode?: "pod" | "node";
  namespace: string;
  pod: string;
  container?: string | null;
  onExit?: () => void;
  onReady?: (shellId: string) => void;
  onError?: (message: string) => void;
  onSendSelection?: (text: string) => void;
};

function clusterSessionKey(cluster: K8sClusterTarget): string {
  return cluster.kind === "kubeconfig"
    ? `${cluster.id}:${cluster.kubeconfig_path ?? ""}:${cluster.context ?? ""}`
    : cluster.id;
}

export function K8sPodShellTerminal({
  cluster,
  mode = "pod",
  namespace,
  pod,
  container,
  onExit,
  onReady,
  onError,
  onSendSelection,
}: Props) {
  const { t } = useTranslation(["k8s", "terminal"]);
  const hostRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const shellIdRef = useRef<string | null>(null);
  const selectionRef = useRef("");
  const contextMenuSelectionRef = useRef("");
  const onErrorRef = useRef(onError);
  const onExitRef = useRef(onExit);
  const onReadyRef = useRef(onReady);
  const onSendSelectionRef = useRef(onSendSelection);
  onErrorRef.current = onError;
  onExitRef.current = onExit;
  onReadyRef.current = onReady;
  onSendSelectionRef.current = onSendSelection;
  const [hasSelection, setHasSelection] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; text: string } | null>(
    null,
  );

  const sessionKey = `${clusterSessionKey(cluster)}/${mode}/${namespace}/${pod}/${container ?? ""}`;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let term: Terminal | null = null;
    let fit: FitAddon | null = null;
    const unlisteners: UnlistenFn[] = [];
    const earlyOutput: Array<{ shell_id: string; data: string }> = [];
    const earlyExitIds: string[] = [];
    let lastCols = 0;
    let lastRows = 0;

    const cleanup = () => {
      disposed = true;
      for (const u of unlisteners) u();
      if (shellIdRef.current) {
        void k8sPodShellStop(shellIdRef.current);
        shellIdRef.current = null;
      }
      termRef.current = null;
      term?.dispose();
    };

    void (async () => {
      await ensureTerminalFontsLoaded();
      if (disposed) return;

      term = new Terminal({
        fontFamily: getTerminalFontFamily(),
        fontSize: getTerminalFontSize(),
        lineHeight: TERMINAL_LINE_HEIGHT,
        cursorBlink: true,
        theme: {
          background: "#010409",
          foreground: "#e6edf3",
          cursor: "#58a6ff",
          selectionBackground: "#264f78",
        },
        scrollback: 5000,
      });
      fit = new FitAddon();
      term.loadAddon(fit);
      term.open(host);
      fit.fit();
      termRef.current = term;
      if (mode === "node") {
        term.write("\r\n\x1b[90mConnecting to node host shell (nsenter)…\x1b[0m\r\n");
      }

      term.onSelectionChange(() => {
        const text = term?.hasSelection() ? term.getSelection() : "";
        selectionRef.current = text;
        setHasSelection(text.trim().length > 0);
      });

      const onMouseDown = (event: MouseEvent) => {
        if (event.button !== 2) return;
        // xterm clears selection on contextmenu — snapshot first.
        contextMenuSelectionRef.current = term?.hasSelection()
          ? term.getSelection()
          : selectionRef.current;
      };
      host.addEventListener("mousedown", onMouseDown, true);
      unlisteners.push(() =>
        host.removeEventListener("mousedown", onMouseDown, true),
      );

      const resize = () => {
        if (!term || !fit || !shellIdRef.current) return;
        fit.fit();
        if (term.cols === lastCols && term.rows === lastRows) return;
        lastCols = term.cols;
        lastRows = term.rows;
        void k8sPodShellResize(
          shellIdRef.current,
          term.cols,
          term.rows,
        ).catch(() => {});
      };
      term.attachCustomKeyEventHandler((ev) => {
        if (handleTerminalFontSizeHotkey(ev)) {
          ev.preventDefault();
          return false;
        }
        return true;
      });
      unlisteners.push(
        subscribeTerminalFontSize((size) => {
          if (!term || !fit) return;
          term.options.fontSize = size;
          fit.fit();
          term.refresh(0, term.rows - 1);
          resize();
        }),
      );
      const ro = new ResizeObserver(() => resize());
      ro.observe(host);
      unlisteners.push(() => ro.disconnect());

      unlisteners.push(
        await listen<{ shell_id: string; data: string }>(
          "k8s-shell-output",
          (event) => {
            const id = shellIdRef.current;
            if (!id) {
              earlyOutput.push(event.payload);
              return;
            }
            if (event.payload.shell_id !== id || !term) return;
            term.write(event.payload.data);
          },
        ),
      );
      unlisteners.push(
        await listen<{ shell_id: string }>("k8s-shell-exit", (event) => {
          const id = shellIdRef.current;
          if (!id) {
            earlyExitIds.push(event.payload.shell_id);
            return;
          }
          if (event.payload.shell_id !== id) return;
          term?.write("\r\n\x1b[90mShell session ended.\x1b[0m\r\n");
          onExitRef.current?.();
        }),
      );

      try {
        const cols = Math.max(term.cols, 80);
        const rows = Math.max(term.rows, 24);
        const info =
          mode === "node"
            ? await k8sNodeShellStart(cluster, pod, cols, rows)
            : await k8sPodShellStart(
                cluster,
                namespace,
                pod,
                container ?? null,
                cols,
                rows,
              );
        if (disposed) {
          void k8sPodShellStop(info.id);
          return;
        }
        shellIdRef.current = info.id;
        onReadyRef.current?.(info.id);
        lastCols = term.cols;
        lastRows = term.rows;

        for (const evt of earlyOutput) {
          if (evt.shell_id === info.id) {
            term.write(evt.data);
          }
        }
        if (earlyExitIds.includes(info.id)) {
          term.write("\r\n\x1b[90mShell session ended.\x1b[0m\r\n");
          onExitRef.current?.();
        }

        term.onData((data) => {
          void k8sPodShellInput(info.id, data);
        });
        resize();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        term?.write(`\r\n\x1b[31m${msg}\x1b[0m\r\n`);
        onErrorRef.current?.(msg);
      }
    })();

    return cleanup;
    // cluster identity is folded into sessionKey — avoid remount on store object churn
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionKey]);

  const readMenuSelection = () => {
    const saved = contextMenuSelectionRef.current || selectionRef.current;
    if (saved.trim()) return saved;
    return termRef.current?.hasSelection() ? termRef.current.getSelection() : "";
  };

  return (
    <div className="k8s-terminal-shell-wrap">
      {onSendSelection && hasSelection ? (
        <div className="k8s-terminal-selection-bar">
          <button
            type="button"
            className="k8s-refresh-btn"
            data-testid="k8s-pod-shell-send-chat"
            title={t("terminal:sendToChat")}
            aria-label={t("terminal:sendToChat")}
            onClick={() => {
              const text = selectionRef.current.trim();
              if (!text) return;
              onSendSelectionRef.current?.(text);
            }}
          >
            <MessageSquare size={14} strokeWidth={2} />
          </button>
        </div>
      ) : null}
      <div
        className="k8s-pod-shell-terminal"
        data-testid="k8s-pod-shell-terminal"
        ref={hostRef}
        onContextMenu={(e) => {
          const text = readMenuSelection();
          if (!text.trim()) return;
          e.preventDefault();
          e.stopPropagation();
          setMenu({ x: e.clientX, y: e.clientY, text });
        }}
      />
      {menu ? (
        <K8sSelectionContextMenu
          x={menu.x}
          y={menu.y}
          text={menu.text}
          testIdPrefix="k8s-pod-shell"
          onCopy={(text) => void copyToClipboard(text)}
          onSendToChat={
            onSendSelection
              ? (text) => onSendSelectionRef.current?.(text)
              : undefined
          }
          onClose={() => setMenu(null)}
        />
      ) : null}
    </div>
  );
}
