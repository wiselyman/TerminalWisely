import { describe, expect, it } from "vitest";
import { getDesktopAppsForTarget } from "./desktopApps";

describe("desktop apps by target", () => {
  it("shows AI Local for Home and keeps AI Linux on SSH", () => {
    const localIds = getDesktopAppsForTarget({ kind: "local" }).map((app) => app.id);
    const sshIds = getDesktopAppsForTarget({ kind: "ssh", sessionId: "host-1" }).map((app) => app.id);

    expect(localIds).toContain("aiLocal");
    expect(localIds).not.toContain("aiLinux");
    expect(sshIds).toContain("aiLinux");
    expect(sshIds).not.toContain("aiLocal");
  });
});
