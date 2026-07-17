import i18n from "../i18n";

const MB = 1024 * 1024;

export function formatMegabytes(bytes: number): string {
  if (bytes <= 0) return "0.00 MB";
  return `${(bytes / MB).toFixed(2)} MB`;
}

export function formatSpeedMbps(bytesPerSecond: number): string {
  if (bytesPerSecond <= 0) return "";
  return `${(bytesPerSecond / MB).toFixed(2)} MB/s`;
}

export function formatTransferMethod(method?: string | null): string | null {
  switch (method) {
    case "scp":
      return i18n.t("tools:transfer.methodScp");
    case "stream":
      return i18n.t("tools:transfer.methodStream");
    case "sftp":
      return i18n.t("tools:transfer.methodSftp");
    default:
      return null;
  }
}

export function formatTransferDirection(direction: string): string {
  switch (direction) {
    case "upload":
      return i18n.t("tools:transfer.directionUpload");
    case "download":
      return i18n.t("tools:transfer.directionDownload");
    case "send":
      return i18n.t("tools:transfer.directionSend");
    default:
      return direction;
  }
}

export function formatTransferPercent(transferred: number, total: number): number | null {
  if (total <= 0) return null;
  return Math.min(100, Math.round((transferred / total) * 100));
}
