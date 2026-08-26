import { invoke } from "@tauri-apps/api/core";

export function longestCommonPrefix(paths: string[]): string {
  if (paths.length === 0) return "";
  let prefix = paths[0];
  for (const path of paths.slice(1)) {
    while (!path.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
      if (!prefix) return "";
    }
  }
  return prefix;
}

export async function fetchPathCompletions(
  sessionId: string,
  partial: string,
): Promise<string[]> {
  const result = await invoke<{ completions: string[] }>("complete_path", {
    request: { session_id: sessionId, partial },
  });
  return result.completions ?? [];
}
