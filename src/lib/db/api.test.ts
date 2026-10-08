import { describe, expect, it } from "vitest";
import { approvalStillMatches } from "./api";

describe("approvalStillMatches", () => {
  it("requires the same statement after an edit", () => {
    expect(approvalStillMatches("UPDATE t SET a = 1", "UPDATE t SET a = 1")).toBe(true);
    expect(approvalStillMatches("UPDATE t SET a = 1", "UPDATE t SET a = 2")).toBe(false);
  });
});