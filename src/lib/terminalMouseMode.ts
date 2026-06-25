import type { Terminal } from "@xterm/xterm";

/** Turn off xterm mouse reporting (DECSET 1000/1002/1003/1006). */
const DISABLE_MOUSE_TRACKING =
  "\x1b[?1000l\x1b[?1002l\x1b[?1003l\x1b[?1006l";

export function resetTerminalMouseTracking(
  terminal: Terminal | null | undefined,
): void {
  if (!terminal) return;
  terminal.write(DISABLE_MOUSE_TRACKING);
}
