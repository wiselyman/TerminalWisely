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
