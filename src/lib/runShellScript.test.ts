import { describe, expect, it } from "vitest";
import { buildRunShellScriptCommand, isShellScriptPath } from "./runShellScript";

describe("shell script context action", () => {
  it("recognizes shell scripts without caring about case", () => {
    expect(isShellScriptPath("/tmp/run.sh")).toBe(true);
    expect(isShellScriptPath("/tmp/run.SH")).toBe(true);
    expect(isShellScriptPath("/tmp/run.sh.txt")).toBe(false);
  });

  it("runs a safely quoted script from its containing directory", () => {
    expect(buildRunShellScriptCommand("/tmp/a b/run's.sh")).toBe(
      "cd -- '/tmp/a b' && bash -- './run'\\''s.sh'\r",
    );
  });
});
