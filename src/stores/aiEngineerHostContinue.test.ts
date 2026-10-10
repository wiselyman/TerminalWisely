import { beforeEach, describe, expect, it } from "vitest";
import {
  aiChatScopeKey,
  __testGetActiveAiRun,
  __testSetActiveAiRun,
  useAiEngineerStore,
} from "./aiEngineerStore";
import {
  captureHostWorkspace,
  forgetAiFiber,
  rememberAiFiber,
  restoreHostWorkspace,
} from "./hostWorkspaceMemory";

/**
 * Soft-hide / host switch must keep a mid-run AI alive in the background.
 * Abort only on explicit STOP or same-host thread switch — never on host tab change.
 */
describe("AI host soft-hide continue", () => {
  beforeEach(() => {
    const scopeA = aiChatScopeKey("host-a", "srv-a");
    forgetAiFiber("host-a");
    forgetAiFiber("host-b");
    __testSetActiveAiRun(null, null, null);
    __testSetActiveAiRun(scopeA, "t1", "run-a");
    useAiEngineerStore.setState({
      open: true,
      sessionId: "host-a",
      serverId: "srv-a",
      chatScope: scopeA,
      engineerMode: "linux",
      busy: true,
      modelPhase: "streaming",
      messages: [
        {
          id: "m1",
          kind: "assistant",
          content: "streaming…",
          streaming: true,
        },
      ],
      activeThreadId: "t1",
      threadsByScope: {
        [scopeA]: {
          activeThreadId: "t1",
          threads: [
            {
              id: "t1",
              title: "Chat",
              messages: [
                {
                  id: "m1",
                  kind: "assistant",
                  content: "streaming…",
                  streaming: true,
                },
              ],
              updatedAt: Date.now(),
              securityMode: "ask",
              interactionMode: "agent",
            },
          ],
        },
      },
      pendingAsk: null,
      pendingApproval: null,
      sidecar: null,
    });
    rememberAiFiber("host-a");
  });

  it("soft-hide open:false keeps busy (does not abort)", () => {
    useAiEngineerStore.setState({ open: false });
    const s = useAiEngineerStore.getState();
    expect(s.open).toBe(false);
    expect(s.busy).toBe(true);
    expect(s.modelPhase).toBe("streaming");
    expect(s.sessionId).toBe("host-a");
    expect(s.chatScope).toBe(aiChatScopeKey("host-a", "srv-a"));
  });

  it("same-session restore only sets open:true without bind abort", () => {
    captureHostWorkspace("host-a");
    restoreHostWorkspace("host-b");
    expect(useAiEngineerStore.getState().open).toBe(false);
    expect(useAiEngineerStore.getState().busy).toBe(true);

    restoreHostWorkspace("host-a", { serverId: "srv-a", label: "A" });
    const s = useAiEngineerStore.getState();
    expect(s.open).toBe(true);
    expect(s.busy).toBe(true);
    expect(s.modelPhase).toBe("streaming");
    expect(s.sessionId).toBe("host-a");
  });

  it("bindContext same scope while busy does not clear busy", () => {
    useAiEngineerStore.getState().bindContext("host-a", "srv-a");
    const s = useAiEngineerStore.getState();
    expect(s.busy).toBe(true);
    expect(s.sessionId).toBe("host-a");
  });

  it("binding AI to a different host parks UI but keeps the prior run", () => {
    const scopeA = aiChatScopeKey("host-a", "srv-a");
    useAiEngineerStore.getState().bindManagedEntity(
      {
        kind: "server",
        id: "srv-b",
        label: "B",
        sessionId: "host-b",
        serverId: "srv-b",
      },
      { open: true },
    );
    const onB = useAiEngineerStore.getState();
    expect(onB.sessionId).toBe("host-b");
    // B is not the running host — local busy indicator off.
    expect(onB.busy).toBe(false);
    expect(onB.modelPhase).toBe("idle");
    // A's transcript must survive; run marker must stay for background continue.
    expect(
      onB.threadsByScope[scopeA]?.threads[0]?.messages[0],
    ).toMatchObject({ content: "streaming…", streaming: true });
    expect(__testGetActiveAiRun()).toEqual({
      scope: scopeA,
      threadId: "t1",
      runId: "run-a",
    });

    // Return to A — busy restores from the still-active background run.
    useAiEngineerStore.getState().bindManagedEntity(
      {
        kind: "server",
        id: "srv-a",
        label: "A",
        sessionId: "host-a",
        serverId: "srv-a",
      },
      { open: true },
    );
    const back = useAiEngineerStore.getState();
    expect(back.sessionId).toBe("host-a");
    expect(back.busy).toBe(true);
    expect(back.modelPhase).not.toBe("idle");
  });

  it("stream commits land in threadsByScope for parked fibers", () => {
    const scope = aiChatScopeKey("host-a", "srv-a");
    const nextMessages = [
      {
        id: "m1",
        kind: "assistant" as const,
        content: "more tokens",
        streaming: true,
      },
    ];
    // Mimic replaceMessagesIfSameThread: live messages + scope commit.
    const threadsByScope = {
      ...useAiEngineerStore.getState().threadsByScope,
      [scope]: {
        activeThreadId: "t1",
        threads: [
          {
            ...useAiEngineerStore.getState().threadsByScope[scope]!.threads[0],
            messages: nextMessages,
            updatedAt: Date.now(),
          },
        ],
      },
    };
    useAiEngineerStore.setState({ messages: nextMessages, threadsByScope });
    useAiEngineerStore.setState({ open: false }); // park
    const parked =
      useAiEngineerStore.getState().threadsByScope[scope]?.threads[0]?.messages;
    expect(parked?.[0]).toMatchObject({ content: "more tokens" });
  });
});
