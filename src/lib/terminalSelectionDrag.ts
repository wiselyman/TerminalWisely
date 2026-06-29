import type { Terminal } from "@xterm/xterm";

const SYNTHETIC_FLAG = "__twSyntheticTerminalMouseup";

let suppressChromeClickUntil = 0;

/** Document-level mouseup only xterm should see — app handlers must ignore it. */
export function isSyntheticTerminalMouseEvent(event: MouseEvent): boolean {
  return Boolean(
    (event as MouseEvent & { [SYNTHETIC_FLAG]?: boolean })[SYNTHETIC_FLAG],
  );
}

export function shouldSuppressChromeClickAfterTerminalRelease(): boolean {
  return Date.now() < suppressChromeClickUntil;
}

export function armChromeClickSuppress(durationMs = 1000): void {
  suppressChromeClickUntil = Date.now() + durationMs;
}

/**
 * End stale xterm selection drag listeners (missed mouseup after text select).
 * xterm registers document mousemove/mouseup during selection drag; if mouseup
 * is missed, later clicks outside the terminal are swallowed or mis-handled.
 *
 * Only call on left-button interactions. Synthesizing mouseup(button=0) during
 * a right-click pairs with a stranded left mousedown from selection drag and
 * produces a spurious click (common in desktop WebViews).
 */
export function releaseStaleXtermDocumentMouseListeners(): void {
  const event = new MouseEvent("mouseup", {
    bubbles: true,
    cancelable: true,
    view: window,
    button: 0,
    buttons: 0,
  });
  (event as MouseEvent & { [SYNTHETIC_FLAG]?: boolean })[SYNTHETIC_FLAG] = true;
  document.dispatchEvent(event);
  armChromeClickSuppress(400);
}

const terminalBySession = new Map<string, Terminal>();

export function registerTerminalSession(
  sessionId: string,
  terminal: Terminal,
): void {
  terminalBySession.set(sessionId, terminal);
}

export function unregisterTerminalSession(sessionId: string): void {
  terminalBySession.delete(sessionId);
}

function isInsideTerminalHost(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest(".tw-terminal-host")
  );
}

/**
 * Before a left mousedown outside the terminal, release stale xterm document
 * listeners. Right-button presses are skipped — xterm cleans up on the real
 * mouseup(button=2) without synthesizing a left mouseup.
 */
export function bindOutsideTerminalMouseCleanup(): () => void {
  const onMouseDown = (event: MouseEvent) => {
    if (isSyntheticTerminalMouseEvent(event)) return;
    if (isInsideTerminalHost(event.target)) return;
    if (event.button !== 0) return;
    releaseStaleXtermDocumentMouseListeners();
  };

  const onSpuriousTabClick = (event: MouseEvent) => {
    if (!shouldSuppressChromeClickAfterTerminalRelease()) return;
    if (!(event.target instanceof HTMLElement)) return;
    if (!event.target.closest(".tab[data-session-id]")) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  document.addEventListener("mousedown", onMouseDown, true);
  document.addEventListener("click", onSpuriousTabClick, true);
  return () => {
    document.removeEventListener("mousedown", onMouseDown, true);
    document.removeEventListener("click", onSpuriousTabClick, true);
  };
}

/** Clear stale xterm drag listeners when the pointer leaves the terminal host. */
export function bindTerminalSelectionDragRelease(
  host: HTMLElement,
  terminal: Terminal,
): () => void {
  let pointerDownOnHost = false;

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointerDownOnHost = true;
  };

  const onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    pointerDownOnHost = false;
  };

  const onPointerCancel = () => {
    pointerDownOnHost = false;
  };

  const onPointerLeave = () => {
    if (pointerDownOnHost || !terminal.hasSelection()) return;
    releaseStaleXtermDocumentMouseListeners();
  };

  host.addEventListener("pointerdown", onPointerDown, true);
  host.addEventListener("pointerup", onPointerUp, true);
  host.addEventListener("pointercancel", onPointerCancel, true);
  host.addEventListener("pointerleave", onPointerLeave, true);

  return () => {
    host.removeEventListener("pointerdown", onPointerDown, true);
    host.removeEventListener("pointerup", onPointerUp, true);
    host.removeEventListener("pointercancel", onPointerCancel, true);
    host.removeEventListener("pointerleave", onPointerLeave, true);
  };
}
