import { describe, expect, it } from "vitest";
import { unwantedLeadingCapital } from "./textEntryCase";

const empty = {
  data: "A",
  inputType: "insertText",
  isComposing: false,
  shiftKey: false,
  capsLock: false,
  selectionStart: 0,
  valueLength: 0,
};

describe("unwantedLeadingCapital", () => {
  it("lowercases a leading capital the user did not ask for", () => {
    expect(unwantedLeadingCapital(empty)).toBe("a");
  });

  it("keeps shift, caps lock, composition, and later letters", () => {
    expect(unwantedLeadingCapital({ ...empty, shiftKey: true })).toBeNull();
    expect(unwantedLeadingCapital({ ...empty, capsLock: true })).toBeNull();
    expect(unwantedLeadingCapital({ ...empty, isComposing: true })).toBeNull();
    expect(unwantedLeadingCapital({ ...empty, selectionStart: 3, valueLength: 3 })).toBeNull();
    expect(unwantedLeadingCapital({ ...empty, data: "a" })).toBeNull();
    expect(unwantedLeadingCapital({ ...empty, data: "中" })).toBeNull();
  });
});
