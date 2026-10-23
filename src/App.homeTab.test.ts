import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(dir, "App.tsx"), "utf8");
const css = readFileSync(join(dir, "App.css"), "utf8");

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
});
