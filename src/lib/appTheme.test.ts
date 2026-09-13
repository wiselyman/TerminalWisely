/** @vitest-environment jsdom */
import { beforeEach, describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyAppTheme,
  getAppTheme,
  isAppTheme,
  readStoredTheme,
  resolveAppTheme,
  setAppTheme,
  terminalThemeFor,
} from "./appTheme";

describe("appTheme", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
    document.documentElement.style.colorScheme = "";
  });

  it("isAppTheme accepts only dark|light", () => {
    expect(isAppTheme("dark")).toBe(true);
    expect(isAppTheme("light")).toBe(true);
    expect(isAppTheme("system")).toBe(false);
  });

  it("defaults to dark when unset", () => {
    expect(readStoredTheme()).toBeNull();
    expect(resolveAppTheme()).toBe("dark");
  });

  it("setAppTheme persists and applies data-theme", () => {
    setAppTheme("light");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.style.colorScheme).toBe("light");
    expect(getAppTheme()).toBe("light");
    expect(resolveAppTheme()).toBe("light");
  });

  it("applyAppTheme does not require storage", () => {
    applyAppTheme("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(readStoredTheme()).toBeNull();
  });

  it("terminalThemeFor differs by theme", () => {
    expect(terminalThemeFor("dark").background).toBe("#0d1117");
    expect(terminalThemeFor("light").background).toBe("#ffffff");
    expect(terminalThemeFor("light").foreground).not.toBe(
      terminalThemeFor("dark").foreground,
    );
  });
});
