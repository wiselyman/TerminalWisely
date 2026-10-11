import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const css = readFileSync(resolve(root, "src/App.css"), "utf8");
const addCluster = readFileSync(
  resolve(root, "src/components/k8s/AddK8sClusterModal.tsx"),
  "utf8",
);
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

  it("uses the shared connection form for add cluster, not a full-width site button", () => {
    expect(addCluster).toContain('className="connection-form"');
    expect(addCluster).not.toContain("find-panel-run");
    expect(css).not.toContain(".modal:has(.k8s-add-cluster)");
    expect(rule(".k8s-add-tabs button.active")).not.toContain("rgba(56, 139, 253");
    expect(rule(".k8s-add-yaml")).not.toContain("60vh");
  });

  it("turns off sentence capitalization for the whole window", () => {
    expect(html).toContain('autocapitalize="none"');
  });
});
