import { describe, expect, it } from "vitest";
import {
  UNGROUPED_SECTION,
  addEntityGroup,
  buildEntityListSections,
  createDefaultLayout,
  deleteEntityGroup,
  isDefaultGroupId,
  loadEntityListLayout,
  moveEntityToSection,
  placeEntityInSection,
  preferHealthierLayout,
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
    expect(sections[0]?.group.collapsed).toBe(false);
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

  it("places a new host in the chosen group and expands it", () => {
    let layout = addEntityGroup(createDefaultLayout(ids), "Lab");
    const groupId = layout.groups[0]!.id;
    layout = placeEntityInSection(layout, "new-host", groupId);
    expect(layout.assignments["new-host"]).toBe(groupId);
    expect(layout.order[groupId]).toEqual(["new-host"]);
    expect(layout.groups[0]?.collapsed).toBe(false);
    expect(layout.defaultGroupCollapsed).toBe(false);
  });

  it("places a new host in ungrouped and keeps that section expanded", () => {
    const layout = placeEntityInSection(createDefaultLayout(ids), "new-host", UNGROUPED_SECTION);
    expect(layout.assignments["new-host"]).toBeNull();
    expect(layout.order[UNGROUPED_SECTION]).toEqual(["a", "b", "c", "new-host"]);
    const sections = buildEntityListSections(layout, [...ids, "new-host"], defaultName);
    expect(sections[0]?.group.collapsed).toBe(false);
  });

  it("migrates v3 collapsed ungrouped to expanded", () => {
    const migrated = migrateStoredLayout(
      {
        version: 3,
        groupOrder: [UNGROUPED_SECTION],
        groups: [],
        defaultGroupCollapsed: true,
        assignments: { a: null },
        order: { [UNGROUPED_SECTION]: ["a"] },
      },
      "hosts",
    );
    expect(migrated?.version).toBe(4);
    expect(migrated?.defaultGroupCollapsed).toBe(false);
    expect(migrated?.assignments.a).toBeNull();
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

  it("preferHealthierLayout recovers stripped v3 hosts from sidebar snapshot", () => {
    const groupId = "grp-home";
    const stripped = {
      version: 4 as const,
      groupOrder: [groupId, UNGROUPED_SECTION],
      groups: [{ id: groupId, name: "家", collapsed: true }],
      defaultGroupCollapsed: false,
      assignments: { a: null, b: null },
      order: { [groupId]: [], [UNGROUPED_SECTION]: ["a", "b"] },
    };
    const healthy = {
      version: 4 as const,
      groupOrder: [groupId, UNGROUPED_SECTION],
      groups: [{ id: groupId, name: "家", collapsed: false }],
      defaultGroupCollapsed: true,
      assignments: { a: groupId, b: groupId },
      order: { [groupId]: ["a", "b"], [UNGROUPED_SECTION]: [] },
    };
    const picked = preferHealthierLayout(stripped, healthy, ["a", "b"]);
    expect(picked?.assignments.a).toBe(groupId);
    expect(picked?.order[groupId]).toEqual(["a", "b"]);
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
    expect(migrated?.version).toBe(4);
    expect(migrated?.defaultGroupCollapsed).toBe(false);
    expect(migrated?.assignments.a).toBe(groupId);
    expect(migrated?.order[groupId]).toEqual(["a"]);
  });

  it("loadEntityListLayout rewrites stripped hosts from sidebar v2", () => {
    const groupId = "grp-home";
    const stripped = {
      version: 3,
      groupOrder: [groupId, UNGROUPED_SECTION],
      groups: [{ id: groupId, name: "家", collapsed: true }],
      defaultGroupCollapsed: false,
      assignments: { a: null, b: null },
      order: { [groupId]: [], [UNGROUPED_SECTION]: ["a", "b"] },
    };
    const sidebar = {
      version: 2,
      groups: [{ id: groupId, name: "家", collapsed: false }],
      groupOrder: [groupId, UNGROUPED_SECTION],
      scopes: {
        hosts: {
          assignments: { a: groupId, b: groupId },
          order: { [groupId]: ["a", "b"], [UNGROUPED_SECTION]: [] },
        },
        k8s: { assignments: {}, order: { [UNGROUPED_SECTION]: [] } },
      },
    };
    localStorage.setItem("tw.entityLayout.hosts", JSON.stringify(stripped));
    localStorage.setItem("tw.entityLayout.sidebar", JSON.stringify(sidebar));
    const loaded = loadEntityListLayout("hosts", ["a", "b"]);
    expect(loaded.assignments.a).toBe(groupId);
    expect(loaded.order[groupId]).toEqual(["a", "b"]);
    const rewritten = JSON.parse(
      localStorage.getItem("tw.entityLayout.hosts") || "{}",
    );
    expect(rewritten.assignments.a).toBe(groupId);
  });
});
