import { useLayoutEffect, useState } from "react";
import type { Terminal } from "@xterm/xterm";
import {
  computeTerminalPathHighlightRect,
  type TerminalPathHighlightAnchor,
  type TerminalPathHighlightRect,
} from "../lib/terminalMouse";

type Props = {
  terminal: Terminal;
  screenElement: HTMLElement;
  containerElement: HTMLElement;
  anchor: TerminalPathHighlightAnchor;
  layoutRevision?: string;
};

export function TerminalPathContextHighlight({
  terminal,
  screenElement,
  containerElement,
  anchor,
  layoutRevision = "",
}: Props) {
  const [rect, setRect] = useState<TerminalPathHighlightRect | null>(null);

  useLayoutEffect(() => {
    const update = () => {
      setRect(
        computeTerminalPathHighlightRect(
          terminal,
          screenElement,
          containerElement,
          anchor.bufferLineNumber,
          anchor.startCol,
          anchor.colWidth,
        ),
      );
    };

    update();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;
    ro?.observe(screenElement);
    ro?.observe(containerElement);

    const scrollDisposable = terminal.onScroll(update);
    window.addEventListener("resize", update);

    return () => {
      ro?.disconnect();
      scrollDisposable.dispose();
      window.removeEventListener("resize", update);
    };
  }, [
    terminal,
    screenElement,
    containerElement,
    anchor.bufferLineNumber,
    anchor.startCol,
    anchor.colWidth,
    layoutRevision,
  ]);

  if (!rect) return null;

  return (
    <div
      className="terminal-path-context-highlight"
      aria-hidden="true"
      style={{
        top: rect.top,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }}
    />
  );
}
