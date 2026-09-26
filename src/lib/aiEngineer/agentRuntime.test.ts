import { describe, expect, it } from "vitest";
import { normalizeAgentRuntime, toolAgentSource } from "./agentRuntime";

describe("normalizeAgentRuntime", () => {
  it("keeps known external agents", () => {
    expect(normalizeAgentRuntime("cursor")).toBe("cursor");
    expect(normalizeAgentRuntime("codex")).toBe("codex");
    expect(normalizeAgentRuntime("claude")).toBe("claude");
  });

  it("falls back to builtin for anything else", () => {
    expect(normalizeAgentRuntime("builtin")).toBe("builtin");
    expect(normalizeAgentRuntime("")).toBe("builtin");
    expect(normalizeAgentRuntime(undefined)).toBe("builtin");
    expect(normalizeAgentRuntime("gpt")).toBe("builtin");
  });
});

describe("toolAgentSource", () => {
  it("returns external agent for tool card badges", () => {
    expect(toolAgentSource("cursor")).toBe("cursor");
    expect(toolAgentSource("codex")).toBe("codex");
    expect(toolAgentSource("claude")).toBe("claude");
    expect(toolAgentSource("builtin")).toBeUndefined();
  });
});
