export function isWindowsHost(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? "";
  return platform.includes("win") || ua.includes("windows");
}

export function isMacHost(): boolean {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? "";
  return platform.includes("mac") || ua.includes("macintosh");
}

/** CSS hook on `.app-shell` for platform-specific chrome (tabs, spacing). */
export function getPlatformShellClass(): string {
  if (isMacHost()) return "platform-macos";
  if (isWindowsHost()) return "platform-windows";
  return "platform-linux";
}
