import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const css = ["dialogs.css"]
  .map((file) => readFileSync(resolve(root, "src/styles", file), "utf8"))
  .join("\n");
const html = readFileSync(resolve(root, "index.html"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, selector).toBeTruthy();
  return match?.[1] ?? "";
}

describe("dialog chrome", () => {
  it("keeps dialog actions compact and on the trailing edge", () => {
    expect(rule(".modal-body .form-row")).toContain("justify-content: flex-end");
    expect(rule(".modal-body .form-row button")).toContain("flex: 0 0 auto");
    expect(rule(".modal-body .form-row button")).not.toContain("flex: 1");
  });

  it("turns off sentence capitalization for the whole window", () => {
    expect(html).toContain('autocapitalize="none"');
  });
});
