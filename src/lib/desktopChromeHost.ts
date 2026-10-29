/** Portal host for maximized Desktop app controls in the main titlebar. */

let chromeHost: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setDesktopChromeHost(el: HTMLElement | null) {
  chromeHost = el;
  for (const listener of listeners) listener();
}

export function getDesktopChromeHost() {
  return chromeHost;
}

export function subscribeDesktopChromeHost(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
