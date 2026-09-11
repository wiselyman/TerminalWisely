import { describe, expect, it } from "vitest";
import {
  looksLikeInteractivePasswordPrompt,
  looksLikeSudoPasswordNeeded,
} from "./sudoOutput";

describe("looksLikeSudoPasswordNeeded", () => {
  it("detects Chinese sudo password prompt", () => {
    expect(looksLikeSudoPasswordNeeded("sudo: 需要密码")).toBe(true);
  });

  it("detects English password required", () => {
    expect(looksLikeSudoPasswordNeeded("sudo: a password is required")).toBe(
      true,
    );
  });

  it("ignores unrelated output", () => {
    expect(looksLikeSudoPasswordNeeded("gdb: command not found")).toBe(false);
  });
});

describe("looksLikeInteractivePasswordPrompt", () => {
  it("detects bare Chinese password prompt (su / login)", () => {
    expect(
      looksLikeInteractivePasswordPrompt(
        "su - wangyunfei -c 'x'\n密码：",
      ),
    ).toBe(true);
  });

  it("detects English Password: last line", () => {
    expect(looksLikeInteractivePasswordPrompt("Password:")).toBe(true);
  });

  it("detects user password prompt", () => {
    expect(
      looksLikeInteractivePasswordPrompt("[sudo] password for alice:"),
    ).toBe(true);
  });

  it("ignores logs that only mention password", () => {
    expect(
      looksLikeInteractivePasswordPrompt("updated password policy ok"),
    ).toBe(false);
  });
});
