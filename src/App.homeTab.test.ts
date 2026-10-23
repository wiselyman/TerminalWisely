import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(dir, "App.tsx"), "utf8");
const css = readFileSync(join(dir, "App.css"), "utf8");
const toolsZh = JSON.parse(readFileSync(join(dir, "i18n/locales/zh-CN/tools.json"), "utf8")) as Record<string, string>;
const toolsEn = JSON.parse(readFileSync(join(dir, "i18n/locales/en/tools.json"), "utf8")) as Record<string, string>;

describe("App Home tab", () => {
  it("has no Home tab and keeps Home navigation in the space buttons", () => {
    expect(app).not.toContain('data-tab-role="home"');
    expect(app).not.toContain('t("homeTabTitle")');
    expect(app).toContain('data-testid="sidebar-view-home"');
    expect(app).toContain("onClick={() => activateHome()}");
  });
});

describe("Home space navigation", () => {
  it("places Home before Hosts and binds it to the existing Home activation", () => {
    const homeButton = app.indexOf('data-testid="sidebar-view-home"');
    const hostsButton = app.indexOf('data-testid="sidebar-view-hosts"');
    expect(homeButton).toBeGreaterThan(-1);
    expect(homeButton).toBeLessThan(hostsButton);
    expect(app).toContain('aria-selected={homeOpen}');
    expect(app).toContain('onClick={() => activateHome()}');
  });
});

describe("Home sidebar content", () => {
  it("hides the sidebar while retaining its portal host for other spaces", () => {
    expect(app).toContain("<ConnectionPanel");
    expect(app).toContain('homeOpen ? "home-space " : ""');
    expect(css).toMatch(/\.app-shell\.home-space \.sidebar-shell\s*\{\s*display:\s*none;/);
    expect(css).toContain(".app-shell.home-space .app-body");
  });

  it("hides the sidebar collapse control only while Home is active", () => {
    expect(app).toContain("!homeOpen ? <button");
    expect(app).toContain('className="chrome-sidebar-toggle"');
  });
});

describe("Home chat hint", () => {
  it("describes the local chat and Terminal without claiming all actions use MCP", () => {
    expect(toolsZh["aiEngineer.hintLocal"]).toContain("本机聊天");
    expect(toolsZh["aiEngineer.hintLocal"]).toContain("Terminal");
    expect(toolsZh["aiEngineer.hintLocal"]).not.toContain("MCP");
    expect(toolsEn["aiEngineer.hintLocal"]).toContain("Home chat");
    expect(toolsEn["aiEngineer.hintLocal"]).toContain("Terminal");
    expect(toolsEn["aiEngineer.hintLocal"]).not.toContain("MCP");
  });
});

describe("Home local terminal tabs", () => {
  it("routes Home plus to local terminal tabs and keeps other spaces on their existing add flows", () => {
    expect(app).toContain('data-testid="home-terminal-tab"');
    expect(app).toContain("addHomeTerminalTab");
    expect(app).toContain("if (homeOpen)");
    expect(app).toContain("addHomeTerminalTab();");
    expect(app).toContain("homeTerminalTabs[0]?.id !== tab.id");
    expect(app).toContain("homeTerminalTabs[0]?.id === terminalId");
    expect(app).toContain("chromeNew === \"cluster\"");
    expect(app).toContain("chromeNew === \"database\"");
    expect(app).toContain("openNewRemoteRef.current()");
  });
});
