import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "../..");
const appCss = readFileSync(resolve(root, "src/App.css"), "utf8");
const modules = {
  ai: readFileSync(resolve(root, "src/styles/ai-chat.css"), "utf8"),
  database: readFileSync(resolve(root, "src/styles/database.css"), "utf8"),
  desktop: readFileSync(resolve(root, "src/styles/desktop.css"), "utf8"),
  dialogs: readFileSync(resolve(root, "src/styles/dialogs.css"), "utf8"),
  files: readFileSync(resolve(root, "src/styles/files.css"), "utf8"),
  k8s: readFileSync(resolve(root, "src/styles/k8s.css"), "utf8"),
};

describe("UI style ownership", () => {
  it("keeps AI, database, desktop, files, dialogs, and Kubernetes out of the legacy stylesheet", () => {
    const ownedRules: Array<[keyof typeof modules, string]> = [
      ["ai", ".ai-engineer-panel"],
      ["database", ".db-workbench"],
      ["desktop", ".desktop-app-float"],
      ["files", ".preview-float-backdrop"],
      ["dialogs", ".modal-backdrop"],
      ["k8s", ".k8s-workbench"],
    ];

    for (const [moduleName, selector] of ownedRules) {
      const exactRule = new RegExp(`^${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{`, "m");
      expect(modules[moduleName]).toMatch(exactRule);
      expect(appCss).not.toMatch(exactRule);
    }
  });
});
