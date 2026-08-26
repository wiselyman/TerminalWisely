import type { AiSettingsView } from "./aiEngineer/api";

export function getActiveAiProfile(settings: AiSettingsView | null | undefined) {
  if (!settings?.profiles?.length) return null;
  return (
    settings.profiles.find((p) => p.id === settings.active_profile_id) ??
    settings.profiles[0] ??
    null
  );
}

export function isAiModelConfigured(settings: AiSettingsView | null | undefined) {
  const profile = getActiveAiProfile(settings);
  return Boolean(profile?.model?.trim());
}

export function formatActiveAiProfileLabel(
  settings: AiSettingsView | null | undefined,
) {
  const profile = getActiveAiProfile(settings);
  if (!profile?.model?.trim()) return null;
  if (profile.name.trim() === profile.model.trim()) {
    return profile.model;
  }
  return `${profile.name} · ${profile.model}`;
}
