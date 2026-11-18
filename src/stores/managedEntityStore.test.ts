import { beforeEach, describe, expect, it } from "vitest";
import { useManagedEntityStore } from "./managedEntityStore";

describe("Home desktop tabs", () => {
  beforeEach(() => {
    useManagedEntityStore.setState({
      homeOpen: true,
      homeDirectoryOpen: true,
      homeChatOpen: false,
      homeDesktopTabs: [{ id: "local-desktop", title: "Local Desktop" }],
      activeHomeDesktopTabId: "local-desktop",
      focusedByKind: {},
    });
  });

  it("keeps exactly one Local Desktop tab and makes activation idempotent", () => {
    const store = useManagedEntityStore.getState();
    const first = store.openHomeDesktopTab();
    const second = useManagedEntityStore.getState().openHomeDesktopTab();

    expect(first).toBe("local-desktop");
    expect(second).toBe(first);
    expect(useManagedEntityStore.getState().homeDesktopTabs).toEqual([
      { id: "local-desktop", title: "Local Desktop" },
    ]);
    expect(useManagedEntityStore.getState().activeHomeDesktopTabId).toBe(second);
    expect(useManagedEntityStore.getState().homeDirectoryOpen).toBe(false);

    useManagedEntityStore.getState().activateHomeDesktopTab(first);
    expect(useManagedEntityStore.getState().activeHomeDesktopTabId).toBe(first);
  });

  it("does not close the pinned Local Desktop tab", () => {
    useManagedEntityStore.getState().closeHomeDesktopTab("local-desktop");

    expect(useManagedEntityStore.getState().homeDesktopTabs).toEqual([
      { id: "local-desktop", title: "Local Desktop" },
    ]);
  });

  it("marks Local Desktop active when the Home local workspace is shown", () => {
    useManagedEntityStore.getState().showHomeWorkspace();
    expect(useManagedEntityStore.getState().activeHomeDesktopTabId).toBe("local-desktop");
  });
});
