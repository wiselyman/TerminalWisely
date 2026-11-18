import type { LocalFsEntry } from "../types";

export type LocalFsSortField = "name" | "size" | "modified";
export type LocalFsSort = { field: LocalFsSortField; direction: "asc" | "desc" };

const nameCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export function sortLocalFsEntries(entries: LocalFsEntry[], sort: LocalFsSort | null): LocalFsEntry[] {
  if (!sort) return entries;
  const direction = sort.direction === "asc" ? 1 : -1;
  return entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      if (a.entry.kind !== b.entry.kind) return a.entry.kind === "directory" ? -1 : 1;
      const aValue = sort.field === "name" ? a.entry.name : sort.field === "size" ? a.entry.size_bytes : a.entry.modified_ms;
      const bValue = sort.field === "name" ? b.entry.name : sort.field === "size" ? b.entry.size_bytes : b.entry.modified_ms;
      const aMissing = aValue == null;
      const bMissing = bValue == null;
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      if (aMissing && bMissing) return a.index - b.index;
      const compared = sort.field === "name"
        ? nameCollator.compare(aValue as string, bValue as string)
        : (aValue as number) - (bValue as number);
      return compared === 0 ? a.index - b.index : compared * direction;
    })
    .map(({ entry }) => entry);
}
