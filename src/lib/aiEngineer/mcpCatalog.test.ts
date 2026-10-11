import { describe, expect, it } from "vitest";
import {
  buildMcpInstallPrompt,
  listMcpCatalogForPlatform,
  MCP_CATALOG,
} from "./mcpCatalog";

describe("mcpCatalog", () => {
  it("lists every platform group without hiding other OSes", () => {
    expect(MCP_CATALOG.length).toBeGreaterThanOrEqual(10);
    const platforms = new Set(MCP_CATALOG.flatMap((e) => e.platforms));
    expect(platforms.has("darwin")).toBe(true);
    expect(platforms.has("win32")).toBe(true);
    expect(platforms.has("linux")).toBe(true);
  });

  it("marks installable entries for the current platform first", () => {
    const listed = listMcpCatalogForPlatform("darwin");
    expect(listed.some((e) => e.installable && e.platforms.includes("darwin"))).toBe(
      true,
    );
    expect(listed.some((e) => !e.installable && e.platforms.includes("win32"))).toBe(
      true,
    );
    const firstWinOnly = listed.find(
      (e) => !e.platforms.includes("darwin") && e.platforms.includes("win32"),
    );
    const lastDarwin = [...listed]
      .reverse()
      .find((e) => e.platforms.includes("darwin"));
    expect(firstWinOnly && lastDarwin).toBeTruthy();
    expect(listed.indexOf(lastDarwin!)).toBeLessThan(listed.indexOf(firstWinOnly!));
  });

  it("builds an install prompt that asks the agent to install and register", () => {
    const entry = MCP_CATALOG.find((e) => e.id === "playwright")!;
    const text = buildMcpInstallPrompt(entry, { locale: "en" });
    expect(text).toMatch(/install/i);
    expect(text).toContain("user_mcp.json");
    expect(text).toContain(entry.register.command);
    expect(text).toMatch(/Do not claim Settings already installed/i);
    expect(text).toMatch(/approve|approval|terminal_exec/i);
  });

  it("includes secret env placeholders when provided", () => {
    const entry = MCP_CATALOG.find((e) => e.id === "feishu")!;
    const text = buildMcpInstallPrompt(entry, {
      locale: "zh",
      env: { APP_ID: "cli_test", APP_SECRET: "sec_test" },
    });
    expect(text).toContain("cli_test");
    expect(text).toContain("sec_test");
    expect(text).toMatch(/飞书|Feishu|lark/i);
  });
});
