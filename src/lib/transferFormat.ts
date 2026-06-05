const MB = 1024 * 1024;

export function formatMegabytes(bytes: number): string {
  if (bytes <= 0) return "0.00 MB";
  return `${(bytes / MB).toFixed(2)} MB`;
}

export function formatSpeedMbps(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "";
  return `${(bytesPerSecond / MB).toFixed(2)} MB/s`;
}

export function formatTransferDirection(direction: string): string {
  switch (direction) {
    case "upload":
      return "上传";
    case "download":
      return "下载";
    case "send":
      return "跨服发送";
    default:
      return direction;
  }
}

export function formatTransferPercent(transferred: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((transferred / total) * 100));
}
