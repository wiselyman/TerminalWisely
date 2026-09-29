/** Desktop AI Linux calls into the AI panel without a store import cycle. */

let bindImpl: (sessionId: string) => void = () => {};
let parkImpl: () => void = () => {};

export function registerDesktopAiBridge(impl: {
  bind: (sessionId: string) => void;
  park: () => void;
}) {
  bindImpl = impl.bind;
  parkImpl = impl.park;
}

/** Show the existing AI chat inside the desktop AI Linux window. */
export function bindDesktopAi(sessionId: string) {
  bindImpl(sessionId);
}

/** Hide the AI side strip. The chat fiber stays mounted. */
export function parkDesktopAi() {
  parkImpl();
}
