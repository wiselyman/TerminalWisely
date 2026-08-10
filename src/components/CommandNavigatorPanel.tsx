import { useMemo, type MouseEvent as ReactMouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { BUILTIN_COMMANDS } from "../content/defaultCommands";
import { filterCommands } from "../lib/commandTemplate";
import { distroFilterFamily, primaryDistroFamily } from "../lib/distroFamily";
import {
  localizeCategory,
  localizeCommandDescription,
  localizeCommandTitle,
  localizeDistroFamily,
} from "../lib/localizeCommand";
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
  const { t, i18n } = useTranslation("tools");
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
      i18n.language,
    ],
  );

  const filterFamily = distroFilterFamily(osId);
  const distroHint = filterFamily
    ? t("commandNav.distroFilterHint", {
        family: localizeDistroFamily(filterFamily),
      })
    : null;

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
          aria-label={t("commandNav.resizeAria")}
          onMouseDown={startResize}
        />
        <div className="cmd-nav-panel-head">
          <div className="cmd-nav-panel-title-wrap">
            <h2 className="cmd-nav-panel-title">{t("commandNav.title")}</h2>
            <span className="cmd-nav-panel-session">
              {sessionTitle}
              {distroHint ? (
                <span className="cmd-nav-distro-hint"> · {distroHint}</span>
              ) : null}
            </span>
          </div>
        </div>

        <div className="cmd-nav-panel-toolbar">
          <input
            type="search"
            className="cmd-nav-search"
            placeholder={t("commandNav.searchPlaceholder")}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="cmd-nav-add-btn"
            onClick={() => openEditor()}
          >
            + {t("commandNav.addCommand")}
          </button>
        </div>

        <div className="cmd-nav-tabs" role="tablist" aria-label={t("commandNav.tabsAria")}>
          {TAB_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              role="tab"
              className={`cmd-nav-tab${subcategory === key ? " active" : ""}`}
              aria-selected={subcategory === key}
              onClick={() => setSubcategory(key)}
            >
              {localizeCategory(key)}
            </button>
          ))}
        </div>

        <div className="cmd-nav-panel-body">
          {commands.length === 0 ? (
            <p className="cmd-nav-empty">{t("commandNav.empty")}</p>
          ) : (
            <ul className="cmd-nav-list">
              {commands.map((command) => {
                const distroFamily = primaryDistroFamily(command.distroFamilies);
                const description = localizeCommandDescription(command);
                return (
                  <li key={command.id} className="cmd-nav-item">
                    <button
                      type="button"
                      className="cmd-nav-item-main"
                      onClick={() => handleCommandAction(command, "run")}
                    >
                      <span className="cmd-nav-item-title">
                        {localizeCommandTitle(command)}
                      </span>
                      <code className="cmd-nav-item-template">{command.template}</code>
                      {description ? (
                        <span className="cmd-nav-item-desc">{description}</span>
                      ) : null}
                    </button>
                    <div className="cmd-nav-item-meta">
                      {distroFamily ? (
                        <span className="cmd-nav-distro-badge">
                          {localizeDistroFamily(distroFamily)}
                        </span>
                      ) : null}
                      {!command.builtin ? (
                        <>
                          <button
                            type="button"
                            className="cmd-nav-item-action"
                            onClick={() => handleCommandAction(command, "edit")}
                          >
                            {t("common:edit")}
                          </button>
                          <button
                            type="button"
                            className="cmd-nav-item-action"
                            onClick={() => handleCommandAction(command, "delete")}
                          >
                            {t("common:delete")}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="cmd-nav-item-action"
                          onClick={() => handleCommandAction(command, "hide")}
                        >
                          {t("common:hide")}
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
