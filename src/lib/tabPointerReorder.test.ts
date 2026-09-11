/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  findTabReorderTarget,
  isTabReordering,
  startTabPointerReorder,
} from "./tabPointerReorder";

function mountTabs() {
  const bar = document.createElement("div");
  bar.className = "tab-bar";
  const a = document.createElement("div");
  a.className = "tab";
  a.dataset.sessionId = "a";
  a.getBoundingClientRect = () =>
    ({
      left: 0,
      right: 80,
      top: 0,
      bottom: 26,
      width: 80,
      height: 26,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  const b = document.createElement("div");
  b.className = "tab";
  b.dataset.sessionId = "b";
  b.getBoundingClientRect = () =>
    ({
      left: 80,
      right: 160,
      top: 0,
      bottom: 26,
      width: 80,
      height: 26,
      x: 80,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
  bar.append(a, b);
  document.body.appendChild(bar);
  return { bar, a, b };
}

afterEach(() => {
  document.body.innerHTML = "";
  document.body.className = "";
});

describe("findTabReorderTarget", () => {
  it("picks before/after from x within a neighbor tab", () => {
    const { bar } = mountTabs();
    expect(findTabReorderTarget(90, 10, "a", bar)).toEqual({
      id: "b",
      position: "before",
    });
    expect(findTabReorderTarget(140, 10, "a", bar)).toEqual({
      id: "b",
      position: "after",
    });
  });

  it("snaps past the strip ends", () => {
    const { bar } = mountTabs();
    expect(findTabReorderTarget(-10, 10, "a", bar)).toEqual({
      id: "b",
      position: "before",
    });
    expect(findTabReorderTarget(400, 10, "a", bar)).toEqual({
      id: "b",
      position: "after",
    });
  });
});

describe("startTabPointerReorder", () => {
  it("arms body class and keeps source tab width while dragging", () => {
    const { a, b } = mountTabs();
    const onReorder = vi.fn();

    startTabPointerReorder({
      tabId: "a",
      tabElement: a,
      pointerId: 1,
      startX: 10,
      startY: 10,
      onPreview: () => {},
      onReorder,
    });
    expect(isTabReordering()).toBe(true);

    document.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 50,
        clientY: 10,
        bubbles: true,
      }),
    );
    expect(a.classList.contains("tab-reorder-dragging")).toBe(true);
    expect(a.style.width).toBe("80px");
    expect(document.querySelector(".tab-drag-ghost")).not.toBeNull();

    // Move over tab b's right half.
    b.getBoundingClientRect = () =>
      ({
        left: 80,
        right: 160,
        top: 0,
        bottom: 26,
        width: 80,
        height: 26,
        x: 80,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 140,
        clientY: 10,
        bubbles: true,
      }),
    );
    document.dispatchEvent(
      new PointerEvent("pointerup", {
        pointerId: 1,
        clientX: 140,
        clientY: 10,
        bubbles: true,
      }),
    );

    expect(onReorder).toHaveBeenCalledWith("a", "b", "after");
    expect(isTabReordering()).toBe(false);
    expect(a.classList.contains("tab-reorder-dragging")).toBe(false);
    expect(a.style.width).toBe("");
    expect(document.querySelector(".tab-drag-ghost")).toBeNull();
  });

  it("cancels a mostly-vertical gesture without collapsing the tab", () => {
    const { a } = mountTabs();
    startTabPointerReorder({
      tabId: "a",
      tabElement: a,
      pointerId: 1,
      startX: 10,
      startY: 10,
      onPreview: () => {},
      onReorder: () => {},
    });
    document.dispatchEvent(
      new PointerEvent("pointermove", {
        pointerId: 1,
        clientX: 12,
        clientY: 40,
        bubbles: true,
      }),
    );
    expect(isTabReordering()).toBe(false);
    expect(a.classList.contains("tab-reorder-dragging")).toBe(false);
  });
});
