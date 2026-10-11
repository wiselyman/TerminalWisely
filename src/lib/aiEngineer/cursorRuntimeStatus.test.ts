import { describe, expect, it } from "vitest";
import {
  canSelectExternalRuntime,
  externalRuntimeStatusKind,
  mergeRuntimeProbe,
  shouldAutoStartRuntimeLogin,
} from "./cursorRuntimeStatus";
import type { RuntimeProbeResult } from "./api";

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

  it("allows only a detected CLI to be the answering agent", () => {
    expect(canSelectExternalRuntime("ready")).toBe(true);
    expect(canSelectExternalRuntime("ready_fake")).toBe(true);
    expect(canSelectExternalRuntime("login_needed")).toBe(true);
    expect(shouldAutoStartRuntimeLogin("login_needed")).toBe(true);
    expect(shouldAutoStartRuntimeLogin("cli_failed")).toBe(false);
    expect(canSelectExternalRuntime("install_needed")).toBe(false);
    expect(canSelectExternalRuntime("unknown")).toBe(false);
    expect(canSelectExternalRuntime("not_ready")).toBe(false);
  });

  it("does not draw a transport failure as not installed", () => {
    const failed: RuntimeProbeResult = {
      kind: "cursor",
      installed: false,
      authenticated: false,
      detail: "probe_failed",
      fake: false,
      code: "probe_failed",
    };
    expect(externalRuntimeStatusKind(failed, "cursor")).toBe("unknown");
    const ready: RuntimeProbeResult = {
      kind: "codex",
      installed: true,
      authenticated: true,
      detail: "ready",
      fake: false,
      code: "ready",
    };
    const inconclusive: RuntimeProbeResult = {
      kind: "codex",
      installed: true,
      authenticated: false,
      detail: "probe_inconclusive",
      fake: false,
      code: "probe_inconclusive",
    };
    expect(mergeRuntimeProbe(ready, inconclusive).code).toBe("ready");
    expect(mergeRuntimeProbe(undefined, failed).code).toBe("probe_failed");
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
