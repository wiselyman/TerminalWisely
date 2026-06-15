export interface HostOsProfile {
  osId: string;
  osName: string;
}

/** Host OS for local terminal tabs / bookmarks (matches backend `host.rs`). */
export function getHostOsProfile(): HostOsProfile {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? "";

  if (platform.includes("win") || ua.includes("windows")) {
    return { osId: "windows", osName: "Windows" };
  }
  if (platform.includes("mac") || ua.includes("macintosh")) {
    return { osId: "macos", osName: "macOS" };
  }
  return { osId: "linux", osName: "Linux" };
}

export function localTerminalTitle(profile: HostOsProfile = getHostOsProfile()): string {
  return `${profile.osName} 本地终端`;
}
