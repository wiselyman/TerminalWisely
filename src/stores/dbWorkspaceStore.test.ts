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
    expect(id).toBe("c1");
    expect(useDbWorkspaceStore.getState().workspaces).toEqual([
      {
        id: "c1",
        connectionId: "c1",
        connectionName: "Saad2",
        database: "saad2",
        engine: "postgres",
        title: "Saad2",
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
    expect(other).toBe(id);
    expect(useDbWorkspaceStore.getState().workspaces).toHaveLength(1);
    expect(useDbWorkspaceStore.getState().workspaces[0].database).toBe("app");
    expect(useDbWorkspaceStore.getState().workspaces[0].title).toBe("Saad2");
    expect(useDbWorkspaceStore.getState().tabsByWorkspace[id]).toHaveLength(2);

    const mysql = openWorkspace({
      connectionId: "c2",
      connectionName: "Shop",
      database: "shop",
      engine: "mysql",
    });
    expect(mysql).toBe("c2");
    expect(useDbWorkspaceStore.getState().workspaces.map((w) => w.title)).toEqual([
      "Saad2",
      "Shop",
    ]);

    closeWorkspace(id);
    expect(useDbWorkspaceStore.getState().workspaces.map((w) => w.id)).toEqual([mysql]);
    expect(useDbWorkspaceStore.getState().tabsByWorkspace[id]).toBeUndefined();
    expect(useDbWorkspaceStore.getState().activeId).toBe(mysql);
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
    expect(titles).toEqual(["Prod", "Staging"]);
    expect(useDbWorkspaceStore.getState().workspaces.map((w) => w.engine)).toEqual([
      "postgres",
      "mysql",
    ]);
    openWorkspace({
      connectionId: "p",
      connectionName: "Saad2",
      database: "a",
      engine: "postgres",
    });
    openWorkspace({
      connectionId: "m",
      connectionName: "Saad2",
      database: "b",
      engine: "mysql",
    });
    expect(useDbWorkspaceStore.getState().workspaces.map((w) => w.title)).toEqual([
      "Prod",
      "Staging",
      "Saad2 · postgres",
      "Saad2 · mysql",
    ]);
  });
});
