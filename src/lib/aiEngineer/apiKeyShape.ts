/** True when the API key field holds a web address instead of a provider secret. */
export function apiKeyIsBaseUrl(key: string, baseUrl = ""): boolean {
  const raw = key.trim();
  if (!raw) return false;
  const lowered = raw.toLowerCase().replace(/\/+$/, "");
  if (lowered.startsWith("http://") || lowered.startsWith("https://")) return true;
  const base = baseUrl.trim().toLowerCase().replace(/\/+$/, "");
  return Boolean(base) && lowered === base;
}
