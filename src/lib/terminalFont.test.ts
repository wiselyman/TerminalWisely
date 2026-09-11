import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  TERMINAL_FONT_SIZE,
  TERMINAL_FONT_SIZE_MAX,
  TERMINAL_FONT_SIZE_MIN,
  adjustTerminalFontSize,
  clampTerminalFontSize,
  getTerminalFontSize,
  handleTerminalFontSizeHotkey,
  setTerminalFontSize,
  subscribeTerminalFontSize,
} from "./terminalFont";

function stubStorage() {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => {
      store[k] = v;
    },
    removeItem: (k: string) => {
      delete store[k];
    },
    clear: () => {
      for (const k of Object.keys(store)) delete store[k];
    },
  });
  return store;
}

function keyEvent(
  key: string,
  mods: { metaKey?: boolean; ctrlKey?: boolean; altKey?: boolean } = {},
): KeyboardEvent {
  return {
    type: "keydown",
    key,
    metaKey: Boolean(mods.metaKey),
    ctrlKey: Boolean(mods.ctrlKey),
    altKey: Boolean(mods.altKey),
  } as KeyboardEvent;
}

describe("terminalFont size", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = stubStorage();
    setTerminalFontSize(TERMINAL_FONT_SIZE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("clamps to min/max", () => {
    expect(clampTerminalFontSize(1)).toBe(TERMINAL_FONT_SIZE_MIN);
    expect(clampTerminalFontSize(999)).toBe(TERMINAL_FONT_SIZE_MAX);
    expect(clampTerminalFontSize(14.6)).toBe(15);
    expect(clampTerminalFontSize(Number.NaN)).toBe(TERMINAL_FONT_SIZE);
  });

  it("persists and restores font size", () => {
    setTerminalFontSize(18);
    expect(store["tw.terminal.fontSize"]).toBe("18");
    expect(getTerminalFontSize()).toBe(18);
  });

  it("adjusts by delta and notifies subscribers", () => {
    setTerminalFontSize(14);
    const seen: number[] = [];
    const unsub = subscribeTerminalFontSize((size) => seen.push(size));
    expect(adjustTerminalFontSize(2)).toBe(16);
    expect(adjustTerminalFontSize(-1)).toBe(15);
    expect(seen).toEqual([16, 15]);
    unsub();
  });

  it("handles Cmd/Ctrl +/-/= hotkeys", () => {
    setTerminalFontSize(14);
    expect(handleTerminalFontSizeHotkey(keyEvent("=", { metaKey: true }))).toBe(
      true,
    );
    expect(getTerminalFontSize()).toBe(15);

    expect(handleTerminalFontSizeHotkey(keyEvent("-", { ctrlKey: true }))).toBe(
      true,
    );
    expect(getTerminalFontSize()).toBe(14);

    setTerminalFontSize(20);
    expect(handleTerminalFontSizeHotkey(keyEvent("0", { metaKey: true }))).toBe(
      true,
    );
    expect(getTerminalFontSize()).toBe(TERMINAL_FONT_SIZE);
  });

  it("ignores non-modifier keys", () => {
    const spy = vi.fn();
    const unsub = subscribeTerminalFontSize(spy);
    expect(handleTerminalFontSizeHotkey(keyEvent("="))).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    unsub();
  });
});
