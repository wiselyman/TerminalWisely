/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it, vi } from "vitest";

const bindManagedEntity = vi.fn();
const focusManaged = vi.fn();

vi.mock("./aiEngineerStore", () => ({
  useAiEngineerStore: { getState: () => ({ bindManagedEntity }) },
}));
vi.mock("./managedEntityStore", () => ({
  useManagedEntityStore: { getState: () => ({ focused: focusManaged }) },
}));

describe("sidebarViewStore", () => {
  beforeEach(() => {
    bindManagedEntity.mockClear();
    focusManaged.mockReset();
    focusManaged.mockReturnValue(null);
    localStorage.clear();
    vi.resetModules();
  });

  it.each(["k8s", "db"])("replaces persisted retired scope %s with Hosts", async (scope) => {
    localStorage.setItem("tw.sidebar.view", scope);
    localStorage.setItem(`tw.entityLayout.${scope}`, "retired");
    const { useSidebarViewStore } = await import("./sidebarViewStore");
    expect(useSidebarViewStore.getState().view).toBe("hosts");
    expect(localStorage.getItem("tw.sidebar.view")).toBe("hosts");
    expect(localStorage.getItem(`tw.entityLayout.${scope}`)).toBeNull();
  });

  it("binds the focused SSH host in Linux mode", async () => {
    const host = { kind: "server", id: "host-1", label: "Build host" };
    focusManaged.mockReturnValue(host);
    const { useSidebarViewStore } = await import("./sidebarViewStore");
    useSidebarViewStore.getState().setView("hosts");
    expect(bindManagedEntity).toHaveBeenCalledWith(host);
  });
});
