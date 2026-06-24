import { useMemo, useState } from "react";
import { buildParamsFromTemplate } from "../lib/commandTemplate";
import { DISTRO_FAMILY_LABELS, SUBCATEGORY_LABELS } from "../lib/distroFamily";
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
      pushToast("请填写命令名称", false);
      return;
    }
    if (!template) {
      pushToast("请填写命令模板", false);
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
      title={editorTarget ? "编辑命令" : "添加命令"}
      onClose={closeEditor}
    >
      <label className="cmd-run-field">
        <span>名称</span>
        <input
          type="text"
          value={draft.title}
          onChange={(event) =>
            setDraft((current) => ({ ...current, title: event.target.value }))
          }
        />
      </label>

      <label className="cmd-run-field">
        <span>分类</span>
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
              {SUBCATEGORY_LABELS[key]}
            </option>
          ))}
        </select>
      </label>

      <label className="cmd-run-field">
        <span>模板</span>
        <textarea
          className="cmd-editor-template"
          rows={3}
          value={draft.template}
          placeholder="例如：systemctl status {service}"
          onChange={(event) =>
            setDraft((current) => ({ ...current, template: event.target.value }))
          }
        />
      </label>

      <div className="cmd-editor-distros">
        <span>适用发行版</span>
        <div className="cmd-editor-distros-list">
          {DISTRO_OPTIONS.map((family) => (
            <label key={family} className="cmd-editor-distro-chip">
              <input
                type="checkbox"
                checked={draft.distroFamilies.includes(family)}
                onChange={() => toggleDistro(family)}
              />
              {DISTRO_FAMILY_LABELS[family]}
            </label>
          ))}
        </div>
      </div>

      <label className="cmd-run-field">
        <span>说明（可选）</span>
        <input
          type="text"
          value={draft.description ?? ""}
          onChange={(event) =>
            setDraft((current) => ({ ...current, description: event.target.value }))
          }
        />
      </label>

      <label className="cmd-run-field">
        <span>作用域</span>
        <select
          value={draft.scope}
          onChange={(event) =>
            setDraft((current) => ({
              ...current,
              scope: event.target.value as CommandShortcutScope,
            }))
          }
        >
          <option value="all">全部会话</option>
          <option value="server">当前服务器（保存时绑定）</option>
        </select>
      </label>

      {previewParams.length > 0 ? (
        <p className="cmd-editor-param-hint">
          参数：{previewParams.map((param) => param.name).join("、")}
        </p>
      ) : null}

      <div className="cmd-run-actions">
        <button type="button" className="preview-action-btn" onClick={closeEditor}>
          取消
        </button>
        <button
          type="button"
          className="preview-action-btn preview-action-btn-primary"
          onClick={handleSave}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}
