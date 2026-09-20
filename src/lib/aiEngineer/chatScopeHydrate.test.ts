import { describe, expect, it } from "vitest";
import { needsDiskMessageHydration } from "./chatScopeHydrate";

describe("needsDiskMessageHydration", () => {
  it("is true when messages are empty (index-only / cold scope)", () => {
    expect(needsDiskMessageHydration([])).toBe(true);
  });

  it("is true when only system/status placeholders exist", () => {
    expect(
      needsDiskMessageHydration([{ kind: "system" }, { kind: "status" }]),
    ).toBe(true);
  });

  it("is false once a user or assistant turn is present", () => {
    expect(
      needsDiskMessageHydration([{ kind: "user", content: "hi" } as { kind: string }]),
    ).toBe(false);
    expect(needsDiskMessageHydration([{ kind: "assistant" }])).toBe(false);
  });
});
