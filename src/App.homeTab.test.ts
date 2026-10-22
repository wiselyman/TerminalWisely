import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const app = readFileSync(join(dir, "App.tsx"), "utf8");

describe("App Home tab", () => {
  it("keeps the database sidebar when Home is activated from the DB view", () => {
    expect(app).toContain('data-tab-role="home"');
    expect(app).toContain("activateHome()");
    // Switching to hosts here emptied the DB tree while the Home page stayed open.
    expect(app).not.toMatch(
      /data-tab-role="home"[\s\S]{0,400}setSidebarView\("hosts"\)/,
    );
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
  it("passes Home visibility into ConnectionPanel so Hosts content can be hidden", () => {
    expect(app).toMatch(/<ConnectionPanel[\s\S]{0,500}homeOpen=\{homeOpen\}/);
  });
});
