import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import { BUILTIN_COMMANDS } from "../content/defaultCommands";
import { filterCommands } from "../lib/commandTemplate";
import {
  distroFilterHint,
  primaryDistroLabel,
  SUBCATEGORY_LABELS,
} from "../lib/distroFamily";
import type { CommandTemplate } from "../types";
import { useCommandNavigatorStore } from "../stores/commandNavigatorStore";
import { useToastStore } from "../stores/toastStore";
import { CommandEditorDialog } from "./CommandEditorDialog";
import { CommandRunDialog } from "./CommandRunDialog";
import { WorkspacePanelBackdrop } from "./WorkspacePanelBackdrop";

interface CommandNavigatorPanelProps {
  sessionId: string;
  sessionTitle: string;
  osId?: string | null;
  tabKind: "local" | "ssh";
  serverId: string;
}

const TAB_KEYS = [
  "all",
  "service",
  "journal",
  "disk",
  "process",
  "network",
  "package",
  "file",
  "user",
  "cron",
  "kernel",
  "custom",
] as const;

export function CommandNavigatorPanel({
  sessionId,
  sessionTitle,
  osId,
  tabKind,
  serverId,
}: CommandNavigatorPanelProps) {
  const {
    width,
    setWidth,
    query,
    setQuery,
    subcategory,
    setSubcategory,
    openRunDialog,
    openEditor,
    deleteCustomCommand,
    hideBuiltinCommand,
    runTarget,
    editorOpen,
    insertCommand,
    customCommands,
    hiddenBuiltinIds,
  } = useCommandNavigatorStore();
  const pushToast = useToastStore((s) => s.pushToast);

  const commands = useMemo(
    () =>
      filterCommands([...BUILTIN_COMMANDS, ...customCommands], {
        query,
        subcategory,
        osId,
        hiddenBuiltinIds,
        tabKind,
        serverId,
      }),
    [
      query,
      subcategory,
      osId,
      customCommands,
      hiddenBuiltinIds,
      tabKind,
      serverId,
    ],
  );

  const distroHint = distroFilterHint(osId);

  const startResize = (event: ReactMouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = width;
    document.body.classList.add("cmd-nav-panel-resizing");

    const onMouseMove = (moveEvent: MouseEvent) => {
      setWidth(startWidth + (startX - moveEvent.clientX));
    };

    const onMouseUp = () => {
      document.body.classList.remove("cmd-nav-panel-resizing");
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleCommandAction = (
    command: CommandTemplate,
    action: "run" | "edit" | "hide" | "delete",
  ) => {
    if (action === "run") {
      if (command.params.length === 0) {
        void insertCommand(sessionId, command.template).catch((err) => {
          pushToast(String(err), false);
        });
        return;
      }
      openRunDialog(command);
      return;
    }
    if (action === "edit") {
      openEditor(command);
      return;
    }
    if (action === "hide") {
      hideBuiltinCommand(command.id);
      return;
    }
    deleteCustomCommand(command.id);
  };

  return (
    <>
      <WorkspacePanelBackdrop />
      <aside className="cmd-nav-panel open" style={{ width }}>
        <div
          className="cmd-nav-panel-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整命令面板宽度"
          onMouseDown={startResize}
        />
        <div className="cmd-nav-panel-head">
          <div className="cmd-nav-panel-title-wrap">
            <h2 className="cmd-nav-panel-title">命令</h2>
            <p className="cmd-nav-panel-session">
              {sessionTitle}
              {distroHint ? (
                <span className="cmd-nav-distro-hint"> · {distroHint}</span>
              ) : null}
            </p>
          </div>
        </div>

        <div className="cmd-nav-panel-toolbar">
          <input
            type="search"
            className="cmd-nav-search"
            placeholder="搜索命令…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button
            type="button"
            className="cmd-nav-add-btn"
            onClick={() => openEditor()}
          >
            + 添加命令
          </button>
        </div>

        <div className="cmd-nav-tabs" role="tablist" aria-label="命令分类">
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              className={`cmd-nav-tab${subcategory === key ? " active" : ""}`}
              aria-selected={subcategory === key}
              onClick={() => setSubcategory(key)}
            >
              {SUBCATEGORY_LABELS[key]}
            </button>
          ))}
        </div>

        <div className="cmd-nav-panel-body">
          {commands.length === 0 ? (
            <p className="cmd-nav-empty">没有匹配的命令</p>
          ) : (
            <ul className="cmd-nav-list">
              {commands.map((command) => {
                const distro = primaryDistroLabel(command.distroFamilies);
                return (
                  <li key={command.id} className="cmd-nav-item">
                    <button
                      type="button"
                      className="cmd-nav-item-main"
                      onClick={() => handleCommandAction(command, "run")}
                    >
                      <span className="cmd-nav-item-title">{command.title}</span>
                      <code className="cmd-nav-item-template">{command.template}</code>
                      {command.description ? (
                        <span className="cmd-nav-item-desc">{command.description}</span>
                      ) : null}
                    </button>
                    <div className="cmd-nav-item-meta">
                      {distro ? (
                        <span className="cmd-nav-distro-badge">{distro}</span>
                      ) : null}
                      {!command.builtin ? (
                        <>
                          <button
                            type="button"
                            className="cmd-nav-item-action"
                            onClick={() => handleCommandAction(command, "edit")}
                          >
                            编辑
                          </button>
                          <button
                            type="button"
                            className="cmd-nav-item-action"
                            onClick={() => handleCommandAction(command, "delete")}
                          >
                            删除
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="cmd-nav-item-action"
                          onClick={() => handleCommandAction(command, "hide")}
                        >
                          隐藏
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>

      {runTarget ? (
        <CommandRunDialog sessionId={sessionId} command={runTarget} />
      ) : null}
      {editorOpen ? <CommandEditorDialog serverId={serverId} /> : null}
    </>
  );
}
