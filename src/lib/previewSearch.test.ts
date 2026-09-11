import { describe, expect, it } from "vitest";
import {
  findSearchMatches,
  getMatchPosition,
  isValidSearchQuery,
} from "./previewSearch";

describe("previewSearch", () => {
  it("finds literal matches case-insensitive by default", () => {
    const text = "Hello World\nhello again";
    const matches = findSearchMatches(text, "hello");
    expect(matches.length).toBe(2);
    expect(matches[0]?.start).toBe(0);
    expect(matches[1]?.start).toBe(12);
  });

  it("supports whole word", () => {
    const text = "cat scatter";
    const matches = findSearchMatches(text, "cat", { wholeWord: true });
    expect(matches).toEqual([{ start: 0, end: 3 }]);
  });

  it("rejects invalid regex", () => {
    expect(isValidSearchQuery("[", { regex: true })).toBe(false);
    expect(isValidSearchQuery("ok", { regex: true })).toBe(true);
  });

  it("maps index to line/column", () => {
    const text = "a\nbc\ndef";
    expect(getMatchPosition(text, 4)).toEqual({ line: 2, column: 3 });
  });
});
