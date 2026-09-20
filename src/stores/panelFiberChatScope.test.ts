import { describe, expect, it } from "vitest";
import {
  aiChatScopeKey,
  clusterIdFromK8sSyntheticSessionId,
  k8sSyntheticSessionId,
  panelFiberChatScopeKey,
} from "./aiEngineerStore";

describe("panelFiberChatScopeKey", () => {
  it("matches linux server scope", () => {
    expect(panelFiberChatScopeKey("sess-a", "srv-a")).toBe(
      aiChatScopeKey("sess-a", "srv-a"),
    );
  });

  it("maps k8s synthetic session id to cluster scope (not session:)", () => {
    const clusterId = "kube:e2e-context";
    const sessionId = k8sSyntheticSessionId(clusterId);
    expect(clusterIdFromK8sSyntheticSessionId(sessionId)).toBe(clusterId);
    expect(panelFiberChatScopeKey(sessionId)).toBe(
      aiChatScopeKey(sessionId, null, clusterId),
    );
    expect(panelFiberChatScopeKey(sessionId)).toMatch(/^cluster:/);
  });
});
