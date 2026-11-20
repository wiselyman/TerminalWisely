import { afterEach, describe, expect, it, vi } from "vitest";
import { queueLocalTerminalCommand, registerLocalTerminalCommandSink } from "./localTerminalCommandBridge";

afterEach(() => {
  registerLocalTerminalCommandSink(() => {} )();
});

describe("local terminal command bridge", () => {
  it("flushes commands queued before the local terminal starts", () => {
    const sink = vi.fn();
    queueLocalTerminalCommand("echo ready\r");
    const unregister = registerLocalTerminalCommandSink(sink);
    expect(sink).toHaveBeenCalledExactlyOnceWith("echo ready\r");
    unregister();
  });

  it("sends new commands to the active terminal", () => {
    const sink = vi.fn();
    registerLocalTerminalCommandSink(sink);
    queueLocalTerminalCommand("pwd\r");
    expect(sink).toHaveBeenCalledExactlyOnceWith("pwd\r");
  });
});
