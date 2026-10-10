import { beforeEach, describe, expect, it } from "vitest";
import { freshObjectTab, freshQueryTab } from "../components/db/workbenchModel";
import { useDbWorkspaceStore } from "./dbWorkspaceStore";

describe("dbWorkspaceStore", () => {
  beforeEach(() => {
    useDbWorkspaceStore.setState({
      workspaces: [],
      activeId: null,
      tabsByWorkspace: {},
      activeTabByWorkspace: {},
    });
  });

  it("opens a database workspace after Home and keeps per-workspace tabs", () => {
    const { openWorkspace, setActiveTab, closeWorkspace, upsertTab } =
      useDbWorkspaceStore.getState();
    const id = openWorkspace({
      connectionId: "c1",
      connectionName: "Saad2",
      database: "saad2",
      engine: "postgres",
    });
    expect(id).toBe("c1::saad2");
    expect(useDbWorkspaceStore.getState().workspaces).toEqual([
      {
        id: "c1::saad2",
        connectionId: "c1",
        connectionName: "Saad2",
        database: "saad2",
        engine: "postgres",
        title: "saad2",
      },
    ]);
    expect(useDbWorkspaceStore.getState().activeId).toBe(id);

    const again = openWorkspace({
      connectionId: "c1",
      connectionName: "Saad2",
      database: "saad2",
      engine: "postgres",
    });
    expect(again).toBe(id);
    expect(useDbWorkspaceStore.getState().workspaces).toHaveLength(1);

    const table = freshObjectTab("t1", "saad2", {
      kind: "table",
      schema: "public",
      name: "firmware",
    });
    upsertTab(id, table);
    setActiveTab(id, table.id);
    expect(useDbWorkspaceStore.getState().tabsByWorkspace[id]?.[0].title).toBe("firmware");
    expect(useDbWorkspaceStore.getState().activeTabByWorkspace[id]).toBe("t1");

    const sql = freshQueryTab("q1", "SQL 1");
    upsertTab(id, sql);
    expect(useDbWorkspaceStore.getState().tabsByWorkspace[id]).toHaveLength(2);

    const other = openWorkspace({
      connectionId: "c1",
      connectionName: "Saad2",
      database: "app",
      engine: "postgres",
    });
    expect(useDbWorkspaceStore.getState().activeId).toBe(other);
    expect(useDbWorkspaceStore.getState().tabsByWorkspace[other] ?? []).toEqual([]);

    closeWorkspace(id);
    expect(useDbWorkspaceStore.getState().workspaces.map((w) => w.id)).toEqual([other]);
    expect(useDbWorkspaceStore.getState().tabsByWorkspace[id]).toBeUndefined();
    expect(useDbWorkspaceStore.getState().activeId).toBe(other);
  });

  it("disambiguates titles when two connections share a database name", () => {
    const { openWorkspace } = useDbWorkspaceStore.getState();
    openWorkspace({
      connectionId: "a",
      connectionName: "Prod",
      database: "app",
      engine: "postgres",
    });
    openWorkspace({
      connectionId: "b",
      connectionName: "Staging",
      database: "app",
      engine: "mysql",
    });
    const titles = useDbWorkspaceStore.getState().workspaces.map((w) => w.title);
    expect(titles).toEqual(["app · Prod", "app · Staging"]);
    expect(useDbWorkspaceStore.getState().workspaces.map((w) => w.engine)).toEqual([
      "postgres",
      "mysql",
    ]);
  });
});
