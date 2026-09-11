import { describe, expect, it } from "vitest";
import {
  formatElapsedMs,
  isAwaitingApprovedExec,
  resolveBusyPhase,
  resolveExecLiveStatus,
  shouldShowChatBusyLine,
} from "./runBusyPhase";

describe("resolveBusyPhase", () => {
  it("idle when not busy", () => {
    expect(
      resolveBusyPhase({
        busy: false,
        pendingApproval: false,
        tools: [{ kind: "tool", name: "terminal_exec", status: "running" }],
      }),
    ).toEqual({ kind: "idle" });
  });

  it("approval beats host exec", () => {
    expect(
      resolveBusyPhase({
        busy: true,
        pendingApproval: true,
        tools: [
          {
            kind: "tool",
            name: "terminal_exec",
            status: "running",
            intent: "download",
          },
        ],
      }),
    ).toEqual({ kind: "approval" });
  });

  it("sudo prompt beats awaiting exec", () => {
    expect(
      resolveBusyPhase({
        busy: true,
        pendingApproval: false,
        sudoPromptOpen: true,
        awaitingApprovedExec: true,
        tools: [],
      }),
    ).toEqual({ kind: "sudo" });
  });

  it("awaiting exec after approve with no running tool", () => {
    expect(
      resolveBusyPhase({
        busy: true,
        pendingApproval: false,
        awaitingApprovedExec: true,
        tools: [],
      }),
    ).toEqual({ kind: "awaiting_exec" });
  });

  it("shows host exec title from intent", () => {
    expect(
      resolveBusyPhase({
        busy: true,
        pendingApproval: false,
        tools: [
          {
            kind: "tool",
            name: "terminal_exec",
            status: "running",
            intent: "拉取模型权重",
          },
        ],
      }),
    ).toEqual({ kind: "host_exec", title: "拉取模型权重" });
  });

  it("falls back to thinking", () => {
    expect(
      resolveBusyPhase({
        busy: true,
        pendingApproval: false,
        modelPhase: "thinking",
        tools: [],
      }),
    ).toEqual({ kind: "thinking", streamingThought: true });
  });
});

describe("isAwaitingApprovedExec", () => {
  it("true when approved and no later host tool", () => {
    expect(
      isAwaitingApprovedExec([
        { kind: "approval", decision: "approved" },
      ]),
    ).toBe(true);
  });

  it("false once a host tool starts after approve", () => {
    expect(
      isAwaitingApprovedExec([
        { kind: "approval", decision: "approved" },
        { kind: "tool", name: "terminal_exec", status: "running" },
      ]),
    ).toBe(false);
  });
});

describe("resolveExecLiveStatus", () => {
  it("silent vs live while running", () => {
    expect(
      resolveExecLiveStatus({ status: "running", hasOutput: false }),
    ).toBe("running_silent");
    expect(
      resolveExecLiveStatus({ status: "running", hasOutput: true }),
    ).toBe("running_live");
  });
});

describe("formatElapsedMs", () => {
  it("formats seconds and minutes", () => {
    expect(formatElapsedMs(4500)).toBe("4s");
    expect(formatElapsedMs(65_000)).toBe("1m 5s");
  });
});

describe("shouldShowChatBusyLine", () => {
  it("hides during host exec (card owns the dots)", () => {
    expect(
      shouldShowChatBusyLine({
        busy: true,
        busyPhaseKind: "host_exec",
        hasVisibleStreamingAssistant: false,
      }),
    ).toBe(false);
  });

  it("shows thinking after tools with no visible stream", () => {
    expect(
      shouldShowChatBusyLine({
        busy: true,
        busyPhaseKind: "thinking",
        hasVisibleStreamingAssistant: false,
      }),
    ).toBe(true);
  });

  it("hides once assistant tokens are visible", () => {
    expect(
      shouldShowChatBusyLine({
        busy: true,
        busyPhaseKind: "thinking",
        hasVisibleStreamingAssistant: true,
      }),
    ).toBe(false);
  });
});
