import { describe, expect, it } from "vitest";
import {
  filterNamespaceOptions,
  filterRowsByNamespaces,
  formatNamespaceTriggerLabel,
  namespaceListParam,
  primaryNamespace,
  selectAllNamespaces,
  reconcileNamespaceSelection,
  selectionFromStore,
  toggleNamespaceInSelection,
} from "./namespacePicker";

describe("namespacePicker", () => {
  const ns = ["default", "demo", "kube-system"];

  it("filters namespace options by query", () => {
    expect(filterNamespaceOptions(ns, "sys")).toEqual(["kube-system"]);
    expect(filterNamespaceOptions(ns, "  DE  ")).toEqual(["default", "demo"]);
    expect(filterNamespaceOptions(ns, "")).toEqual(ns);
  });

  it("formats trigger label", () => {
    expect(formatNamespaceTriggerLabel({ mode: "all" }, "All namespaces")).toBe(
      "All namespaces",
    );
    expect(
      formatNamespaceTriggerLabel(
        { mode: "selected", namespaces: ["demo"] },
        "All namespaces",
      ),
    ).toBe("demo");
    expect(
      formatNamespaceTriggerLabel(
        { mode: "selected", namespaces: ["demo", "default"] },
        "All namespaces",
      ),
    ).toBe("demo +1");
  });

  it("toggles from All to a single namespace", () => {
    expect(toggleNamespaceInSelection({ mode: "all" }, "demo")).toEqual({
      mode: "selected",
      namespaces: ["demo"],
    });
  });

  it("adds and removes namespaces; last uncheck returns All", () => {
    const one = toggleNamespaceInSelection({ mode: "all" }, "demo");
    const two = toggleNamespaceInSelection(one, "default");
    expect(two).toEqual({
      mode: "selected",
      namespaces: ["demo", "default"],
    });
    expect(toggleNamespaceInSelection(two, "demo")).toEqual({
      mode: "selected",
      namespaces: ["default"],
    });
    expect(
      toggleNamespaceInSelection(
        { mode: "selected", namespaces: ["demo"] },
        "demo",
      ),
    ).toEqual({ mode: "all" });
  });

  it("selectAllNamespaces clears to all mode", () => {
    expect(selectAllNamespaces()).toEqual({ mode: "all" });
  });

  it("maps store state to selection", () => {
    expect(selectionFromStore(true, ["demo"], "default")).toEqual({
      mode: "all",
    });
    expect(selectionFromStore(false, ["demo", "default"], "default")).toEqual({
      mode: "selected",
      namespaces: ["demo", "default"],
    });
    expect(selectionFromStore(false, [], "prod")).toEqual({
      mode: "selected",
      namespaces: ["prod"],
    });
  });

  it("chooses list API namespace param", () => {
    expect(namespaceListParam({ mode: "all" })).toBeNull();
    expect(
      namespaceListParam({ mode: "selected", namespaces: ["demo"] }),
    ).toBe("demo");
    expect(
      namespaceListParam({
        mode: "selected",
        namespaces: ["demo", "default"],
      }),
    ).toBeNull();
  });

  it("filters rows only for multi-select", () => {
    const rows = [
      { name: "a", namespace: "demo" },
      { name: "b", namespace: "default" },
      { name: "c", namespace: "kube-system" },
    ];
    expect(
      filterRowsByNamespaces(rows, {
        mode: "selected",
        namespaces: ["demo", "default"],
      }),
    ).toEqual([
      { name: "a", namespace: "demo" },
      { name: "b", namespace: "default" },
    ]);
    expect(
      filterRowsByNamespaces(rows, {
        mode: "selected",
        namespaces: ["demo"],
      }),
    ).toEqual(rows);
  });

  it("primaryNamespace prefers first selected", () => {
    expect(primaryNamespace({ mode: "all" })).toBe("default");
    expect(
      primaryNamespace({ mode: "selected", namespaces: ["demo", "x"] }),
    ).toBe("demo");
  });

  it("reconcileNamespaceSelection drops namespaces from another cluster", () => {
    const available = ["default", "kube-system"];
    expect(
      reconcileNamespaceSelection(available, {
        allNamespaces: false,
        selectedNamespaces: ["common", "demo", "default"],
        namespace: "common",
      }),
    ).toEqual({
      allNamespaces: false,
      selectedNamespaces: ["default"],
      namespace: "default",
    });
    expect(
      reconcileNamespaceSelection(available, {
        allNamespaces: false,
        selectedNamespaces: ["common", "demo"],
        namespace: "common",
      }),
    ).toEqual({
      allNamespaces: true,
      selectedNamespaces: [],
      namespace: "default",
    });
  });
});
