import { create } from "zustand";
import {
  addEntityGroup,
  buildEntityListSections,
  deleteEntityGroup,
  flattenEntityOrder,
  loadEntityListLayout,
  moveEntityRelativeToTarget,
  moveEntityToSection,
  reorderEntityGroups,
  renameEntityGroup,
  saveEntityListLayout,
  syncLayoutWithEntities,
  toggleEntityGroupCollapsed,
  layoutsEqual,
  layoutLooksStripped,
  type EntityLayoutScope,
  type EntityListLayout,
} from "../lib/entityListLayout";
import type { EntityDropTarget } from "../lib/entityPointerReorder";

interface EntityLayoutState {
  layouts: Record<EntityLayoutScope, EntityListLayout | null>;
  ensureScope: (scope: EntityLayoutScope, entityIds: string[]) => EntityListLayout;
  applyLayout: (
    scope: EntityLayoutScope,
    entityIds: string[],
    updater: (layout: EntityListLayout) => EntityListLayout,
    onOrderChange?: (orderedIds: string[]) => void,
    defaultGroupName?: string,
  ) => void;
  addGroup: (scope: EntityLayoutScope, entityIds: string[], name: string) => void;
  handleItemDrop: (
    scope: EntityLayoutScope,
    entityIds: string[],
    dragId: string,
    target: EntityDropTarget,
    onOrderChange?: (orderedIds: string[]) => void,
    defaultGroupName?: string,
  ) => void;
  handleGroupDrop: (
    scope: EntityLayoutScope,
    entityIds: string[],
    dragGroupId: string,
    target: EntityDropTarget,
  ) => void;
  renameGroup: (
    scope: EntityLayoutScope,
    entityIds: string[],
    groupId: string,
    name: string,
  ) => void;
  deleteGroup: (
    scope: EntityLayoutScope,
    entityIds: string[],
    groupId: string,
    onOrderChange?: (orderedIds: string[]) => void,
    defaultGroupName?: string,
  ) => void;
  toggleGroupCollapsed: (
    scope: EntityLayoutScope,
    entityIds: string[],
    groupId: string,
  ) => void;
}

export const useEntityLayoutStore = create<EntityLayoutState>((set, get) => ({
  layouts: { hosts: null, k8s: null },

  ensureScope(scope, entityIds) {
    if (entityIds.length === 0) {
      const current = get().layouts[scope];
      if (current) return current;
      const loaded = loadEntityListLayout(scope, entityIds);
      set({ layouts: { ...get().layouts, [scope]: loaded } });
      return loaded;
    }

    let current = get().layouts[scope];
    if (!current) {
      const loaded = loadEntityListLayout(scope, entityIds);
      set({ layouts: { ...get().layouts, [scope]: loaded } });
      return loaded;
    }

    if (layoutLooksStripped(current, entityIds)) {
      const reloaded = loadEntityListLayout(scope, entityIds);
      if (!layoutLooksStripped(reloaded, entityIds)) {
        current = reloaded;
        set({ layouts: { ...get().layouts, [scope]: reloaded } });
      }
    }

    const synced = syncLayoutWithEntities(current, entityIds);
    if (!layoutsEqual(synced, current)) {
      saveEntityListLayout(scope, synced);
      set({ layouts: { ...get().layouts, [scope]: synced } });
    }
    return synced;
  },

  applyLayout(scope, entityIds, updater, onOrderChange, defaultGroupName) {
    const base = get().ensureScope(scope, entityIds);
    const updated = updater(base);
    if (entityIds.length === 0) {
      saveEntityListLayout(scope, updated);
      set({ layouts: { ...get().layouts, [scope]: updated } });
      return;
    }
    const next = syncLayoutWithEntities(updated, entityIds);
    saveEntityListLayout(scope, next);
    set({ layouts: { ...get().layouts, [scope]: next } });
    if (onOrderChange) {
      onOrderChange(
        flattenEntityOrder(
          buildEntityListSections(next, entityIds, defaultGroupName ?? "Ungrouped"),
        ),
      );
    }
  },

  addGroup(scope, entityIds, name) {
    get().applyLayout(scope, entityIds, (layout) => addEntityGroup(layout, name));
  },

  handleItemDrop(scope, entityIds, dragId, target, onOrderChange, defaultGroupName) {
    if (!target) return;
    get().applyLayout(
      scope,
      entityIds,
      (layout) => {
        if (target.kind === "group") {
          return moveEntityToSection(layout, dragId, target.id);
        }
        return moveEntityRelativeToTarget(
          layout,
          dragId,
          target.id,
          target.position,
        );
      },
      onOrderChange,
      defaultGroupName,
    );
  },

  handleGroupDrop(scope, entityIds, dragGroupId, target) {
    if (!target || target.kind !== "group" || !target.position) return;
    const position = target.position;
    get().applyLayout(scope, entityIds, (layout) =>
      reorderEntityGroups(layout, dragGroupId, target.id, position),
    );
  },

  renameGroup(scope, entityIds, groupId, name) {
    get().applyLayout(scope, entityIds, (layout) =>
      renameEntityGroup(layout, groupId, name),
    );
  },

  deleteGroup(scope, entityIds, groupId, onOrderChange, defaultGroupName) {
    get().applyLayout(
      scope,
      entityIds,
      (layout) => deleteEntityGroup(layout, groupId),
      onOrderChange,
      defaultGroupName,
    );
  },

  toggleGroupCollapsed(scope, entityIds, groupId) {
    get().applyLayout(scope, entityIds, (layout) =>
      toggleEntityGroupCollapsed(layout, groupId),
    );
  },
}));

export function selectEntitySections(
  layout: EntityListLayout | null,
  entityIds: string[],
  defaultGroupName: string,
) {
  if (!layout) return [];
  return buildEntityListSections(layout, entityIds, defaultGroupName);
}
