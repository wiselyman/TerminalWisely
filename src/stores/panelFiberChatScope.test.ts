import { describe, expect, it } from "vitest";
import { aiChatScopeKey, bindKindForOutgoingSend, panelFiberChatScopeKey } from "./aiEngineerStore";

describe("panelFiberChatScopeKey", () => {
  it("matches Linux server scope", () => {
    expect(panelFiberChatScopeKey("sess-a", "srv-a")).toBe(aiChatScopeKey("sess-a", "srv-a"));
  });
});

describe("bindKindForOutgoingSend", () => {
  it("routes Home and SSH chats through the Linux agent", () => {
    expect(bindKindForOutgoingSend({ sessionId: "ssh-1", serverId: "host-1" })).toEqual({
      kind: "linux",
      sessionId: "ssh-1",
      serverId: "host-1",
    });
  });
});
