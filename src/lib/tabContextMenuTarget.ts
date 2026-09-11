const TAB_MENU_IGNORE_SELECTOR =
  ".tab-shortcut-folder, .tab-close, .tab-home, .tab-shortcut-add, .tab-shortcut-wrap, .tab-shortcut-icons";

export function resolveTabContextMenuTarget(
  target: EventTarget | null,
): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest(TAB_MENU_IGNORE_SELECTOR)) return null;
  return target.closest<HTMLElement>(".tab[data-session-id]");
}
