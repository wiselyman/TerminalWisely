/** Resolve task-manager column width for table-layout:fixed. */

export type TaskManagerColKey = "name" | "port" | "memory" | "cpu";

export type TaskManagerColumnWidths = Record<TaskManagerColKey, number | null>;

/** Percentage defaults — fill wide desktop panels instead of a skinny right cluster. */
export const TASK_MANAGER_COL_PERCENTS: Record<TaskManagerColKey, string> = {
  name: "40%",
  port: "26%",
  memory: "16%",
  cpu: "12%",
};

export const TASK_MANAGER_COL_MIN: Record<TaskManagerColKey, number> = {
  name: 120,
  port: 88,
  memory: 88,
  cpu: 64,
};

export const TASK_MANAGER_COL_MAX: Partial<Record<TaskManagerColKey, number>> = {
  memory: 180,
  cpu: 120,
};

export const TASK_MANAGER_ACTIONS_COL_WIDTH = 40;

export const TASK_MANAGER_COLUMNS_STORAGE_KEY =
  "terminal-wisely.task-manager-columns.v2";

export function emptyTaskManagerColumnWidths(): TaskManagerColumnWidths {
  return { name: null, port: null, memory: null, cpu: null };
}

export function resolveTaskManagerColWidth(
  key: TaskManagerColKey,
  widths: TaskManagerColumnWidths,
): string | number {
  const px = widths[key];
  return px != null ? px : TASK_MANAGER_COL_PERCENTS[key];
}

export function clampTaskManagerColWidth(
  key: TaskManagerColKey,
  value: number,
): number {
  const min = TASK_MANAGER_COL_MIN[key];
  const max = TASK_MANAGER_COL_MAX[key] ?? Number.POSITIVE_INFINITY;
  return Math.min(max, Math.max(min, value));
}

/** Parse persisted widths; ignore legacy ultra-narrow pixel defaults. */
export function parseTaskManagerColumnWidths(
  raw: string | null,
): TaskManagerColumnWidths {
  const empty = emptyTaskManagerColumnWidths();
  if (!raw) return empty;
  try {
    const parsed = JSON.parse(raw) as Partial<TaskManagerColumnWidths>;
    const next = { ...empty };
    for (const key of ["name", "port", "memory", "cpu"] as const) {
      const value = parsed[key];
      if (typeof value !== "number" || !Number.isFinite(value)) continue;
      // Legacy v1 defaults were ~52–80px; treat those as unset so % layout applies.
      if (value < TASK_MANAGER_COL_MIN[key]) continue;
      next[key] = clampTaskManagerColWidth(key, value);
    }
    return next;
  } catch {
    return empty;
  }
}
