import { describe, expect, it } from "vitest";
import { splitStartupNotice } from "./startupNotice";

describe("splitStartupNotice", () => {
  it("separates cleanup failures from catalog restore notices", () => {
    expect(
      splitStartupNotice([
        "connections.json",
        "cleanup-failed:database keychain entry secret-1: locked",
      ]),
    ).toEqual({
      restored: ["connections.json"],
      cleanupFailures: ["database keychain entry secret-1: locked"],
    });
  });
});
