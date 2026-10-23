import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "DbIcons.tsx"), "utf8");
const css = readFileSync(join(dir, "../../styles/database.css"), "utf8");

describe("DbIcons", () => {
  it("object tree marks use Lucide, not hand-drawn cylinder/sheet glyphs", () => {
    expect(src).toContain('from "lucide-react"');
    expect(src).toContain("Database");
    expect(src).toContain("Table2");
    expect(src).toContain("Layers");
    expect(src).not.toMatch(/function Cylinder\b/);
    expect(src).not.toMatch(/function TableSheet\b/);
    expect(src).not.toMatch(/<ellipse cx="8"/);
  });

  it("muted marks for disconnected connections and unopened databases (Navicat)", () => {
    expect(src).toMatch(/connected\s*[?=]/);
    expect(src).toContain("db-engine-icon--muted");
    expect(src).toContain("db-kind-icon--muted");
    expect(css).toMatch(/\.db-engine-icon--muted\s*\{[^}]*grayscale/);
    expect(css).toMatch(/\.db-kind-icon--muted\s*\{/);
    // Live DB/schema color is driven by ObjectMark active= (cataloged / opened), not expand chevron.
    expect(src).toMatch(/active\s*[?=]/);
  });

  it("exposes QueryMark for SQL inner tabs (same Lucide vocabulary as object tree)", () => {
    expect(src).toContain("export function QueryMark");
    expect(src).toMatch(/db-kind-icon--query/);
    expect(src).toMatch(/FileCode|SquareCode|Code2/);
  });
});
