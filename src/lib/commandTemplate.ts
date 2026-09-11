import i18n from "../i18n";
import { commandMatchesDistro } from "./distroFamily";
import { isValidChmodMode } from "./chmodMode";
import { isValidPort } from "./commonPorts";
import {
  localizeCategory,
  localizeCommandDescription,
  localizeCommandTitle,
  localizeParamLabel,
} from "./localizeCommand";
import type { CommandParam, CommandTemplate, SessionKind } from "../types";

const PARAM_PATTERN = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g;

export function parseParamNames(template: string): string[] {
  const names = new Set<string>();
  for (const match of template.matchAll(PARAM_PATTERN)) {
    names.add(match[1]);
  }
  return [...names];
}

// Fallback text if `commands:param.<name>` is missing; localizeParamLabel() resolves the real label.
const DEFAULT_PARAM_LABELS: Record<string, string> = {
  service: "Service",
  package: "Package",
  pattern: "Pattern",
  path: "Path",
  port: "Port",
  pid: "PID",
  signal: "Signal",
  lines: "Lines",
  since: "Since",
  until: "Until",
  size: "Size",
  depth: "Depth",
  count: "Count",
  host: "Host",
  url: "URL",
  key: "Key",
  name: "Name",
  iface: "Interface",
  filter: "Filter",
  mode: "Mode",
  owner: "Owner",
  group: "Group",
  ext: "Extension",
};

export function buildParamsFromTemplate(
  template: string,
  overrides: Partial<Record<string, Partial<CommandParam>>> = {},
): CommandParam[] {
  return parseParamNames(template).map((name) => {
    const extra = overrides[name] ?? {};
    return {
      name,
      label: extra.label ?? DEFAULT_PARAM_LABELS[name] ?? name,
      default: extra.default ?? (name === "path" ? "~" : undefined),
      required: extra.required ?? true,
      placeholder: extra.placeholder,
      inputKind:
        extra.inputKind ??
        (name === "service"
          ? "systemd-unit"
          : name === "path"
            ? "path"
            : name === "pid"
              ? "process-pid"
              : name === "port"
                ? "port"
                : "text"),
    };
  });
}

export function renderCommandTemplate(
  template: string,
  values: Record<string, string>,
): string {
  return template.replace(PARAM_PATTERN, (_, name: string) => values[name] ?? "");
}

export function resolveCommandText(
  command: CommandTemplate,
  values: Record<string, string>,
): string {
  if (command.id === "net-ss") {
    const port = values.port?.trim() ?? "";
    if (!port) return "ss -tulnp";
    return `ss -tlnp | grep ':${port}'`;
  }
  if (command.id === "file-chown") {
    const owner = values.owner?.trim() ?? "";
    const group = values.group?.trim() ?? "";
    const path = values.path?.trim() ?? "";
    if (!group) return `sudo chown ${owner} ${path}`;
    return `sudo chown ${owner}:${group} ${path}`;
  }
  return renderCommandTemplate(command.template, values);
}

export function validateParamValues(
  params: CommandParam[],
  values: Record<string, string>,
): string | null {
  for (const param of params) {
    if (param.required === false) continue;
    const value = values[param.name]?.trim() ?? "";
    if (!value) {
      return i18n.t("commands:validation.fieldRequired", {
        label: localizeParamLabel(param.name, param.label),
      });
    }
    if (param.inputKind === "chmod-mode" && !isValidChmodMode(value)) {
      return i18n.t("commands:validation.chmodInvalid");
    }
    if (param.inputKind === "port" && value && !isValidPort(value)) {
      return i18n.t("commands:validation.portInvalid");
    }
  }
  return null;
}

export function createBuiltinCommand(
  partial: Omit<CommandTemplate, "params" | "builtin" | "scope"> & {
    params?: CommandParam[];
    paramOverrides?: Partial<Record<string, Partial<CommandParam>>>;
    scope?: CommandTemplate["scope"];
  },
): CommandTemplate {
  const params =
    partial.params ??
    buildParamsFromTemplate(partial.template, partial.paramOverrides ?? {});
  return {
    ...partial,
    scope: partial.scope ?? "all",
    params,
    builtin: true,
  };
}

export function commandVisibleOnTab(
  cmd: CommandTemplate,
  tabKind: SessionKind,
  serverId: string,
): boolean {
  if (cmd.scope === "all") return true;
  if (cmd.scope === "server") {
    if (cmd.server_id === "local") return false;
    return tabKind === "ssh" && cmd.server_id === serverId;
  }
  return true;
}

export function filterCommands(
  commands: CommandTemplate[],
  options: {
    query: string;
    subcategory: string;
    osId: string | null | undefined;
    hiddenBuiltinIds: Set<string>;
    tabKind: SessionKind;
    serverId: string;
  },
): CommandTemplate[] {
  const q = options.query.trim().toLowerCase();
  return commands.filter((cmd) => {
    if (cmd.builtin && options.hiddenBuiltinIds.has(cmd.id)) return false;
    if (
      options.subcategory !== "all" &&
      options.subcategory !== "custom" &&
      cmd.subcategory !== options.subcategory
    ) {
      return false;
    }
    if (options.subcategory === "custom" && cmd.builtin) return false;
    if (!commandVisibleOnTab(cmd, options.tabKind, options.serverId)) {
      return false;
    }
    if (
      !commandMatchesDistro(
        cmd.distroFamilies,
        options.osId,
      )
    ) {
      return false;
    }
    if (!q) return true;
    // Search both source (often zh) and localized UI strings so EN locale works.
    const localizedTitle = localizeCommandTitle(cmd);
    const localizedDescription = localizeCommandDescription(cmd) ?? "";
    const localizedCategory = localizeCategory(cmd.subcategory);
    const haystack = [
      localizedTitle,
      localizedDescription,
      localizedCategory,
      cmd.title,
      cmd.description ?? "",
      cmd.template,
      cmd.subcategory,
      cmd.id,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  });
}

export function initialParamValues(cmd: CommandTemplate): Record<string, string> {
  const values: Record<string, string> = {};
  for (const param of cmd.params) {
    if (param.default != null) {
      values[param.name] = param.default;
    }
  }
  return values;
}
