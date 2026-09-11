export function getCurrentWindow() {
  const noopUnlisten = async () => {};
  return {
    listen: noopUnlisten,
    setFocus: async () => {},
    show: async () => {},
    hide: async () => {},
    close: async () => {},
    minimize: async () => {},
    maximize: async () => {},
    unmaximize: async () => {},
    toggleMaximize: async () => {},
    isMaximized: async () => false,
    isFullscreen: async () => false,
    setFullscreen: async () => {},
    startDragging: async () => {},
    onResized: async () => noopUnlisten,
    onCloseRequested: async () => noopUnlisten,
    onDragDropEvent: async () => noopUnlisten,
    scaleFactor: async () => 1,
    innerSize: async () => ({ width: 1400, height: 860 }),
  };
}

export function getAllWindows() {
  return [getCurrentWindow()];
}

export function Window() {
  return getCurrentWindow();
}

export enum UserAttentionType {
  Critical = 1,
  Informational = 2,
}
