import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const css = readFileSync(resolve(root, "src/App.css"), "utf8");
const k8s = readFileSync(resolve(root, "src/components/k8s/K8sWorkbench.tsx"), "utf8");
const db = readFileSync(resolve(root, "src/components/db/DbWorkbench.tsx"), "utf8");
const hosts = readFileSync(resolve(root, "src/components/ConnectionPanel.tsx"), "utf8");

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, selector).toBeTruthy();
  return match?.[1] ?? "";
}

describe("shared chrome", () => {
  it("selects a row with one accent border", () => {
    const selected = rule(".saved-item.selected");
    expect(selected).toContain("outline: none");
    expect(selected).toContain("border-color: var(--tw-accent-emphasis)");
    expect(selected).not.toContain("outline: 1px");
    expect(rule(".k8s-tree-item.active")).toContain("color: var(--tw-fg)");
    expect(rule(".k8s-tree-item.active")).not.toContain("#fff");
    expect(rule(".k8s-tree-home.active")).not.toContain("#fff");
  });

  it("uses one row padding, list inset, and 16px cluster mark", () => {
    expect(rule(".db-connection-row > .saved-item-main")).toContain("padding: 6px 10px");
    expect(rule(".db-workbench-nav")).toContain("padding: 8px 10px 10px");
    expect(hosts).toContain('icon={<K8sClusterIcon size={16} />}');
  });

  it("uses one group label and 14px tree chevron", () => {
    const label = rule(".k8s-tree-group-label");
    expect(label).toContain("font-size: 0.72rem");
    expect(label).toContain("letter-spacing: 0.04em");
    for (const source of [k8s, db]) {
      expect(source).not.toMatch(/size=\{12\}[^>]*className="k8s-tree-chevron"/);
      expect(source).not.toMatch(/className="k8s-tree-chevron"[^>]*size=\{12\}/);
    }
  });

  it("uses one 28px icon button and one search type size", () => {
    const tool = rule(".k8s-tool-icon-btn");
    expect(tool).toContain("width: 28px");
    expect(tool).toContain("height: 28px");
    expect(tool).toContain("border-radius: 6px");
    expect(tool).toContain("background: var(--tw-surface-2)");
    expect(rule(".k8s-table-search")).toContain("font-size: var(--tw-font-dense)");
  });

  it("aligns secondary tabs and empty states", () => {
    const tab = rule(".k8s-detail-tabs button");
    expect(tab).toContain("height: 28px");
    expect(tab).toContain("font-size: var(--tw-font-dense)");
    expect(tab).toContain("border: 1px solid var(--tw-border)");
    expect(k8s).toContain('t("selectClusterHint")');
    expect(k8s).toContain('className="empty-state"');
    expect(db).toContain('className="empty-state" data-testid="db-empty"');
    expect(css).not.toContain('[data-testid="db-empty"]');
  });

  it("keeps Home as a bordered terminal and chat split", () => {
    const split = rule(".home-local-chat");
    expect(split).toContain("display: grid");
    expect(split).toContain("grid-template-columns: minmax(0, 1fr) 8px minmax(0, 1fr)");
    expect(rule(".home-local-splitter")).toContain("cursor: col-resize");
    expect(rule(".home-local-terminal-pane")).not.toContain("border-right: 1px solid var(--tw-border)");
    expect(rule(".home-local-terminal")).toContain("inset: 0");
    expect(rule(".home-work-chat .ai-engineer-panel.is-home-workspace")).toContain(
      "position: relative !important",
    );
  });
});
