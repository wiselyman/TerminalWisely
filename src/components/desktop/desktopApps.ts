import {
  AiEngineerIcon,
  HostBrowserIcon,
  LocalFilesIcon,
  MarkWiselyIcon,
  TaskManagerIcon,
  TerminalAppIcon,
} from "../WorkspaceToolIcons";
import type { DesktopAppId } from "../../stores/desktopStore";
import { isSshDesktopTarget, type DesktopTarget } from "../../lib/desktopTarget";

export const DESKTOP_APPS: {
  id: DesktopAppId;
  icon: typeof LocalFilesIcon;
  labelKey: string;
  testId: string;
}[] = [
  {
    id: "files",
    icon: LocalFilesIcon,
    labelKey: "desktop.appFiles",
    testId: "dock-app-files",
  },
  {
    id: "processes",
    icon: TaskManagerIcon,
    labelKey: "desktop.appProcesses",
    testId: "dock-app-processes",
  },
  {
    id: "browser",
    icon: HostBrowserIcon,
    labelKey: "desktop.appBrowser",
    testId: "dock-app-browser",
  },
  {
    id: "terminal",
    icon: TerminalAppIcon,
    labelKey: "desktop.appTerminal",
    testId: "dock-app-terminal",
  },
  {
    id: "aiLocal",
    icon: AiEngineerIcon,
    labelKey: "desktop.appAiLocal",
    testId: "dock-app-ai-local",
  },
  {
    id: "aiLinux",
    icon: AiEngineerIcon,
    labelKey: "desktop.appAiLinux",
    testId: "dock-app-ai-linux",
  },
  {
    id: "markwisely",
    icon: MarkWiselyIcon,
    labelKey: "desktop.appMarkWisely",
    testId: "dock-app-markwisely",
  },
];

export function getDesktopAppsForTarget(target: DesktopTarget | null) {
  return DESKTOP_APPS.filter((app) => {
    if (
      target?.kind === "local" &&
      (app.id === "files" || app.id === "processes" || app.id === "browser")
    ) {
      return false;
    }
    if (app.id === "aiLocal") return target?.kind === "local";
    if (app.id === "aiLinux") return isSshDesktopTarget(target);
    return true;
  });
}
