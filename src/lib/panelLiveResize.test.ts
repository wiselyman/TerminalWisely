import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function sliceBetween(src: string, startMarker: string, endMarker: string): string {
  const start = src.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = src.indexOf(endMarker, start);
  expect(end).toBeGreaterThan(start);
  return src.slice(start, end);
}

/**
 * Resize drags must update CSS/DOM live and commit React/store width only on
 * mouseup — otherwise chat re-renders every mousemove and stutters.
 */
describe("panel live resize (no per-frame store commit)", () => {
  it("sidebar resize commits expanded width on mouseup only", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/ConnectionPanel.tsx"),
      "utf8",
    );
    const move = sliceBetween(src, "const onMouseMove = (moveEvent: MouseEvent)", "const onMouseUp = () =>");
    const up = sliceBetween(src, "const onMouseUp = () =>", "window.addEventListener(\"mousemove\", onMouseMove)");
    expect(move).toContain('setProperty("--sidebar-width"');
    expect(move).not.toContain("onExpandedWidthChange");
    expect(up).toContain("onExpandedWidthChange(latest)");
  });

  it("AI panel resize commits store width on mouseup only", () => {
    const src = readFileSync(
      resolve(process.cwd(), "src/components/aiEngineer/AiEngineerPanel.tsx"),
      "utf8",
    );
    const blockStart = src.indexOf('aria-label={t("aiEngineer.resizeAria")}');
    expect(blockStart).toBeGreaterThanOrEqual(0);
    const block = src.slice(blockStart, blockStart + 1400);
    const move = sliceBetween(block, "const onMove = (ev: MouseEvent)", "const onUp = () =>");
    const up = sliceBetween(block, "const onUp = () =>", "window.addEventListener(\"mousemove\", onMove)");
    expect(move).toContain('setProperty("--workspace-panel-width"');
    expect(move).toContain("panelRef.current.style.width");
    expect(move).not.toContain("setWidth(");
    expect(up).toContain("setWidth(latest)");
  });
});
