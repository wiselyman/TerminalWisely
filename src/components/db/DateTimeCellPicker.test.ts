import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, "DateTimeCellPicker.tsx"), "utf8");
const workbench = readFileSync(join(dir, "DbWorkbench.tsx"), "utf8");

describe("DateTimeCellPicker", () => {
  it("ships digital time fields and OK/Cancel without an analog clock", () => {
    expect(src).toContain("db-cell-picker-calendar");
    expect(src).toContain("db-cell-picker-${field}");
    expect(src).toContain('data-testid="db-cell-picker-time"');
    expect(src).toContain("db-cell-picker-ok");
    expect(src).toContain("db-cell-picker-cancel");
    expect(src).not.toContain("db-cell-picker-clock-face");
    expect(src).not.toContain("db-cell-picker-ampm");
    expect(src).not.toContain("db-cell-picker-hand");
  });

  it("portals above the grid so overflow:hidden cells cannot clip it", () => {
    expect(src).toContain("createPortal");
    expect(src).toContain("document.body");
    expect(src).toContain("anchorRect");
    expect(src).toContain("coords.top");
    expect(src).toContain("db-cell-picker-backdrop");
  });

  it("is wired for time/date/datetime cells without the NULL shortcut", () => {
    expect(workbench).toContain("DateTimeCellPicker");
    expect(workbench).toContain("resolveCellEditorKind");
    expect(workbench).not.toMatch(/data-testid=\{[^}]*db-cell-null/);
    // Orphan "+" tab strip only when real tabs exist
    expect(workbench).toMatch(/tabs\.length\s*>\s*0/);
  });
});
