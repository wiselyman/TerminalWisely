import { describe, expect, it } from "vitest";
import { desktopTargetKey, isSshDesktopTarget } from "./desktopTarget";

describe("desktop target identity", () => {
  it("uses a stable local key distinct from every SSH session", () => {
    expect(desktopTargetKey({ kind: "local" })).toBe("local");
    expect(desktopTargetKey({ kind: "ssh", sessionId: "host-a" })).toBe("ssh:host-a");
    expect(desktopTargetKey({ kind: "ssh", sessionId: "host-b" })).toBe("ssh:host-b");
  });

  it("recognizes only SSH targets and preserves the real session id", () => {
    const local = { kind: "local" } as const;
    const ssh = { kind: "ssh", sessionId: "host-a" } as const;

    expect(isSshDesktopTarget(local)).toBe(false);
    expect(isSshDesktopTarget(ssh)).toBe(true);
    if (isSshDesktopTarget(ssh)) expect(ssh.sessionId).toBe("host-a");
  });
});
