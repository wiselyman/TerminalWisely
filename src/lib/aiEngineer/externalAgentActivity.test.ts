import { describe, expect, it } from "vitest";
import {
  externalAgentActivityFromEvent,
  isLocalDesktopImpersonationActivity,
  isMirroredTwMcpActivity,
} from "./externalAgentActivity";

describe("isMirroredTwMcpActivity", () => {
  it("flags TW MCP tools that already have ToolExecCard", () => {
    expect(isMirroredTwMcpActivity("cursor.terminal_exec")).toBe(true);
    expect(isMirroredTwMcpActivity("codex.terminal_exec")).toBe(true);
    expect(isMirroredTwMcpActivity("terminal_exec")).toBe(true);
    expect(isMirroredTwMcpActivity("cursor.web_search")).toBe(true);
    expect(isMirroredTwMcpActivity("mcp.web_fetch")).toBe(true);
    expect(isMirroredTwMcpActivity("cursor.k8s_get")).toBe(true);
  });

  it("keeps local agent activity that is not a TW tool card", () => {
    expect(isMirroredTwMcpActivity("cursor.cli")).toBe(false);
    expect(isMirroredTwMcpActivity("cursor.shell")).toBe(false);
    expect(isMirroredTwMcpActivity("codex.command_execution")).toBe(false);
    expect(isMirroredTwMcpActivity("cursor.plan")).toBe(false);
  });
});

describe("isLocalDesktopImpersonationActivity", () => {
  it("flags CUA / computer-use capability classes", () => {
    expect(isLocalDesktopImpersonationActivity("codex.cua")).toBe(true);
    expect(
      isLocalDesktopImpersonationActivity(
        "codex.js",
        '{"code":"await cua.getState()"}',
      ),
    ).toBe(true);
    expect(
      isLocalDesktopImpersonationActivity("codex.command_execution", "uptime"),
    ).toBe(false);
  });
});

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

  it("suppresses MCP tools mirrored by TW tool cards", () => {
    expect(
      externalAgentActivityFromEvent({
        name: "cursor.terminal_exec",
        detail: "ps aux | head",
        runtime: "cursor",
      }),
    ).toBeNull();
    expect(
      externalAgentActivityFromEvent({
        name: "mcp.web_search",
        detail: "ok",
        ok: true,
        runtime: "cursor",
      }),
    ).toBeNull();
  });

  it("suppresses local desktop / CUA impersonation", () => {
    expect(
      externalAgentActivityFromEvent({
        name: "codex.js",
        detail: '{"code":"await cua.getState()"}',
        runtime: "codex",
      }),
    ).toBeNull();
  });

  it("returns null without name", () => {
    expect(externalAgentActivityFromEvent({ detail: "x" })).toBeNull();
  });

  it("drops empty cursor.tool placeholder cards", () => {
    expect(
      externalAgentActivityFromEvent({
        name: "cursor.tool",
        detail: "{}",
        runtime: "cursor",
      }),
    ).toBeNull();
  });

  it("defaults runtime to external", () => {
    expect(
      externalAgentActivityFromEvent({ name: "shell", detail: "ls" })?.runtime,
    ).toBe("external");
  });
});
