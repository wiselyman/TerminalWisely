import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(dir, "App.tsx"), "utf8");
const css = readFileSync(join(dir, "App.css"), "utf8");
const shellCss = readFileSync(join(dir, "styles/shell.css"), "utf8");
const toolsZh = JSON.parse(readFileSync(join(dir, "i18n/locales/zh-CN/tools.json"), "utf8")) as Record<string, string>;
const toolsEn = JSON.parse(readFileSync(join(dir, "i18n/locales/en/tools.json"), "utf8")) as Record<string, string>;

describe("App Home tab", () => {
  it("renders a fixed Home tab, removes the Home scope button, and keeps Hosts management", () => {
    expect(app).toContain('data-testid="home-directory-tab"');
    expect(app).toContain('t("homeDirectoryTab")');
    expect(app).not.toContain('data-testid="sidebar-view-home"');
    expect(app).toContain('data-testid="sidebar-view-hosts"');
    expect(app).not.toContain('data-testid="sidebar-view-k8s"');
    expect(app).not.toContain('data-testid="sidebar-view-db"');
  });
});

describe("Home directory chrome", () => {
  it("omits its heading and local Terminal/chat buttons", () => {
    const directory = readFileSync(join(dir, "components/home/HomeHostDirectory.tsx"), "utf8");
    expect(directory).not.toContain('t("homeDirectoryTitle")');
    expect(directory).not.toContain('t("homeDirectorySubtitle")');
    expect(directory).not.toContain('data-testid="home-directory-terminal"');
    expect(directory).not.toContain('data-testid="home-directory-chat"');
  });
});

describe("Home sidebar content", () => {
  it("hides the sidebar while retaining its portal host for other spaces", () => {
    expect(app).toContain("<ConnectionPanel");
    expect(app).toContain('homeOpen ? "home-space " : ""');
    expect(shellCss).toMatch(/\.app-shell\.home-space \.sidebar-shell\s*\{\s*display:\s*none;/);
    expect(shellCss).toContain(".app-shell.home-space .app-body");
    expect(app).toContain('import "./styles/shell.css";');
  });

  it("hides the sidebar collapse control only while Home is active", () => {
    expect(app).toContain("{!homeOpen ? <button");
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
  it("routes Home plus to local terminals and Hosts plus to SSH", () => {
    expect(app).toContain('data-testid="home-terminal-tab"');
    expect(app).toContain("addHomeTerminalTab");
    expect(app).toContain("if (homeOpen)");
    expect(app).toContain("addHomeTerminalTab();");
    expect(app).toContain("homeTerminalTabs[0]?.id !== tab.id");
    expect(app).toContain("homeTerminalTabs[0]?.id === terminalId");
    expect(app).toContain("openNewRemoteRef.current()");
  });
});
