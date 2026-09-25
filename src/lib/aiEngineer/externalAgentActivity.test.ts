import { describe, expect, it } from "vitest";
import { externalAgentActivityFromEvent } from "./externalAgentActivity";

describe("externalAgentActivityFromEvent", () => {
  it("maps cursor local activity", () => {
    expect(
      externalAgentActivityFromEvent({
        name: "cursor.plan",
        detail: "calling TW MCP web_search",
        runtime: "cursor",
      }),
    ).toEqual({
      name: "cursor.plan",
      detail: "calling TW MCP web_search",
      ok: null,
      runtime: "cursor",
    });
  });

  it("maps mcp activity with ok flag", () => {
    expect(
      externalAgentActivityFromEvent({
        name: "mcp.web_search",
        detail: "ok",
        ok: true,
        runtime: "cursor",
      }),
    ).toEqual({
      name: "mcp.web_search",
      detail: "ok",
      ok: true,
      runtime: "cursor",
    });
  });

  it("returns null without name", () => {
    expect(externalAgentActivityFromEvent({ detail: "x" })).toBeNull();
  });

  it("defaults runtime to external", () => {
    expect(
      externalAgentActivityFromEvent({ name: "shell", detail: "ls" })?.runtime,
    ).toBe("external");
  });
});
