/** Lens-style Pod volume grouping from kubectl YAML/JSON. */

export type PodVolumeEntry = {
  name: string;
  /** Spec discriminator key, e.g. persistentVolumeClaim */
  typeKey: string;
  claimName?: string;
  mountPaths: string[];
};

export type PodVolumeGroup = {
  typeKey: string;
  volumes: PodVolumeEntry[];
};

const TYPE_ORDER = [
  "persistentVolumeClaim",
  "configMap",
  "secret",
  "emptyDir",
  "projected",
  "hostPath",
  "downwardAPI",
  "csi",
  "other",
] as const;

const SOURCE_KEYS = new Set([
  "persistentVolumeClaim",
  "configMap",
  "secret",
  "emptyDir",
  "projected",
  "hostPath",
  "downwardAPI",
  "csi",
  "nfs",
  "iscsi",
  "fc",
  "azureDisk",
  "azureFile",
  "awsElasticBlockStore",
  "gcePersistentDisk",
  "glusterfs",
  "rbd",
  "cephfs",
  "cinder",
  "flexVolume",
  "flocker",
  "quobyte",
  "vsphereVolume",
  "photonPersistentDisk",
  "portworxVolume",
  "scaleIO",
  "storageos",
  "ephemeral",
  "image",
]);

function asRecord(v: unknown): Record<string, unknown> | null {
  return v !== null && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function typeKeyFromVolume(vol: Record<string, unknown>): string {
  for (const key of Object.keys(vol)) {
    if (key === "name") continue;
    if (SOURCE_KEYS.has(key)) return key;
  }
  for (const key of Object.keys(vol)) {
    if (key === "name") continue;
    return key;
  }
  return "other";
}

function claimNameOf(vol: Record<string, unknown>, typeKey: string): string | undefined {
  if (typeKey !== "persistentVolumeClaim") return undefined;
  const pvc = asRecord(vol.persistentVolumeClaim);
  const n = pvc?.claimName;
  return typeof n === "string" && n.trim() ? n.trim() : undefined;
}

function collectMountPaths(root: Record<string, unknown>): Map<string, string[]> {
  const map = new Map<string, string[]>();
  const spec = asRecord(root.spec);
  if (!spec) return map;
  const buckets = [spec.containers, spec.initContainers];
  for (const bucket of buckets) {
    if (!Array.isArray(bucket)) continue;
    for (const c of bucket) {
      const crec = asRecord(c);
      const mounts = crec?.volumeMounts;
      if (!Array.isArray(mounts)) continue;
      for (const m of mounts) {
        const mrec = asRecord(m);
        const name = mrec?.name;
        const path = mrec?.mountPath;
        if (typeof name !== "string" || !name.trim()) continue;
        if (typeof path !== "string" || !path.trim()) continue;
        const list = map.get(name) ?? [];
        if (!list.includes(path)) list.push(path);
        map.set(name, list);
      }
    }
  }
  return map;
}

function entriesFromJson(root: Record<string, unknown>): PodVolumeEntry[] {
  const spec = asRecord(root.spec);
  const volumes = spec?.volumes;
  if (!Array.isArray(volumes)) return [];
  const mounts = collectMountPaths(root);
  const out: PodVolumeEntry[] = [];
  for (const v of volumes) {
    const vol = asRecord(v);
    if (!vol) continue;
    const name = typeof vol.name === "string" ? vol.name.trim() : "";
    if (!name) continue;
    const typeKey = typeKeyFromVolume(vol);
    out.push({
      name,
      typeKey,
      claimName: claimNameOf(vol, typeKey),
      mountPaths: mounts.get(name) ?? [],
    });
  }
  return out;
}

/** YAML list-item field scrape (kubectl-style indentation). */
function yamlListItemFields(
  lines: string[],
  start: number,
): { fields: Record<string, string>; nested: Record<string, Record<string, string>>; end: number } {
  const startIndent = lines[start].match(/^(\s*)/)?.[1].length ?? 0;
  const fields: Record<string, string> = {};
  const nested: Record<string, Record<string, string>> = {};
  const first = lines[start].replace(/^\s*-\s*/, "");
  const firstKv = first.match(/^([^:#]+):\s*(.*)$/);
  if (firstKv) {
    fields[firstKv[1].trim()] = firstKv[2].trim();
  }
  let i = start + 1;
  let currentNested: string | null = null;
  let nestedIndent = -1;
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    if (indent <= startIndent) break;
    if (currentNested && indent <= nestedIndent) {
      currentNested = null;
      nestedIndent = -1;
    }
    const mapOnly = line.match(/^\s*([^:#]+):\s*$/);
    if (mapOnly && indent > startIndent) {
      currentNested = mapOnly[1].trim();
      nestedIndent = indent;
      nested[currentNested] = nested[currentNested] ?? {};
      continue;
    }
    const kv = line.match(/^\s*([^:#]+):\s*(.*)$/);
    if (!kv) continue;
    const key = kv[1].trim();
    const val = kv[2].trim();
    if (currentNested && indent > nestedIndent) {
      nested[currentNested][key] = val;
    } else {
      fields[key] = val;
    }
  }
  return { fields, nested, end: i };
}

function entriesFromYaml(doc: string): PodVolumeEntry[] {
  const lines = doc.split(/\r?\n/);
  // Find `volumes:` under spec (best-effort: first top-level-ish volumes list)
  let volumesAt = -1;
  let volumesIndent = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)volumes:\s*$/);
    if (m) {
      volumesAt = i;
      volumesIndent = m[1].length;
      break;
    }
  }
  if (volumesAt < 0) return [];

  const volumeItems: Array<{
    name: string;
    typeKey: string;
    claimName?: string;
  }> = [];

  for (let i = volumesAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const indent = line.match(/^(\s*)/)?.[1].length ?? 0;
    // kubectl often aligns `- name:` with the `volumes` key indent
    if (indent < volumesIndent) break;
    if (indent === volumesIndent && !/^\s*-\s/.test(line)) break;
    if (!/^\s*-\s/.test(line)) continue;
    const { fields, nested, end } = yamlListItemFields(lines, i);
    const name = fields.name?.trim();
    if (!name) {
      i = end - 1;
      continue;
    }
    let typeKey = "other";
    for (const key of Object.keys(fields)) {
      if (key === "name") continue;
      if (SOURCE_KEYS.has(key) || key !== "name") {
        if (SOURCE_KEYS.has(key)) {
          typeKey = key;
          break;
        }
      }
    }
    for (const key of Object.keys(nested)) {
      if (SOURCE_KEYS.has(key)) {
        typeKey = key;
        break;
      }
      if (typeKey === "other") typeKey = key;
    }
    // emptyDir: {} often appears as `emptyDir: {}` in fields
    for (const key of Object.keys(fields)) {
      if (key !== "name" && SOURCE_KEYS.has(key)) {
        typeKey = key;
        break;
      }
    }
    const claimName =
      typeKey === "persistentVolumeClaim"
        ? nested.persistentVolumeClaim?.claimName?.trim() ||
          fields.claimName?.trim()
        : undefined;
    volumeItems.push({ name, typeKey, claimName });
    i = end - 1;
  }

  // Mount paths: every list item that has both name + mountPath (do not skip
  // nested items — volumeMounts sit under container list entries).
  const mounts = new Map<string, string[]>();
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*-\s/.test(lines[i])) continue;
    const { fields } = yamlListItemFields(lines, i);
    if (fields.name && fields.mountPath) {
      const list = mounts.get(fields.name) ?? [];
      if (!list.includes(fields.mountPath)) list.push(fields.mountPath);
      mounts.set(fields.name, list);
    }
  }

  return volumeItems.map((v) => ({
    name: v.name,
    typeKey: v.typeKey,
    claimName: v.claimName,
    mountPaths: mounts.get(v.name) ?? [],
  }));
}

function groupEntries(entries: PodVolumeEntry[]): PodVolumeGroup[] {
  const byType = new Map<string, PodVolumeEntry[]>();
  for (const e of entries) {
    const list = byType.get(e.typeKey) ?? [];
    if (!list.some((x) => x.name === e.name)) list.push(e);
    byType.set(e.typeKey, list);
  }
  const keys = [...byType.keys()];
  keys.sort((a, b) => {
    const ia = TYPE_ORDER.indexOf(a as (typeof TYPE_ORDER)[number]);
    const ib = TYPE_ORDER.indexOf(b as (typeof TYPE_ORDER)[number]);
    const sa = ia === -1 ? TYPE_ORDER.length : ia;
    const sb = ib === -1 ? TYPE_ORDER.length : ib;
    return sa - sb || a.localeCompare(b);
  });
  return keys.map((typeKey) => ({
    typeKey,
    volumes: byType.get(typeKey)!,
  }));
}

export function parsePodVolumes(doc: string): PodVolumeGroup[] {
  const trimmed = doc.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("{")) {
    try {
      const root = asRecord(JSON.parse(trimmed) as unknown);
      if (!root) return [];
      return groupEntries(entriesFromJson(root));
    } catch {
      return [];
    }
  }
  return groupEntries(entriesFromYaml(trimmed));
}

/** i18n-friendly display key, e.g. persistentVolumeClaim → volumeType.persistentVolumeClaim */
export function volumeTypeI18nKey(typeKey: string): string {
  return `volumeType.${typeKey}`;
}
