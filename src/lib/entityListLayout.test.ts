import { describe, expect, it } from "vitest";
import {
  UNGROUPED_SECTION,
  addEntityGroup,
  buildEntityListSections,
  createDefaultLayout,
  deleteEntityGroup,
  isDefaultGroupId,
  moveEntityToSection,
  reorderEntityGroups,
  reorderEntityItem,
  syncLayoutWithEntities,
  toggleEntityGroupCollapsed,
  layoutsEqual,
  migrateStoredLayout,
} from "./entityListLayout";

describe("entityListLayout", () => {
  const ids = ["a", "b", "c"];
  const defaultName = "Ungrouped";

  it("always includes default ungrouped bucket as a group section", () => {
    const layout = createDefaultLayout(ids);
    const sections = buildEntityListSections(layout, ids, defaultName);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.defaultGroup).toBe(true);
    expect(sections[0]?.group.name).toBe(defaultName);
    expect(sections[0]?.group.collapsed).toBe(true);
    expect(sections[0]?.itemIds).toEqual(["a", "b", "c"]);
  });

  it("defaults custom groups to collapsed", () => {
    const layout = addEntityGroup(createDefaultLayout(ids), "Lab");
    const groupId = layout.groups[0]!.id;
    const sections = buildEntityListSections(layout, ids, defaultName);
    const lab = sections.find((section) => section.group.id === groupId);
    expect(lab?.group.collapsed).toBe(true);
  });

  it("toggles custom group collapsed state", () => {
    let layout = addEntityGroup(createDefaultLayout(ids), "Lab");
    const groupId = layout.groups[0]!.id;
    layout = toggleEntityGroupCollapsed(layout, groupId);
    const sections = buildEntityListSections(layout, ids, defaultName);
    const lab = sections.find((section) => section.group.id === groupId);
    expect(lab?.group.collapsed).toBe(false);
  });

  it("reorders within section", () => {
    let layout = createDefaultLayout(ids);
    layout = reorderEntityItem(layout, "c", "a", "before");
    expect(layout.order[UNGROUPED_SECTION]).toEqual(["c", "a", "b"]);
  });

  it("moves item into custom group", () => {
    let layout = addEntityGroup(createDefaultLayout(ids), "Prod");
    const groupId = layout.groups[0]!.id;
    layout = moveEntityToSection(layout, "b", groupId);
    expect(layout.assignments.b).toBe(groupId);
    expect(layout.order[groupId]).toEqual(["b"]);
    expect(layout.order[UNGROUPED_SECTION]).toEqual(["a", "c"]);
    expect(layout.groupOrder).toEqual([groupId, UNGROUPED_SECTION]);
  });

  it("reorders groups including default bucket", () => {
    let layout = addEntityGroup(createDefaultLayout(["a"]), "G1");
    const groupId = layout.groups[0]!.id;
    expect(layout.groupOrder).toEqual([groupId, UNGROUPED_SECTION]);
    layout = reorderEntityGroups(layout, groupId, UNGROUPED_SECTION, "after");
    expect(layout.groupOrder).toEqual([UNGROUPED_SECTION, groupId]);
  });

  it("cannot delete default group", () => {
    const layout = deleteEntityGroup(createDefaultLayout(ids), UNGROUPED_SECTION);
    expect(isDefaultGroupId(UNGROUPED_SECTION)).toBe(true);
    expect(layout.groupOrder).toContain(UNGROUPED_SECTION);
  });

  it("sync adds new ids at end of ungrouped", () => {
    const layout = createDefaultLayout(["a", "b"]);
    const synced = syncLayoutWithEntities(layout, ["a", "b", "d"]);
    expect(synced.order[UNGROUPED_SECTION]).toEqual(["a", "b", "d"]);
  });

  it("delete custom group moves items to ungrouped", () => {
    let layout = addEntityGroup(createDefaultLayout(ids), "Lab");
    const groupId = layout.groups[0]!.id;
    layout = moveEntityToSection(layout, "a", groupId);
    layout = deleteEntityGroup(layout, groupId);
    expect(layout.order[UNGROUPED_SECTION]).toContain("a");
    expect(layout.assignments.a).toBeNull();
  });

  it("sync preserves grouped items across repeated sync", () => {
    let layout = addEntityGroup(createDefaultLayout(ids), "Prod");
    const groupId = layout.groups[0]!.id;
    layout = moveEntityToSection(layout, "b", groupId);
    const once = syncLayoutWithEntities(layout, ids);
    const twice = syncLayoutWithEntities(once, ids);
    expect(twice.assignments.b).toBe(groupId);
    expect(twice.order[groupId]).toEqual(["b"]);
    expect(layoutsEqual(once, twice)).toBe(true);
  });

  it("sync keeps assignment when order bucket is missing", () => {
    let layout = addEntityGroup(createDefaultLayout(ids), "Prod");
    const groupId = layout.groups[0]!.id;
    layout.assignments.b = groupId;
    layout.order[groupId] = [];
    layout.order[UNGROUPED_SECTION] = ["a", "c"];
    const synced = syncLayoutWithEntities(layout, ids);
    expect(synced.assignments.b).toBe(groupId);
    expect(synced.order[groupId]).toEqual(["b"]);
  });

  it("sync keeps order bucket when assignment is null", () => {
    let layout = addEntityGroup(createDefaultLayout(ids), "Prod");
    const groupId = layout.groups[0]!.id;
    layout.order[groupId] = ["b"];
    layout.order[UNGROUPED_SECTION] = ["a", "c"];
    layout.assignments.b = null;
    const synced = syncLayoutWithEntities(layout, ids);
    expect(synced.assignments.b).toBe(groupId);
    expect(synced.order[groupId]).toEqual(["b"]);
  });

  it("reload preserves grouped assignments after migration shape", () => {
    let layout = addEntityGroup(createDefaultLayout(ids), "Prod");
    const groupId = layout.groups[0]!.id;
    layout = moveEntityToSection(layout, "b", groupId);
    const stored = migrateStoredLayout(layout, "hosts");
    expect(stored?.assignments.b).toBe(groupId);
    const synced = syncLayoutWithEntities(stored!, ids);
    expect(synced.assignments.b).toBe(groupId);
    expect(synced.order[groupId]).toEqual(["b"]);
  });

  it("migrates v2 shared sidebar layout into per-scope v3", () => {
    const groupId = "grp-test";
    const sidebar = {
      version: 2,
      groups: [{ id: groupId, name: "Lab" }],
      groupOrder: [UNGROUPED_SECTION, groupId],
      scopes: {
        hosts: {
          assignments: { a: groupId, b: null },
          order: {
            [UNGROUPED_SECTION]: ["b"],
            [groupId]: ["a"],
          },
        },
        k8s: {
          assignments: {},
          order: { [UNGROUPED_SECTION]: [] },
        },
      },
    };
    const migrated = migrateStoredLayout(sidebar, "hosts");
    expect(migrated?.version).toBe(3);
    expect(migrated?.assignments.a).toBe(groupId);
    expect(migrated?.order[groupId]).toEqual(["a"]);
  });
});
