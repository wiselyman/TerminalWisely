import {
  AiEngineerIcon,
  HostBrowserIcon,
  LocalFilesIcon,
  TaskManagerIcon,
  TerminalAppIcon,
} from "../WorkspaceToolIcons";
import type { DesktopAppId } from "../../stores/desktopStore";

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
    id: "aiLinux",
    icon: AiEngineerIcon,
    labelKey: "desktop.appAiLinux",
    testId: "dock-app-ai-linux",
  },
];
