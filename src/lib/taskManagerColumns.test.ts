import { describe, expect, it } from "vitest";
import {
  emptyTaskManagerColumnWidths,
  parseTaskManagerColumnWidths,
  resolveTaskManagerColWidth,
  TASK_MANAGER_COL_MIN,
  TASK_MANAGER_COL_PERCENTS,
} from "./taskManagerColumns";

describe("taskManagerColumns", () => {
  it("uses percentage defaults when widths are unset", () => {
    const widths = emptyTaskManagerColumnWidths();
    expect(resolveTaskManagerColWidth("name", widths)).toBe(
      TASK_MANAGER_COL_PERCENTS.name,
    );
    expect(resolveTaskManagerColWidth("port", widths)).toBe(
      TASK_MANAGER_COL_PERCENTS.port,
    );
    expect(resolveTaskManagerColWidth("memory", widths)).toBe(
      TASK_MANAGER_COL_PERCENTS.memory,
    );
    expect(resolveTaskManagerColWidth("cpu", widths)).toBe(
      TASK_MANAGER_COL_PERCENTS.cpu,
    );
  });

  it("prefers explicit pixel widths after resize", () => {
    const widths = {
      name: 220,
      port: 140,
      memory: null,
      cpu: 80,
    };
    expect(resolveTaskManagerColWidth("name", widths)).toBe(220);
    expect(resolveTaskManagerColWidth("port", widths)).toBe(140);
    expect(resolveTaskManagerColWidth("memory", widths)).toBe(
      TASK_MANAGER_COL_PERCENTS.memory,
    );
  });

  it("ignores legacy ultra-narrow stored widths", () => {
    const parsed = parseTaskManagerColumnWidths(
      JSON.stringify({ name: null, port: 56, memory: 80, cpu: 52 }),
    );
    expect(parsed.port).toBeNull();
    expect(parsed.memory).toBeNull();
    expect(parsed.cpu).toBeNull();
    expect(parsed.memory === null || parsed.memory >= TASK_MANAGER_COL_MIN.memory).toBe(
      true,
    );
  });
});
