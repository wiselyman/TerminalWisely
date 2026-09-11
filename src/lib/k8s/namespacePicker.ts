/** Lens-style namespace filter selection. */
export type NamespaceSelection =
  | { mode: "all" }
  | { mode: "selected"; namespaces: string[] };

export function filterNamespaceOptions(
  namespaces: string[],
  query: string,
): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return namespaces;
  return namespaces.filter((ns) => ns.toLowerCase().includes(q));
}

/** Trigger label: All / one name / "ns +N". */
export function formatNamespaceTriggerLabel(
  selection: NamespaceSelection,
  allLabel: string,
): string {
  if (selection.mode === "all") return allLabel;
  const names = selection.namespaces;
  if (names.length === 0) return allLabel;
  if (names.length === 1) return names[0];
  return `${names[0]} +${names.length - 1}`;
}

export function selectionFromStore(
  allNamespaces: boolean,
  selectedNamespaces: string[],
  fallbackNamespace: string,
): NamespaceSelection {
  if (allNamespaces) return { mode: "all" };
  const namespaces =
    selectedNamespaces.length > 0
      ? selectedNamespaces
      : [fallbackNamespace || "default"];
  return { mode: "selected", namespaces };
}

/** Click "All namespaces". */
export function selectAllNamespaces(): NamespaceSelection {
  return { mode: "all" };
}

/**
 * Toggle one namespace checkbox.
 * - From All → that namespace alone
 * - Uncheck last selected → All
 * - Otherwise add/remove from the set
 */
export function toggleNamespaceInSelection(
  selection: NamespaceSelection,
  ns: string,
): NamespaceSelection {
  if (selection.mode === "all") {
    return { mode: "selected", namespaces: [ns] };
  }
  const set = new Set(selection.namespaces);
  if (set.has(ns)) {
    set.delete(ns);
    if (set.size === 0) return { mode: "all" };
    return { mode: "selected", namespaces: [...set] };
  }
  set.add(ns);
  return { mode: "selected", namespaces: [...set] };
}

/** Namespace arg for list APIs: null = cluster-wide list. */
export function namespaceListParam(
  selection: NamespaceSelection,
): string | null {
  if (selection.mode === "all") return null;
  if (selection.namespaces.length === 1) return selection.namespaces[0];
  // Multi-select: fetch all, filter client-side.
  return null;
}

/** Client filter when multiple namespaces are selected. */
export function filterRowsByNamespaces<T extends { namespace: string }>(
  rows: T[],
  selection: NamespaceSelection,
): T[] {
  if (selection.mode === "all") return rows;
  if (selection.namespaces.length <= 1) return rows;
  const allowed = new Set(selection.namespaces);
  return rows.filter((r) => !r.namespace || allowed.has(r.namespace));
}

export function primaryNamespace(selection: NamespaceSelection): string {
  if (selection.mode === "selected" && selection.namespaces[0]) {
    return selection.namespaces[0];
  }
  return "default";
}

export type NamespaceStoreSlice = {
  allNamespaces: boolean;
  selectedNamespaces: string[];
  namespace: string;
};

/** Drop namespace picks that do not exist on the current cluster. */
export function reconcileNamespaceSelection(
  availableNamespaces: string[],
  state: NamespaceStoreSlice,
): NamespaceStoreSlice {
  const fallback = availableNamespaces.includes("default")
    ? "default"
    : (availableNamespaces[0] ?? state.namespace ?? "default");

  if (availableNamespaces.length === 0) {
    return state;
  }

  if (state.allNamespaces) {
    return {
      allNamespaces: true,
      selectedNamespaces: [],
      namespace: availableNamespaces.includes(state.namespace)
        ? state.namespace
        : fallback,
    };
  }

  const valid = state.selectedNamespaces.filter((ns) =>
    availableNamespaces.includes(ns),
  );
  if (valid.length === 0) {
    return {
      allNamespaces: true,
      selectedNamespaces: [],
      namespace: fallback,
    };
  }
  return {
    allNamespaces: false,
    selectedNamespaces: valid,
    namespace: valid.includes(state.namespace) ? state.namespace : valid[0],
  };
}
