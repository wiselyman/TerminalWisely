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
  const name = profile.name.trim();
  if (name) return name;
  return profile.model.trim();
}

/** vLLM `root` paths are not valid chat model ids — use `/v1/models` `id` instead. */
export function looksLikeFilesystemModelPath(model: string): boolean {
  const v = model.trim();
  if (!v) return false;
  if (v.startsWith("/") || v.startsWith("~")) return true;
  return v.includes("/snapshots/") || v.includes("models--") || v.includes("/.cache/");
}
