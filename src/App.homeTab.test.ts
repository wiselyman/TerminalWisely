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
  it("renders a fixed Home tab without Hosts sidebar navigation", () => {
    expect(app).toContain('data-testid="home-directory-tab"');
    expect(app).toContain('t("homeDirectoryTab")');
    expect(app).not.toContain('data-testid="sidebar-view-home"');
    expect(app).not.toContain('data-testid="sidebar-view-hosts"');
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
  it("keeps ConnectionPanel only for its collapsed host dialogs", () => {
    expect(app).toContain("<ConnectionPanel");
    expect(app).toContain("collapsed={true}");
    expect(shellCss).toMatch(/\.app-shell\.home-space \.sidebar-shell\s*\{\s*display:\s*none;/);
    expect(shellCss).toContain(".app-shell.sidebar-collapsed .app-body");
    expect(app).toContain('import "./styles/shell.css";');
  });

  it("removes the sidebar scope and collapse controls from the titlebar", () => {
    expect(app).not.toContain('data-testid="sidebar-view-hosts"');
    expect(app).not.toContain('className="chrome-sidebar-toggle"');
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
  it("keeps local Terminal as a single Desktop backing surface, not a tab", () => {
    expect(app).not.toContain('data-testid="home-terminal-tab"');
    expect(app).not.toContain("addHomeTerminalTab");
    expect(app).not.toContain("closeHomeTerminalTab");
    expect(app).toContain('collapsed={true}');
    expect(app).toContain("openNewRemoteRef.current()");
  });
});
