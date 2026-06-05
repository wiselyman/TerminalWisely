export const REMOTE_DRAG_MIME = "application/x-terminal-wisely-remote";

export interface RemoteDragPayload {
  fromSessionId: string;
  remotePath: string;
}

export function encodeRemoteDrag(payload: RemoteDragPayload): string {
  return JSON.stringify(payload);
}

export function parseRemoteDrag(
  dataTransfer: DataTransfer,
): RemoteDragPayload | null {
  const raw = dataTransfer.getData(REMOTE_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as RemoteDragPayload;
    if (
      typeof parsed.fromSessionId === "string" &&
      typeof parsed.remotePath === "string" &&
      parsed.fromSessionId.length > 0 &&
      parsed.remotePath.length > 0
    ) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function hasRemoteDrag(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes(REMOTE_DRAG_MIME);
}

export function hasLocalFileDrop(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types).includes("Files");
}

export function isRemoteTabDrop(dataTransfer: DataTransfer): boolean {
  return hasRemoteDrag(dataTransfer);
}

export function isLocalTabDrop(dataTransfer: DataTransfer): boolean {
  return hasLocalFileDrop(dataTransfer);
}
