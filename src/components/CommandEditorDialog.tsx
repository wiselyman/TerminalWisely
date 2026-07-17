import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { buildParamsFromTemplate } from "../lib/commandTemplate";
import { localizeCategory, localizeDistroFamily } from "../lib/localizeCommand";
import type {
  CommandShortcutScope,
  CommandSubcategory,
  CommandTemplate,
  DistroFamily,
} from "../types";
import { useCommandNavigatorStore } from "../stores/commandNavigatorStore";
import { useToastStore } from "../stores/toastStore";
import { Modal } from "./Modal";

const SUBCATEGORIES: CommandSubcategory[] = [
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
];

const DISTRO_OPTIONS: DistroFamily[] = [
  "universal",
  "debian",
  "rhel",
  "alpine",
  "arch",
  "suse",
];

function createEmptyCommand(): CommandTemplate {
  return {
    id: crypto.randomUUID(),
    title: "",
    description: "",
    subcategory: "kernel",
    distroFamilies: ["universal"],
    template: "",
    params: [],
    scope: "all",
    builtin: false,
  };
}

export function CommandEditorDialog({ serverId }: { serverId: string }) {
  const { t } = useTranslation("commands");
  const editorTarget = useCommandNavigatorStore((s) => s.editorTarget);
  const closeEditor = useCommandNavigatorStore((s) => s.closeEditor);
  const saveCustomCommand = useCommandNavigatorStore((s) => s.saveCustomCommand);
  const pushToast = useToastStore((s) => s.pushToast);

  const [draft, setDraft] = useState<CommandTemplate>(
    () => editorTarget ?? createEmptyCommand(),
  );

  const previewParams = useMemo(
    () => buildParamsFromTemplate(draft.template),
    [draft.template],
  );

  const toggleDistro = (family: DistroFamily) => {
    setDraft((current) => {
      const has = current.distroFamilies.includes(family);
      const next = has
        ? current.distroFamilies.filter((item) => item !== family)
        : [...current.distroFamilies, family];
      return {
        ...current,
        distroFamilies: next.length > 0 ? next : (["universal"] as DistroFamily[]),
      };
    });
  };

  const handleSave = () => {
    const title = draft.title.trim();
    const template = draft.template.trim();
    if (!title) {
      pushToast(t("editor.toastNeedTitle"), false);
      return;
    }
    if (!template) {
      pushToast(t("editor.toastNeedTemplate"), false);
      return;
    }
    saveCustomCommand({
      ...draft,
      title,
      template,
      params: buildParamsFromTemplate(template),
      server_id: draft.scope === "server" ? serverId : null,
    });
  };

  return (
    <Modal
      title={editorTarget ? t("editor.titleEdit") : t("editor.titleAdd")}
      onClose={closeEditor}
    >
      <label className="cmd-run-field">
        <span>{t("editor.fieldName")}</span>
        <input
          type="text"
          value={draft.title}
          onChange={(event) =>
            setDraft((current) => ({ ...current, title: event.target.value }))
          }
        />
      </label>

      <label className="cmd-run-field">
        <span>{t("editor.fieldCategory")}</span>
        <select
          value={draft.subcategory}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              subcategory: event.target.value as CommandSubcategory,
            }))
          }
        >
          {SUBCATEGORIES.map((key) => (
            <option key={key} value={key}>
              {localizeCategory(key)}
            </option>
          ))}
        </select>
      </label>

      <label className="cmd-run-field">
        <span>{t("editor.fieldTemplate")}</span>
        <textarea
          className="cmd-editor-template"
          rows={3}
          value={draft.template}
          placeholder={t("editor.templatePlaceholder")}
          onChange={(event) =>
            setDraft((current) => ({ ...current, template: event.target.value }))
          }
        />
      </label>

      <div className="cmd-editor-distros">
        <span>{t("editor.fieldDistros")}</span>
        <div className="cmd-editor-distros-list">
          {DISTRO_OPTIONS.map((family) => (
            <label key={family} className="cmd-editor-distro-chip">
              <input
                type="checkbox"
                checked={draft.distroFamilies.includes(family)}
                onChange={() => toggleDistro(family)}
              />
              {localizeDistroFamily(family)}
            </label>
          ))}
        </div>
      </div>

      <label className="cmd-run-field">
        <span>{t("editor.fieldDescription")}</span>
        <input
          type="text"
          value={draft.description ?? ""}
          onChange={(event) =>
            setDraft((current) => ({ ...current, description: event.target.value }))
          }
        />
      </label>

      <label className="cmd-run-field">
        <span>{t("editor.fieldScope")}</span>
        <select
          value={draft.scope}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              scope: event.target.value as CommandShortcutScope,
            }))
          }
        >
          <option value="all">{t("editor.scopeAll")}</option>
          <option value="server">{t("editor.scopeServer")}</option>
        </select>
      </label>

      {previewParams.length > 0 ? (
        <p className="cmd-editor-param-hint">
          {t("editor.paramHint", {
            names: previewParams.map((param) => param.name).join(", "),
          })}
        </p>
      ) : null}

      <div className="cmd-run-actions">
        <button type="button" className="preview-action-btn" onClick={closeEditor}>
          {t("common:cancel")}
        </button>
        <button
          type="button"
          className="preview-action-btn preview-action-btn-primary"
          onClick={handleSave}
        >
          {t("common:save")}
        </button>
      </div>
    </Modal>
  );
}
