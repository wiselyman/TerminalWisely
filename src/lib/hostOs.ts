import i18n from "../i18n";

export interface HostOsProfile {
  osId: string;
  osName: string;
}

export type LocalShellBackend = "git_bash" | "native";

export interface LocalShellInfo {
  backend: LocalShellBackend;
  os_id: string;
  os_name: string;
  title: string;
  git_bash_available: boolean;
}

/** Host OS for local terminal tabs / bookmarks (matches backend `host.rs`). */
export function getHostOsProfile(): HostOsProfile {
  const ua = navigator.userAgent.toLowerCase();
  const platform = navigator.platform?.toLowerCase() ?? "";

  if (platform.includes("win") || ua.includes("windows")) {
    return { osId: "linux", osName: "Git Bash" };
  }
  if (platform.includes("mac") || ua.includes("macintosh")) {
    return { osId: "macos", osName: "macOS" };
  }
  return { osId: "linux", osName: "Linux" };
}

export function localTerminalTitle(profile: HostOsProfile = getHostOsProfile()): string {
  return i18n.t("shell:localTerminalTitle", { osName: profile.osName });
}

export function localShellInfoToProfile(info: LocalShellInfo): HostOsProfile {
  return { osId: info.os_id, osName: info.os_name };
}

export function localShellBackendLabel(backend: LocalShellBackend): string {
  return backend === "git_bash"
    ? i18n.t("shell:backendGitBash")
    : i18n.t("shell:backendLocalShell");
}

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
