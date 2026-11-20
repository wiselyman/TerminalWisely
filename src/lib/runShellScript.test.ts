import { describe, expect, it } from "vitest";
import { buildRunScriptCommand, isRunnableScriptPath } from "./runShellScript";

describe("Files script run decisions", () => {
  it("keeps shell scripts runnable without a shebang", () => {
    expect(buildRunScriptCommand("/tmp/run.sh", "-rw-------", null, "unix"))
      .toBe("cd -- '/tmp' && 'bash' '--' './run.sh'\r");
  });

  it("runs a Python file without a shebang with the platform Python launcher", () => {
    expect(buildRunScriptCommand("/tmp/run me.py", "-rw-------", null, "unix"))
      .toBe("cd -- '/tmp' && 'python3' './run me.py'\r");
    expect(buildRunScriptCommand("C:\\work\\run.py", null, null, "powershell"))
      .toBe("Set-Location -LiteralPath 'C:\\work'; & 'py' '-3' '.\\run.py'\r");
    expect(buildRunScriptCommand("C:\\run.py", null, null, "powershell"))
      .toBe("Set-Location -LiteralPath 'C:\\'; & 'py' '-3' '.\\run.py'\r");
  });

  it("uses the shebang interpreter for a script with an unfamiliar suffix", () => {
    expect(buildRunScriptCommand("/opt/jobs/build.task", "-rw-------", "#!/usr/bin/env node", "unix"))
      .toBe("cd -- '/opt/jobs' && '/usr/bin/env' 'node' './build.task'\r");
  });

  it("runs executable files and quotes paths containing shell punctuation", () => {
    expect(buildRunScriptCommand("/tmp/a b/run's", "-rwxr-xr-x", null, "unix"))
      .toBe("cd -- '/tmp/a b' && './run'\\''s'\r");
    expect(buildRunScriptCommand("C:\\work\\a b.ps1", "-rw-------", null, "powershell"))
      .toBe("Set-Location -LiteralPath 'C:\\work'; & '.\\a b.ps1'\r");
  });

  it("does not offer execution for ordinary text files", () => {
    expect(isRunnableScriptPath("/tmp/notes.conf", "-rw-------", null)).toBe(false);
    expect(buildRunScriptCommand("/tmp/notes.conf", "-rw-------", null, "unix")).toBeNull();
    expect(isRunnableScriptPath("/tmp/job.task", "-rw-------", "#!/bin/sh")).toBe(true);
  });
});
