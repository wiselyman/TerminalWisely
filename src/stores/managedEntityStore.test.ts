import { beforeEach, describe, expect, it } from "vitest";
import { useManagedEntityStore } from "./managedEntityStore";

describe("Home desktop tabs", () => {
  beforeEach(() => {
    useManagedEntityStore.setState({
      homeOpen: true,
      homeDirectoryOpen: true,
      homeChatOpen: false,
      homeDesktopTabs: [],
      activeHomeDesktopTabId: null,
      focusedByKind: {},
    });
  });

  it("opens each Local Desktop card in a new independently selectable tab", () => {
    const store = useManagedEntityStore.getState();
    const first = store.openHomeDesktopTab();
    const second = useManagedEntityStore.getState().openHomeDesktopTab();

    expect(first).not.toBe(second);
    expect(useManagedEntityStore.getState().homeDesktopTabs).toEqual([
      { id: first, title: "Local Desktop" },
      { id: second, title: "Local Desktop" },
    ]);
    expect(useManagedEntityStore.getState().activeHomeDesktopTabId).toBe(second);
    expect(useManagedEntityStore.getState().homeDirectoryOpen).toBe(false);

    useManagedEntityStore.getState().activateHomeDesktopTab(first);
    expect(useManagedEntityStore.getState().activeHomeDesktopTabId).toBe(first);
  });

  it("returns to the Home directory when the final Local Desktop tab closes", () => {
    const tabId = useManagedEntityStore.getState().openHomeDesktopTab();
    useManagedEntityStore.getState().closeHomeDesktopTab(tabId);

    expect(useManagedEntityStore.getState().homeDesktopTabs).toEqual([]);
    expect(useManagedEntityStore.getState().activeHomeDesktopTabId).toBeNull();
    expect(useManagedEntityStore.getState().homeDirectoryOpen).toBe(true);
  });
});
