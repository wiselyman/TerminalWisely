const CLEANUP_FAILURE_PREFIX = "cleanup-failed:";

export function splitStartupNotice(names: readonly string[]): {
  restored: string[];
  cleanupFailures: string[];
} {
  const restored: string[] = [];
  const cleanupFailures: string[] = [];
  for (const name of names) {
    if (name.startsWith(CLEANUP_FAILURE_PREFIX)) {
      cleanupFailures.push(name.slice(CLEANUP_FAILURE_PREFIX.length).trim());
    } else {
      restored.push(name);
    }
  }
  return { restored, cleanupFailures };
}
