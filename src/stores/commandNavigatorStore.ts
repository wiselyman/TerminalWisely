import { invoke } from "@tauri-apps/api/core";
import { create } from "zustand";
import i18n from "../i18n";
import { BUILTIN_COMMANDS } from "../content/defaultCommands";
import {
  buildParamsFromTemplate,
  filterCommands,
} from "../lib/commandTemplate";
import type {
  CommandParam,
  CommandShortcutScope,
  CommandSubcategory,
  CommandTemplate,
  DistroFamily,
} from "../types";
import { useFindStore } from "./findStore";
import { useHostStatsStore } from "./hostStatsStore";
import { useSessionStore } from "./sessionStore";
import { useTaskManagerStore } from "./taskManagerStore";
import { useToastStore } from "./toastStore";
import {
  readWorkspacePanelWidth,
  setWorkspacePanelWidth,
  subscribeWorkspacePanelWidth,
} from "../lib/workspacePanelWidth";

const CUSTOM_KEY = "terminal-wisely.command-nav-custom";
const HIDDEN_KEY = "terminal-wisely.command-nav-hidden";

export const TERMINAL_FOCUS_EVENT = "terminal-wisely-focus";

function createCommandId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function loadCustomCommands(): CommandTemplate[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item): CommandTemplate | null => {
        if (!item || typeof item !== "object") return null;
        const record = item as Record<string, unknown>;
        const template = typeof record.template === "string" ? record.template : "";
        if (!template.trim()) return null;
        const title =
          typeof record.title === "string" && record.title.trim()
            ? record.title.trim()
            : template.slice(0, 40);
        const subcategory =
          typeof record.subcategory === "string"
            ? (record.subcategory as CommandSubcategory)
            : "kernel";
        const distroFamilies = Array.isArray(record.distroFamilies)
          ? (record.distroFamilies as DistroFamily[])
          : (["universal"] as DistroFamily[]);
        const params = Array.isArray(record.params)
          ? (record.params as CommandParam[])
          : buildParamsFromTemplate(template);
        return {
          id:
            typeof record.id === "string" && record.id
              ? record.id
              : createCommandId(),
          title,
          description:
            typeof record.description === "string" ? record.description : undefined,
          subcategory,
          distroFamilies,
          template,
          params,
          scope: (record.scope as CommandShortcutScope) ?? "all",
          server_id:
            typeof record.server_id === "string" ? record.server_id : null,
          builtin: false,
        };
      })
      .filter((item): item is CommandTemplate => item !== null);
  } catch {
    return [];
  }
}

function persistCustomCommands(commands: CommandTemplate[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(commands));
}

function loadHiddenBuiltinIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is string => typeof id === "string"));
  } catch {
    return new Set();
  }
}

function persistHiddenBuiltinIds(ids: Set<string>) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify([...ids]));
}

function closeOtherWorkspacePanels() {
  useTaskManagerStore.getState().close();
  useFindStore.getState().close();
  useHostStatsStore.getState().close();
}

interface CommandNavigatorState {
  open: boolean;
  width: number;
  query: string;
  subcategory: string;
  customCommands: CommandTemplate[];
  hiddenBuiltinIds: Set<string>;
  activeSessionId: string | null;
  focusNonce: number;
  runTarget: CommandTemplate | null;
  editorTarget: CommandTemplate | null;
  editorOpen: boolean;
  setWidth: (width: number) => void;
  setQuery: (query: string) => void;
  setSubcategory: (subcategory: string) => void;
  openPanel: (sessionId: string) => void;
  toggleOpen: (sessionId: string) => void;
  close: () => void;
  openRunDialog: (command: CommandTemplate) => void;
  closeRunDialog: () => void;
  openEditor: (command?: CommandTemplate) => void;
  closeEditor: () => void;
  saveCustomCommand: (command: CommandTemplate) => void;
  deleteCustomCommand: (id: string) => void;
  hideBuiltinCommand: (id: string) => void;
  listCommands: (options: {
    osId: string | null | undefined;
    tabKind: "local" | "ssh";
    serverId: string;
  }) => CommandTemplate[];
  insertCommand: (sessionId: string, command: string) => Promise<void>;
}

/** Ctrl+U clears the current readline line before inserting a panel command. */
const CLEAR_READLINE_LINE = "\x15";

export const useCommandNavigatorStore = create<CommandNavigatorState>(
  (set, get) => ({
    open: false,
    width: readWorkspacePanelWidth(),
    query: "",
    subcategory: "all",
    customCommands: loadCustomCommands(),
    hiddenBuiltinIds: loadHiddenBuiltinIds(),
    activeSessionId: null,
    focusNonce: 0,
    runTarget: null,
    editorTarget: null,
    editorOpen: false,

    setWidth: (width) => {
      const next = setWorkspacePanelWidth(width);
      set({ width: next });
    },

    setQuery: (query) => set({ query }),

    setSubcategory: (subcategory) => set({ subcategory }),

    openPanel: (sessionId) => {
      closeOtherWorkspacePanels();
      set((state) => ({
        open: true,
        activeSessionId: sessionId,
        focusNonce: state.focusNonce + 1,
      }));
    },

    toggleOpen: (sessionId) => {
      const { open } = get();
      if (open) {
        get().close();
        return;
      }
      get().openPanel(sessionId);
    },

    close: () =>
      set({
        open: false,
        runTarget: null,
        editorOpen: false,
        editorTarget: null,
      }),

    openRunDialog: (command) => set({ runTarget: command }),

    closeRunDialog: () => set({ runTarget: null }),

    openEditor: (command) =>
      set({
        editorOpen: true,
        editorTarget: command ?? null,
      }),

    closeEditor: () => set({ editorOpen: false, editorTarget: null }),

    saveCustomCommand: (command) => {
      const custom = [...get().customCommands];
      const index = custom.findIndex((item) => item.id === command.id);
      const next = { ...command, builtin: false };
      if (index >= 0) {
        custom[index] = next;
      } else {
        custom.push(next);
      }
      persistCustomCommands(custom);
      set({ customCommands: custom, editorOpen: false, editorTarget: null });
    },

    deleteCustomCommand: (id) => {
      const custom = get().customCommands.filter((item) => item.id !== id);
      persistCustomCommands(custom);
      set({ customCommands: custom });
    },

    hideBuiltinCommand: (id) => {
      const hidden = new Set(get().hiddenBuiltinIds);
      hidden.add(id);
      persistHiddenBuiltinIds(hidden);
      set({ hiddenBuiltinIds: hidden });
    },

    listCommands: ({ osId, tabKind, serverId }) => {
      const state = get();
      const all = [...BUILTIN_COMMANDS, ...state.customCommands];
      return filterCommands(all, {
        query: state.query,
        subcategory: state.subcategory,
        osId,
        hiddenBuiltinIds: state.hiddenBuiltinIds,
        tabKind,
        serverId,
      });
    },

    insertCommand: async (sessionId, command) => {
      if (useSessionStore.getState().disconnectedSessionIds.has(sessionId)) {
        useToastStore
          .getState()
          .pushToast(i18n.t("tools:commandNav.toastDisconnected"), false);
        return;
      }

      await invoke("terminal_input", {
        sessionId,
        data: `${CLEAR_READLINE_LINE}${command}`,
      });
      window.dispatchEvent(
        new CustomEvent(TERMINAL_FOCUS_EVENT, { detail: { sessionId } }),
      );
    },
  }),
);

subscribeWorkspacePanelWidth((width) => {
  if (useCommandNavigatorStore.getState().width !== width) {
    useCommandNavigatorStore.setState({ width });
  }
});

export function closeCommandNavigator() {
  useCommandNavigatorStore.getState().close();
}
