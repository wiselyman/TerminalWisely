export type LeadingCapitalInput = {
  data: string | null;
  inputType: string;
  isComposing: boolean;
  shiftKey: boolean;
  capsLock: boolean;
  selectionStart: number;
  valueLength: number;
};

/**
 * macOS text input often inserts a capital as the first character of an empty
 * field even when the user did not press Shift. Return the lowercase letter
 * to insert instead, or null to leave the keystroke alone.
 */
export function unwantedLeadingCapital(input: LeadingCapitalInput): string | null {
  if (input.isComposing || input.shiftKey || input.capsLock) return null;
  if (input.inputType !== "insertText") return null;
  if (input.selectionStart !== 0 || input.valueLength !== 0) return null;
  const data = input.data ?? "";
  if (data.length !== 1) return null;
  const lower = data.toLowerCase();
  if (lower === data) return null;
  if (lower.toUpperCase() !== data) return null;
  return lower;
}

export function installTextEntryGuard(target: Document = document): () => void {
  let shiftKey = false;
  let capsLock = false;

  const onKeyDown = (event: KeyboardEvent) => {
    shiftKey = event.shiftKey;
    capsLock = event.getModifierState?.("CapsLock") ?? false;
  };

  const onFocusIn = (event: FocusEvent) => {
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    el.setAttribute("autocapitalize", "none");
    el.setAttribute("autocorrect", "off");
  };

  const onBeforeInput = (event: Event) => {
    if (!(event instanceof InputEvent)) return;
    const el = event.target;
    if (!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return;
    const replacement = unwantedLeadingCapital({
      data: event.data,
      inputType: event.inputType,
      isComposing: event.isComposing,
      shiftKey,
      capsLock,
      selectionStart: el.selectionStart ?? 0,
      valueLength: el.value.length,
    });
    if (!replacement) return;
    event.preventDefault();
    const start = el.selectionStart ?? 0;
    const end = el.selectionEnd ?? start;
    el.setRangeText(replacement, start, end, "end");
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };

  target.addEventListener("keydown", onKeyDown, true);
  target.addEventListener("focusin", onFocusIn, true);
  target.addEventListener("beforeinput", onBeforeInput, true);
  return () => {
    target.removeEventListener("keydown", onKeyDown, true);
    target.removeEventListener("focusin", onFocusIn, true);
    target.removeEventListener("beforeinput", onBeforeInput, true);
  };
}
