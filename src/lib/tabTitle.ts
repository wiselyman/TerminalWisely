/** Assign a tab title that stays unique among open tabs (e.g. spark → spark (2)). */
export function uniqueTabTitle(
  proposed: string,
  tabs: ReadonlyArray<{ id: string; title: string }>,
  excludeId?: string,
): string {
  const base = proposed.trim() || "Session";
  const others = tabs.filter((tab) => tab.id !== excludeId);
  const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}(?: \\((\\d+)\\))?$`);

  const used = new Set<number>();
  for (const tab of others) {
    const match = tab.title.match(pattern);
    if (match) {
      used.add(match[1] ? Number.parseInt(match[1], 10) : 1);
    }
  }

  if (!used.has(1)) return base;

  let index = 2;
  while (used.has(index)) index += 1;
  return `${base} (${index})`;
}
