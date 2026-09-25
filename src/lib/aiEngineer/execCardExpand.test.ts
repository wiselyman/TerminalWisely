import { describe, expect, it } from "vitest";
import {
  nextExecCardExpanded,
  scrollTopAfterCollapseAbove,
} from "./execCardExpand";

describe("nextExecCardExpanded", () => {
  it("stays open while running or live", () => {
    expect(
      nextExecCardExpanded({ live: true, running: false, userPinnedOpen: false }),
    ).toEqual({ expanded: true, clearUserPin: true });
    expect(
      nextExecCardExpanded({ live: false, running: true, userPinnedOpen: true }),
    ).toEqual({ expanded: true, clearUserPin: true });
  });

  it("auto-collapses when finished unless user pinned open", () => {
    expect(
      nextExecCardExpanded({
        live: false,
        running: false,
        userPinnedOpen: false,
      }),
    ).toEqual({ expanded: false, clearUserPin: false });
    expect(
      nextExecCardExpanded({
        live: false,
        running: false,
        userPinnedOpen: true,
      }),
    ).toEqual({ expanded: true, clearUserPin: false });
  });
});

describe("scrollTopAfterCollapseAbove", () => {
  it("subtracts full delta when card was entirely above the fold", () => {
    expect(
      scrollTopAfterCollapseAbove({
        scrollTop: 500,
        cardOffsetTop: 100,
        heightDelta: 200,
      }),
    ).toBe(300);
  });

  it("leaves scroll alone when card is fully below the fold", () => {
    expect(
      scrollTopAfterCollapseAbove({
        scrollTop: 100,
        cardOffsetTop: 400,
        heightDelta: 200,
      }),
    ).toBe(100);
  });

  it("partially compensates when card straddles the top edge", () => {
    expect(
      scrollTopAfterCollapseAbove({
        scrollTop: 150,
        cardOffsetTop: 100,
        heightDelta: 80,
      }),
    ).toBe(100);
  });
});
