import { describe, expect, it } from "vitest";
import { markRunningToolsStopped } from "./toolRunLifecycle";

describe("markRunningToolsStopped", () => {
  it("cancels running tools and leaves others", () => {
    const now = 1_700_000_000_000;
    const out = markRunningToolsStopped(
      [
        { kind: "user", content: "hi" },
        {
          kind: "tool",
          name: "terminal_exec",
          status: "running",
          output: "sudo: a password is required",
          startedAt: now - 10_000,
        },
        {
          kind: "tool",
          name: "terminal_exec",
          status: "done",
          output: "ok",
        },
      ],
      { now },
    );
    expect(out[1]).toMatchObject({
      status: "cancelled",
      finishedAt: now,
    });
    expect(String((out[1] as { output?: string }).output)).toContain(
      "[stopped by user]",
    );
    expect(out[2]).toMatchObject({ status: "done" });
  });

  it("is a no-op when nothing is running", () => {
    const msgs = [{ kind: "tool", status: "done" as const }];
    expect(markRunningToolsStopped(msgs)).toBe(msgs);
  });
});
