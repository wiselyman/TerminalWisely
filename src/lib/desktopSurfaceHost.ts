/** Portal host for windowed desktop apps (inside host-desktop-surface). */

let surfaceHost: HTMLElement | null = null;
const listeners = new Set<() => void>();

export function setDesktopSurfaceHost(el: HTMLElement | null) {
  surfaceHost = el;
  for (const listener of listeners) listener();
}

export function getDesktopSurfaceHost() {
  return surfaceHost;
}

export function subscribeDesktopSurfaceHost(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
