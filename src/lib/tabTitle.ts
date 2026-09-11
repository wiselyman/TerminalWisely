/** Assign a tab title that stays unique among open tabs.
 * First uses the bare name; later tabs get (1), (2), (3)… */
export function uniqueTabTitle(
  proposed: string,
  tabs: ReadonlyArray<{ id: string; title: string }>,
  excludeId?: string,
): string {
  const base = proposed.trim() || "Session";
  const others = tabs.filter((tab) => tab.id !== excludeId);
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(?: \\((\\d+)\\))?$`);

  let bareTaken = false;
  const used = new Set<number>();
  for (const tab of others) {
    const match = tab.title.match(pattern);
    if (!match) continue;
    if (match[1]) {
      used.add(Number.parseInt(match[1], 10));
    } else {
      bareTaken = true;
    }
  }

  if (!bareTaken) return base;

  let index = 1;
  while (used.has(index)) index += 1;
  return `${base} (${index})`;
}
