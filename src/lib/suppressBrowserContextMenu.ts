/** Targets that show an app-owned context menu (React onContextMenu). */
function hasAppContextMenu(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest(
      ".tab[data-session-id], .tab-shortcut-folder, .terminal-fs-context-menu",
    )
  );
}

function isTerminalCopyTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    !!target.closest(".tw-terminal-host, .xterm")
  );
}

function isFormField(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable ||
      !!target.closest("input, textarea, select, [contenteditable='true']"))
  );
}

/** Block the WebView browser menu without interfering with app context menus. */
export function suppressBrowserContextMenu(event: MouseEvent): void {
  if (event.defaultPrevented) return;
  if (hasAppContextMenu(event.target)) return;
  if (isTerminalCopyTarget(event.target)) return;
  if (isFormField(event.target)) return;
  event.preventDefault();
}
