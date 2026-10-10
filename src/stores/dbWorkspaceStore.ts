import { create } from "zustand";
import {
  type WorkbenchTab,
  workspaceId,
} from "../components/db/workbenchModel";

export type DbWorkspace = {
  id: string;
  connectionId: string;
  connectionName: string;
  database: string;
  /** Engine id for chrome tab brand mark (postgres / mysql / …). */
  engine: string;
  title: string;
};

type OpenArgs = {
  connectionId: string;
  connectionName: string;
  database: string;
  engine: string;
};

function titleFor(
  workspaces: DbWorkspace[],
  connectionId: string,
  connectionName: string,
  engine: string,
): string {
  const clash = workspaces.some(
    (item) => item.connectionName === connectionName && item.connectionId !== connectionId,
  );
  return clash ? `${connectionName} · ${engine}` : connectionName;
}

function retitleAll(workspaces: DbWorkspace[]): DbWorkspace[] {
  return workspaces.map((item) => ({
    ...item,
    title: titleFor(workspaces, item.connectionId, item.connectionName, item.engine),
  }));
}

interface DbWorkspaceState {
  workspaces: DbWorkspace[];
  activeId: string | null;
  tabsByWorkspace: Record<string, WorkbenchTab[]>;
  activeTabByWorkspace: Record<string, string | null>;
  openWorkspace: (args: OpenArgs) => string;
  closeWorkspace: (id: string) => void;
  setActive: (id: string | null) => void;
  upsertTab: (workspaceId: string, tab: WorkbenchTab) => void;
  replaceTabs: (workspaceId: string, tabs: WorkbenchTab[]) => void;
  setActiveTab: (workspaceId: string, tabId: string | null) => void;
  closeTab: (workspaceId: string, tabId: string) => void;
  patchTab: (workspaceId: string, tabId: string, patch: Partial<WorkbenchTab>) => void;
  clearConnection: (connectionId: string) => void;
}

export const useDbWorkspaceStore = create<DbWorkspaceState>((set, get) => ({
  workspaces: [],
  activeId: null,
  tabsByWorkspace: {},
  activeTabByWorkspace: {},

  openWorkspace: ({ connectionId, connectionName, database, engine }) => {
    const id = workspaceId(connectionId);
    const existing = get().workspaces.find((item) => item.id === id);
    if (existing) {
      const workspaces = retitleAll(
        get().workspaces.map((item) =>
          item.id === id
            ? { ...item, connectionName, database, engine }
            : item,
        ),
      );
      set({ activeId: id, workspaces });
      return id;
    }
    const next: DbWorkspace = {
      id,
      connectionId,
      connectionName,
      database,
      engine,
      title: connectionName,
    };
    const workspaces = retitleAll([...get().workspaces, next]);
    set({
      workspaces,
      activeId: id,
      tabsByWorkspace: { ...get().tabsByWorkspace, [id]: get().tabsByWorkspace[id] ?? [] },
      activeTabByWorkspace: {
        ...get().activeTabByWorkspace,
        [id]: get().activeTabByWorkspace[id] ?? null,
      },
    });
    return id;
  },

  closeWorkspace: (id) => {
    const workspaces = retitleAll(get().workspaces.filter((item) => item.id !== id));
    const tabsByWorkspace = { ...get().tabsByWorkspace };
    const activeTabByWorkspace = { ...get().activeTabByWorkspace };
    delete tabsByWorkspace[id];
    delete activeTabByWorkspace[id];
    const activeId =
      get().activeId === id
        ? workspaces.length > 0
          ? workspaces[workspaces.length - 1].id
          : null
        : get().activeId;
    set({ workspaces, activeId, tabsByWorkspace, activeTabByWorkspace });
  },

  setActive: (id) => set({ activeId: id }),

  upsertTab: (wsId, tab) => {
    const current = get().tabsByWorkspace[wsId] ?? [];
    const index = current.findIndex((item) => item.id === tab.id);
    const tabs =
      index >= 0
        ? current.map((item, i) => (i === index ? { ...item, ...tab } : item))
        : [...current, tab];
    set({
      tabsByWorkspace: { ...get().tabsByWorkspace, [wsId]: tabs },
    });
  },

  replaceTabs: (wsId, tabs) => {
    set({
      tabsByWorkspace: { ...get().tabsByWorkspace, [wsId]: tabs },
    });
  },

  setActiveTab: (wsId, tabId) => {
    set({
      activeTabByWorkspace: { ...get().activeTabByWorkspace, [wsId]: tabId },
    });
  },

  closeTab: (wsId, tabId) => {
    const current = get().tabsByWorkspace[wsId] ?? [];
    const tabs = current.filter((item) => item.id !== tabId);
    let active = get().activeTabByWorkspace[wsId] ?? null;
    if (active === tabId) {
      active = tabs.length > 0 ? tabs[tabs.length - 1].id : null;
    }
    set({
      tabsByWorkspace: { ...get().tabsByWorkspace, [wsId]: tabs },
      activeTabByWorkspace: { ...get().activeTabByWorkspace, [wsId]: active },
    });
  },

  patchTab: (wsId, tabId, patch) => {
    const current = get().tabsByWorkspace[wsId] ?? [];
    set({
      tabsByWorkspace: {
        ...get().tabsByWorkspace,
        [wsId]: current.map((item) => (item.id === tabId ? { ...item, ...patch } : item)),
      },
    });
  },

  clearConnection: (connectionId) => {
    const closing = get().workspaces.filter((item) => item.connectionId === connectionId);
    if (closing.length === 0) return;
    const workspaces = retitleAll(
      get().workspaces.filter((item) => item.connectionId !== connectionId),
    );
    const tabsByWorkspace = { ...get().tabsByWorkspace };
    const activeTabByWorkspace = { ...get().activeTabByWorkspace };
    for (const item of closing) {
      delete tabsByWorkspace[item.id];
      delete activeTabByWorkspace[item.id];
    }
    const activeId =
      get().activeId && closing.some((item) => item.id === get().activeId)
        ? workspaces.length > 0
          ? workspaces[workspaces.length - 1].id
          : null
        : get().activeId;
    set({ workspaces, activeId, tabsByWorkspace, activeTabByWorkspace });
  },
}));
