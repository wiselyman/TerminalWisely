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

  it("lists connections as host-style cards without a redundant engine label", () => {
    expect(workbench).toContain("db-connection-row saved-item saved-item-compact");
    expect(workbench).toContain('className="saved-item-main"');
    expect(workbench).not.toContain("db-engine-label");
  });

  it("styles the object pane with its own table and New Query control", () => {
    expect(workbench).toContain('className="db-object-table"');
    expect(workbench).toContain("db-object-new-query");
    expect(workbench).toContain("objectPaneVisibleColumns");
    expect(workbench).not.toMatch(/db-object-list[\s\S]{0,200}className="k8s-table"/);
  });

  it("binds AI to the selected connection even without an open query tab", () => {
    // Chat scope is per connection; schema/database are context fields only.
    const idx = workbench.indexOf("bindDbContext({");
    expect(idx).toBeGreaterThan(0);
    const slice = workbench.slice(Math.max(0, idx - 220), idx + 420);
    expect(slice).toContain("if (!selected) return");
    expect(slice).not.toMatch(/!selected\s*\|\|\s*!active/);
    expect(slice).toContain("browse?.database");
  });
});
