import { describe, expect, it } from "vitest";
import { LOCAL_CHAT_SESSION, terminalExecCommand } from "./localTarget";

describe("terminalExecCommand", () => {
  it("sends the home session to local capture", () => {
    expect(terminalExecCommand(LOCAL_CHAT_SESSION)).toBe("ai_local_exec");
    expect(terminalExecCommand("ssh-1", "local")).toBe("ai_local_exec");
  });

  it("keeps remote sessions on the existing SSH exec", () => {
    expect(terminalExecCommand("ssh-1")).toBe("ai_terminal_exec");
    expect(terminalExecCommand("ssh-1", "ssh")).toBe("ai_terminal_exec");
  });
});
