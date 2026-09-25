import { describe, expect, it } from "vitest";
import { cursorRuntimeStatusKind } from "./cursorRuntimeStatus";

describe("cursorRuntimeStatusKind", () => {
  it("returns unknown without probe", () => {
    expect(cursorRuntimeStatusKind(null)).toBe("unknown");
    expect(cursorRuntimeStatusKind(undefined)).toBe("unknown");
  });

  it("marks fake cursor ready", () => {
    expect(
      cursorRuntimeStatusKind({
        kind: "cursor",
        installed: true,
        authenticated: true,
        detail: "fake",
        fake: true,
      }),
    ).toBe("ready_fake");
  });

  it("marks real cursor ready when installed+auth", () => {
    expect(
      cursorRuntimeStatusKind({
        kind: "cursor",
        installed: true,
        authenticated: true,
        detail: "sdk",
        fake: false,
      }),
    ).toBe("ready");
  });

  it("marks not ready when missing auth", () => {
    expect(
      cursorRuntimeStatusKind({
        kind: "cursor",
        installed: true,
        authenticated: false,
        detail: "missing",
        fake: false,
      }),
    ).toBe("not_ready");
  });
});
