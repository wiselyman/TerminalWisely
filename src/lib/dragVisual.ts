export function attachDragGhost(
  event: DragEvent,
  label: string,
  kind: "remote" | "local",
): void {
  const dataTransfer = event.dataTransfer;
  if (!dataTransfer) return;

  const ghost = document.createElement("div");
  ghost.className = `drag-ghost drag-ghost-${kind}`;
  ghost.textContent = label;
  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, 20, 18);
  dataTransfer.effectAllowed = kind === "remote" ? "move" : "copy";
  window.setTimeout(() => ghost.remove(), 0);
}

export function dropEffectForKind(kind: "remote" | "local"): DataTransfer["dropEffect"] {
  return kind === "remote" ? "move" : "copy";
}

export function formatRemoteDragLabel(path: string): string {
  const name = path.split("/").pop() || path;
  return `发送 ${name}`;
}
