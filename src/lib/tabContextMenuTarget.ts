const TAB_MENU_IGNORE_SELECTOR =
  ".tab-close";

export function resolveTabContextMenuTarget(
  target: EventTarget | null,
): HTMLElement | null {
  if (!(target instanceof HTMLElement)) return null;
  if (target.closest(TAB_MENU_IGNORE_SELECTOR)) return null;
  return target.closest<HTMLElement>(".tab[data-session-id]");
}
