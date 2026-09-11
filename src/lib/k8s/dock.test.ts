import { describe, expect, it } from "vitest";
import { openK8sTerminalDock } from "./dock";

describe("openK8sTerminalDock", () => {
  const t = (key: string, opts?: Record<string, unknown>) =>
    key === "dockTerminalTab" ? `Terminal ${opts?.n}` : key;

  it("creates first tab when empty", () => {
    const next = openK8sTerminalDock([], t);
    expect(next.tabs).toHaveLength(1);
    expect(next.tabs[0]?.title).toBe("Terminal 1");
    expect(next.open).toBe(true);
  });

  it("appends a new tab when tabs already exist", () => {
    const tabs = [
      { id: "a", title: "Terminal 1" },
      { id: "b", title: "Terminal 2" },
    ];
    const next = openK8sTerminalDock(tabs, t);
    expect(next.tabs).toHaveLength(3);
    expect(next.tabs[2]?.title).toBe("Terminal 3");
    expect(next.activeTabId).toBe(next.tabs[2]?.id);
  });
});
