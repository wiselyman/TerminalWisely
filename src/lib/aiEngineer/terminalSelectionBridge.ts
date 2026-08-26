/** Bridge so AI panel can read the active xterm selection without a second SSH. */

type SelectionProvider = () => string;

let provider: SelectionProvider | null = null;

export function registerTerminalSelectionProvider(fn: SelectionProvider | null): void {
  provider = fn;
}

export function readActiveTerminalSelection(): string {
  try {
    return (provider?.() ?? "").replace(/\x00/g, "");
  } catch {
    return "";
  }
}
