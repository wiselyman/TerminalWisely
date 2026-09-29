/** Portal targets for the single terminal and AI panel inside desktop windows. */

let terminalHost: HTMLElement | null = null;
let aiHost: HTMLElement | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const listener of listeners) listener();
}

export function setDesktopTerminalHost(el: HTMLElement | null) {
  if (terminalHost === el) return;
  terminalHost = el;
  notify();
}

export function getDesktopTerminalHost() {
  return terminalHost;
}

export function setDesktopAiHost(el: HTMLElement | null) {
  if (aiHost === el) return;
  aiHost = el;
  notify();
}

export function getDesktopAiHost() {
  return aiHost;
}

export function subscribeDesktopEmbedHosts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
