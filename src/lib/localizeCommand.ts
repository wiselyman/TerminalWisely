import i18n from "../i18n";
import type { CommandTemplate } from "../types";

export function localizeCommandTitle(command: CommandTemplate): string {
  return i18n.t(`commands:cmd.${command.id}.title`, {
    defaultValue: command.title,
  });
}

export function localizeCommandDescription(
  command: CommandTemplate,
): string | undefined {
  if (!command.description) return undefined;
  return i18n.t(`commands:cmd.${command.id}.description`, {
    defaultValue: command.description,
  });
}

export function localizeParamLabel(name: string, fallback: string): string {
  return i18n.t(`commands:param.${name}`, { defaultValue: fallback });
}

export function localizeCategory(category: string): string {
  return i18n.t(`commands:category.${category}`, { defaultValue: category });
}

export function localizeDistroFamily(family: string): string {
  return i18n.t(`commands:distro.${family}`, { defaultValue: family });
}
