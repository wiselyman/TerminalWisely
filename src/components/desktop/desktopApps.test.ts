import { describe, expect, it } from "vitest";
import { getDesktopAppsForTarget } from "./desktopApps";

describe("desktop apps by target", () => {
  it("keeps Home focused on local apps and retains the full SSH desktop", () => {
    const localIds = getDesktopAppsForTarget({ kind: "local" }).map((app) => app.id);
    const sshIds = getDesktopAppsForTarget({ kind: "ssh", sessionId: "host-1" }).map((app) => app.id);

    expect(localIds).toEqual(["terminal", "aiLocal", "markwisely"]);
    expect(sshIds).toEqual(["files", "processes", "browser", "terminal", "aiLinux", "markwisely"]);
  });
});
