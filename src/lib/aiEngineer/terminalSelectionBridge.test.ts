import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../stores/aiEngineerStore", () => ({
  useAiEngineerStore: {
    getState: () => ({ sessionId: "sess-a" }),
  },
}));

vi.mock("../../stores/sessionStore", () => ({
  useSessionStore: {
    getState: () => ({ activeTabId: "sess-a" }),
  },
}));

import {
  readActiveTerminalSelection,
  registerTerminalSelectionProvider,
} from "./terminalSelectionBridge";

describe("terminalSelectionBridge", () => {
  beforeEach(() => {
    registerTerminalSelectionProvider("sess-a", null);
    registerTerminalSelectionProvider("sess-b", null);
  });

  it("reads selection from the active session, not the last registrant", () => {
    registerTerminalSelectionProvider("sess-b", () => "from-b");
    registerTerminalSelectionProvider("sess-a", () => "from-a");
    // Remount order used to leave only the last global provider.
    registerTerminalSelectionProvider("sess-b", () => "");
    expect(readActiveTerminalSelection()).toBe("from-a");
  });

  it("falls back to any non-empty selection", () => {
    registerTerminalSelectionProvider("sess-a", () => "");
    registerTerminalSelectionProvider("sess-b", () => "cached-b");
    expect(readActiveTerminalSelection()).toBe("cached-b");
  });
});
