import { describe, expect, it } from "vitest";
import {
  isAiSshLeased,
  shouldAllowManualReconnectSsh,
  shouldAutoReconnectSsh,
} from "./sshLease";

describe("sshLease", () => {
  it("detects lease membership", () => {
    expect(isAiSshLeased(new Set(["a"]), "a")).toBe(true);
    expect(isAiSshLeased(new Set(["a"]), "b")).toBe(false);
  });

  it("blocks auto-reconnect while leased", () => {
    expect(
      shouldAutoReconnectSsh({
        kind: "ssh",
        isDisconnected: true,
        leased: true,
      }),
    ).toBe(false);
  });

  it("allows auto-reconnect when disconnected ssh and not leased", () => {
    expect(
      shouldAutoReconnectSsh({
        kind: "ssh",
        isDisconnected: true,
        leased: false,
      }),
    ).toBe(true);
  });

  it("blocks manual reconnect while leased", () => {
    expect(shouldAllowManualReconnectSsh(true)).toBe(false);
    expect(shouldAllowManualReconnectSsh(false)).toBe(true);
  });
});
