const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;

export function formatSizeHuman(sizeBytes: number): string {
  if (sizeBytes >= GB) {
    return `${(sizeBytes / GB).toFixed(1)} G`;
  }
  if (sizeBytes >= MB) {
    return `${(sizeBytes / MB).toFixed(1)} M`;
  }
  return `${(sizeBytes / KB).toFixed(1)} K`;
}

export function formatSizeBytes(sizeBytes: number): string {
  return `${sizeBytes.toLocaleString("zh-CN")} 字节`;
}
