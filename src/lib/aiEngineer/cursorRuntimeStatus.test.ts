import { describe, expect, it } from "vitest";
import { externalRuntimeStatusKind } from "./cursorRuntimeStatus";

describe("externalRuntimeStatusKind", () => {
  it("returns unknown without probe", () => {
    expect(externalRuntimeStatusKind(null)).toBe("unknown");
  });

  it("marks install_needed", () => {
    expect(
      externalRuntimeStatusKind({
        kind: "cursor",
        installed: false,
        authenticated: false,
        detail: "install_needed",
        fake: false,
        code: "install_needed",
        install_url: "https://cursor.com/download",
      }),
    ).toBe("install_needed");
  });

  it("marks fake ready", () => {
    expect(
      externalRuntimeStatusKind({
        kind: "claude",
        installed: true,
        authenticated: true,
        detail: "fake",
        fake: true,
        code: "fake",
      }),
    ).toBe("ready_fake");
  });

  it("marks real ready", () => {
    expect(
      externalRuntimeStatusKind({
        kind: "cursor",
        installed: true,
        authenticated: true,
        detail: "login_unchecked",
        fake: false,
        code: "ready",
        binary: "/usr/bin/cursor-agent",
      }),
    ).toBe("ready");
  });

  it("marks login_needed", () => {
    expect(
      externalRuntimeStatusKind({
        kind: "cursor",
        installed: true,
        authenticated: false,
        detail: "login_needed",
        fake: false,
        code: "login_needed",
        login_hint: "Sign in with Cursor in TerminalWisely",
      }),
    ).toBe("login_needed");
  });
});
