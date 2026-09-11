/** Sidebar entity list layout: per-view groups + order (Hosts, K8s). */

export const UNGROUPED_SECTION = "__ungrouped__";
export const LAYOUT_VERSION = 3 as const;

export const ENTITY_LAYOUT_KEYS = {
  hosts: "tw.entityLayout.hosts",
  k8s: "tw.entityLayout.k8s",
} as const;

/** v2 shared sidebar blob — migrated into per-scope v3 keys on load. */
export const SIDEBAR_LAYOUT_KEY = "tw.entityLayout.sidebar";

export type EntityLayoutScope = keyof typeof ENTITY_LAYOUT_KEYS;

export interface EntityGroup {
  id: string;
  name: string;
  collapsed?: boolean;
}

export interface EntityListLayout {
  version: typeof LAYOUT_VERSION;
  /** Display order of all buckets, always includes {@link UNGROUPED_SECTION}. */
  groupOrder: string[];
  groups: EntityGroup[];
  /** Collapse state for the default ungrouped bucket. */
  defaultGroupCollapsed?: boolean;
  assignments: Record<string, string | null>;
  order: Record<string, string[]>;
}

export interface EntityListSection {
  key: string;
  group: EntityGroup;
  defaultGroup: boolean;
  itemIds: string[];
}

export type EntityReorderPosition = "before" | "after";

export function isDefaultGroupId(groupId: string): boolean {
  return groupId === UNGROUPED_SECTION;
}

function ensureSectionOrder(
  layout: EntityListLayout,
  sectionKey: string,
): string[] {
  if (!layout.order[sectionKey]) {
    layout.order[sectionKey] = [];
  }
  return layout.order[sectionKey];
}

function sectionKeyForItem(layout: EntityListLayout, itemId: string): string {
  return layout.assignments[itemId] ?? UNGROUPED_SECTION;
}

function normalizeGroupOrder(layout: EntityListLayout): string[] {
  const customIds = layout.groups.map((g) => g.id);
  const seen = new Set<string>();
  const order: string[] = [];

  for (const id of layout.groupOrder ?? []) {
    if (id === UNGROUPED_SECTION) {
      if (!seen.has(UNGROUPED_SECTION)) {
        seen.add(UNGROUPED_SECTION);
        order.push(UNGROUPED_SECTION);
      }
      continue;
    }
    if (customIds.includes(id) && !seen.has(id)) {
      seen.add(id);
      order.push(id);
    }
  }

  const missingCustom = customIds.filter((id) => !seen.has(id));
  if (missingCustom.length > 0) {
    const ungroupedIdx = order.indexOf(UNGROUPED_SECTION);
    if (ungroupedIdx >= 0) {
      order.splice(ungroupedIdx, 0, ...missingCustom);
    } else {
      order.push(...missingCustom);
    }
    for (const id of missingCustom) seen.add(id);
  }

  if (!seen.has(UNGROUPED_SECTION)) {
    order.push(UNGROUPED_SECTION);
  }
  return order;
}

export function createDefaultLayout(entityIds: string[]): EntityListLayout {
  return {
    version: LAYOUT_VERSION,
    groupOrder: [UNGROUPED_SECTION],
    groups: [],
    defaultGroupCollapsed: true,
    assignments: Object.fromEntries(entityIds.map((id) => [id, null])),
    order: { [UNGROUPED_SECTION]: [...entityIds] },
  };
}

function resolveItemSection(
  layout: EntityListLayout,
  itemId: string,
  groups: EntityGroup[],
  fromBucketId?: string,
): string {
  const assignment = layout.assignments[itemId] ?? null;
  if (assignment && groups.some((g) => g.id === assignment)) {
    return assignment;
  }
  if (
    fromBucketId &&
    !isDefaultGroupId(fromBucketId) &&
    groups.some((g) => g.id === fromBucketId)
  ) {
    return fromBucketId;
  }
  return UNGROUPED_SECTION;
}

function layoutSnapshot(layout: EntityListLayout): string {
  return JSON.stringify(layout);
}

function migrateV2SidebarScope(
  raw: Record<string, unknown>,
  scope: EntityLayoutScope,
): EntityListLayout {
  const scopes = raw.scopes as
    | Record<
        EntityLayoutScope,
        {
          assignments?: Record<string, string | null>;
          order?: Record<string, string[]>;
        }
      >
    | undefined;
  const scopeData = scopes?.[scope];
  const groups = (raw.groups as EntityGroup[] | undefined) ?? [];
  return {
    version: LAYOUT_VERSION,
    groupOrder: normalizeGroupOrder({
      version: LAYOUT_VERSION,
      groupOrder: (raw.groupOrder as string[] | undefined) ?? [
        ...groups.map((g) => g.id),
        UNGROUPED_SECTION,
      ],
      groups,
      defaultGroupCollapsed: true,
      assignments: scopeData?.assignments ?? {},
      order: scopeData?.order ?? { [UNGROUPED_SECTION]: [] },
    }),
    groups,
    defaultGroupCollapsed: true,
    assignments: scopeData?.assignments ?? {},
    order: scopeData?.order ?? { [UNGROUPED_SECTION]: [] },
  };
}

export function migrateStoredLayout(
  raw: unknown,
  scope: EntityLayoutScope,
): EntityListLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const record = raw as Record<string, unknown>;

  if (record.version === LAYOUT_VERSION) {
    return raw as EntityListLayout;
  }

  if (record.version === 1) {
    const legacy = raw as {
      groups?: EntityGroup[];
      assignments?: Record<string, string | null>;
      order?: Record<string, string[]>;
    };
    const layout = createDefaultLayout([]);
    layout.groups = legacy.groups ?? [];
    layout.assignments = legacy.assignments ?? layout.assignments;
    layout.order = legacy.order ?? layout.order;
    layout.groupOrder = normalizeGroupOrder({
      ...layout,
      groupOrder: [...layout.groups.map((g) => g.id), UNGROUPED_SECTION],
    });
    return layout;
  }

  if (record.version === 2 && record.scopes && record.groups) {
    return migrateV2SidebarScope(record, scope);
  }

  return null;
}

export function readStoredEntityLayout(scope: EntityLayoutScope): EntityListLayout | null {
  try {
    const raw = localStorage.getItem(ENTITY_LAYOUT_KEYS[scope]);
    if (raw) {
      return migrateStoredLayout(JSON.parse(raw), scope);
    }
    const sidebarRaw = localStorage.getItem(SIDEBAR_LAYOUT_KEY);
    if (!sidebarRaw) return null;
    const parsed = JSON.parse(sidebarRaw) as Record<string, unknown>;
    if (parsed.version !== 2 || !parsed.scopes || !parsed.groups) return null;
    return migrateV2SidebarScope(parsed, scope);
  } catch {
    return null;
  }
}

function finalizeLayoutForEntities(
  layout: EntityListLayout,
  entityIds: string[],
): EntityListLayout {
  if (entityIds.length === 0) return layout;
  return syncLayoutWithEntities(layout, entityIds);
}

export function layoutLooksStripped(
  layout: EntityListLayout,
  entityIds: string[],
): boolean {
  if (layout.groups.length === 0 || entityIds.length === 0) return false;
  const hasGroupedAssignment = entityIds.some(
    (id) => layout.assignments[id] != null,
  );
  const hasGroupedOrder = layout.groups.some(
    (group) => (layout.order[group.id]?.length ?? 0) > 0,
  );
  return !hasGroupedAssignment && !hasGroupedOrder;
}

export function loadEntityListLayout(
  scope: EntityLayoutScope,
  entityIds: string[],
): EntityListLayout {
  try {
    const hadScopeKey = Boolean(localStorage.getItem(ENTITY_LAYOUT_KEYS[scope]));
    const stored = readStoredEntityLayout(scope);
    if (stored) {
      const finalized = finalizeLayoutForEntities(stored, entityIds);
      if (!hadScopeKey) {
        saveEntityListLayout(scope, finalized);
      }
      return finalized;
    }
  } catch {
    /* fall through */
  }
  return finalizeLayoutForEntities(createDefaultLayout(entityIds), entityIds);
}

export function saveEntityListLayout(
  scope: EntityLayoutScope,
  layout: EntityListLayout,
): void {
  try {
    localStorage.setItem(ENTITY_LAYOUT_KEYS[scope], JSON.stringify(layout));
  } catch {
    /* ignore quota */
  }
}

export function syncLayoutWithEntities(
  layout: EntityListLayout,
  entityIds: string[],
): EntityListLayout {
  const idSet = new Set(entityIds);
  const groups = layout.groups.filter((g) => g.id.trim() && !isDefaultGroupId(g.id));
  const next: EntityListLayout = {
    version: LAYOUT_VERSION,
    groupOrder: normalizeGroupOrder({ ...layout, groups }),
    groups,
    defaultGroupCollapsed: layout.defaultGroupCollapsed,
    assignments: {},
    order: {},
  };

  for (const groupId of next.groupOrder) {
    next.order[groupId] = [];
  }

  const seen = new Set<string>();
  for (const groupId of next.groupOrder) {
    for (const id of layout.order[groupId] ?? []) {
      if (!idSet.has(id) || seen.has(id)) continue;
      seen.add(id);
      const target = resolveItemSection(layout, id, groups, groupId);
      next.assignments[id] = target === UNGROUPED_SECTION ? null : target;
      ensureSectionOrder(next, target).push(id);
    }
  }

  for (const id of entityIds) {
    if (seen.has(id)) continue;
    const target = resolveItemSection(layout, id, groups);
    next.assignments[id] = target === UNGROUPED_SECTION ? null : target;
    ensureSectionOrder(next, target).push(id);
  }

  return next;
}

export function layoutsEqual(a: EntityListLayout, b: EntityListLayout): boolean {
  return layoutSnapshot(a) === layoutSnapshot(b);
}

export function resolveGroup(
  layout: EntityListLayout,
  groupId: string,
  defaultGroupName: string,
): EntityGroup {
  if (isDefaultGroupId(groupId)) {
    return {
      id: UNGROUPED_SECTION,
      name: defaultGroupName,
      collapsed: layout.defaultGroupCollapsed ?? true,
    };
  }
  const found = layout.groups.find((g) => g.id === groupId);
  if (found) {
    return { ...found, collapsed: found.collapsed ?? true };
  }
  return {
    id: groupId,
    name: groupId,
    collapsed: true,
  };
}

export function buildEntityListSections(
  layout: EntityListLayout,
  entityIds: string[],
  defaultGroupName: string,
): EntityListSection[] {
  const synced = syncLayoutWithEntities(layout, entityIds);
  return synced.groupOrder.map((groupId) => ({
    key: groupId,
    group: resolveGroup(synced, groupId, defaultGroupName),
    defaultGroup: isDefaultGroupId(groupId),
    itemIds: synced.order[groupId] ?? [],
  }));
}

export function reorderIds(
  ids: string[],
  dragId: string,
  targetId: string,
  position: EntityReorderPosition,
): string[] {
  if (dragId === targetId) return ids;
  const from = ids.indexOf(dragId);
  const to = ids.indexOf(targetId);
  if (from < 0 || to < 0) return ids;
  const next = ids.filter((id) => id !== dragId);
  const targetIndex = next.indexOf(targetId);
  const insertAt = position === "before" ? targetIndex : targetIndex + 1;
  next.splice(insertAt, 0, dragId);
  return next;
}

export function reorderEntityItem(
  layout: EntityListLayout,
  dragId: string,
  targetId: string,
  position: EntityReorderPosition,
): EntityListLayout {
  const sectionKey = sectionKeyForItem(layout, dragId);
  const targetSection = sectionKeyForItem(layout, targetId);
  if (sectionKey !== targetSection) return layout;
  const next = structuredClone(layout);
  next.order[sectionKey] = reorderIds(
    ensureSectionOrder(next, sectionKey),
    dragId,
    targetId,
    position,
  );
  return next;
}

export function moveEntityToSection(
  layout: EntityListLayout,
  itemId: string,
  toSectionKey: string,
  targetId?: string | null,
  position: EntityReorderPosition = "after",
): EntityListLayout {
  const fromKey = sectionKeyForItem(layout, itemId);
  if (fromKey === toSectionKey && !targetId) return layout;

  const next = structuredClone(layout);
  next.order[fromKey] = (next.order[fromKey] ?? []).filter((id) => id !== itemId);

  if (toSectionKey === UNGROUPED_SECTION) {
    next.assignments[itemId] = null;
  } else if (next.groups.some((g) => g.id === toSectionKey)) {
    next.assignments[itemId] = toSectionKey;
  } else {
    return layout;
  }

  const bucket = ensureSectionOrder(next, toSectionKey).filter(
    (id) => id !== itemId,
  );
  if (targetId && bucket.includes(targetId)) {
    const idx = bucket.indexOf(targetId);
    const insertAt = position === "before" ? idx : idx + 1;
    bucket.splice(insertAt, 0, itemId);
  } else {
    bucket.push(itemId);
  }
  next.order[toSectionKey] = bucket;
  return next;
}

export function moveEntityRelativeToTarget(
  layout: EntityListLayout,
  dragId: string,
  targetId: string,
  position: EntityReorderPosition,
): EntityListLayout {
  const fromKey = sectionKeyForItem(layout, dragId);
  const toKey = sectionKeyForItem(layout, targetId);
  if (fromKey === toKey) {
    return reorderEntityItem(layout, dragId, targetId, position);
  }
  return moveEntityToSection(layout, dragId, toKey, targetId, position);
}

export function reorderEntityGroups(
  layout: EntityListLayout,
  dragGroupId: string,
  targetGroupId: string,
  position: EntityReorderPosition,
): EntityListLayout {
  if (dragGroupId === targetGroupId) return layout;
  const next = structuredClone(layout);
  next.groupOrder = reorderIds(
    normalizeGroupOrder(next),
    dragGroupId,
    targetGroupId,
    position,
  );
  return next;
}

export function addEntityGroup(
  layout: EntityListLayout,
  name: string,
  id = `grp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
): EntityListLayout {
  const next = structuredClone(layout);
  next.groups.push({ id, name: name.trim() || "Group", collapsed: true });
  next.order[id] = [];
  next.groupOrder = normalizeGroupOrder(next);
  return next;
}

export function renameEntityGroup(
  layout: EntityListLayout,
  groupId: string,
  name: string,
): EntityListLayout {
  if (isDefaultGroupId(groupId)) return layout;
  const next = structuredClone(layout);
  next.groups = next.groups.map((g) =>
    g.id === groupId ? { ...g, name: name.trim() || g.name } : g,
  );
  return next;
}

export function deleteEntityGroup(
  layout: EntityListLayout,
  groupId: string,
): EntityListLayout {
  if (isDefaultGroupId(groupId)) return layout;
  const next = structuredClone(layout);
  const moving = next.order[groupId] ?? [];
  delete next.order[groupId];
  next.groups = next.groups.filter((g) => g.id !== groupId);
  next.groupOrder = normalizeGroupOrder(next).filter((id) => id !== groupId);
  for (const id of moving) {
    next.assignments[id] = null;
  }
  next.order[UNGROUPED_SECTION] = [
    ...(next.order[UNGROUPED_SECTION] ?? []),
    ...moving,
  ];
  return next;
}

export function toggleEntityGroupCollapsed(
  layout: EntityListLayout,
  groupId: string,
): EntityListLayout {
  const next = structuredClone(layout);
  if (isDefaultGroupId(groupId)) {
    next.defaultGroupCollapsed = !(next.defaultGroupCollapsed ?? true);
    return next;
  }
  next.groups = next.groups.map((g) =>
    g.id === groupId ? { ...g, collapsed: !(g.collapsed ?? true) } : g,
  );
  return next;
}

export function flattenEntityOrder(sections: EntityListSection[]): string[] {
  return sections.flatMap((s) => s.itemIds);
}
