import { beforeEach, describe, expect, it } from "vitest";
import {
  aiChatScopeKey,
  bindKindForOutgoingSend,
  dbSyntheticSessionId,
  useAiEngineerStore,
} from "./aiEngineerStore";

describe("AI database bind", () => {
  beforeEach(() => {
    useAiEngineerStore.setState({
      open: false,
      engineerMode: "linux",
      sessionId: null,
      chatScope: "session:",
      dbConnectionId: null,
      dbDatabase: null,
      dbSchema: null,
      dbSshSessionId: null,
    });
  });

  it("keeps database mode on send instead of rebinding to linux", () => {
    expect(
      bindKindForOutgoingSend(
        {
          engineerMode: "db",
          dbConnectionId: "conn-saad2",
          clusterId: null,
        },
        { sessionId: dbSyntheticSessionId("conn-saad2") },
      ),
    ).toEqual({ kind: "db" });
    expect(
      bindKindForOutgoingSend(
        {
          engineerMode: "linux",
          dbConnectionId: null,
          clusterId: null,
        },
        { sessionId: "ssh-1", serverId: "srv-1" },
      ),
    ).toEqual({ kind: "linux", sessionId: "ssh-1", serverId: "srv-1" });
  });

  it("scopes chat to the connection, with schema as context only", () => {
    useAiEngineerStore.getState().bindDbContext({
      id: "conn-saad2",
      name: "Saad2",
      engine: "postgres",
      revision: 1,
      sshSessionId: null,
      database: "asbj",
      schema: "public",
      selectedSql: null,
    });
    const state = useAiEngineerStore.getState();
    const sessionId = dbSyntheticSessionId("conn-saad2");
    expect(state.engineerMode).toBe("db");
    expect(state.sessionId).toBe(sessionId);
    expect(state.chatScope).toBe(aiChatScopeKey(sessionId, null, null));
    expect(state.dbConnectionId).toBe("conn-saad2");
    expect(state.dbDatabase).toBe("asbj");
    expect(state.dbSchema).toBe("public");
    expect(state.dbSshSessionId).toBeNull();

    // Switching schema must not create a new chat session.
    useAiEngineerStore.getState().bindDbContext({
      id: "conn-saad2",
      name: "Saad2",
      engine: "postgres",
      revision: 1,
      sshSessionId: null,
      database: "asbj",
      schema: "analytics",
      selectedSql: null,
    });
    const again = useAiEngineerStore.getState();
    expect(again.sessionId).toBe(sessionId);
    expect(again.chatScope).toBe(state.chatScope);
    expect(again.dbSchema).toBe("analytics");

    useAiEngineerStore.getState().bindDbContext({
      id: "conn-saad2",
      name: "Saad2",
      engine: "postgres",
      revision: 1,
      sshSessionId: null,
      database: "app",
      schema: "public",
      selectedSql: null,
    });
    const sameService = useAiEngineerStore.getState();
    expect(sameService.sessionId).toBe(sessionId);
    expect(sameService.chatScope).toBe(state.chatScope);
    expect(sameService.dbDatabase).toBe("app");

    useAiEngineerStore.getState().bindDbContext({
      id: "conn-shop",
      name: "Shop",
      engine: "mysql",
      revision: 1,
      sshSessionId: null,
      database: "shop",
      schema: null,
      selectedSql: null,
    });
    const otherService = useAiEngineerStore.getState();
    expect(otherService.sessionId).toBe(dbSyntheticSessionId("conn-shop"));
    expect(otherService.chatScope).not.toBe(state.chatScope);
    expect(otherService.dbConnectionId).toBe("conn-shop");
  });
});
