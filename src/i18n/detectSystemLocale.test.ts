import { afterEach, describe, expect, it, vi } from "vitest";

describe("detectSystemLocale without browser globals", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("defaults to en when navigator is missing", async () => {
    const had = "navigator" in globalThis;
    const prev = had ? globalThis.navigator : undefined;
    // @ts-expect-error intentional delete for Node 20 CI parity
    delete globalThis.navigator;
    try {
      const { detectSystemLocale } = await import("./index");
      expect(detectSystemLocale()).toBe("en");
    } finally {
      if (had && prev) {
        Object.defineProperty(globalThis, "navigator", {
          value: prev,
          configurable: true,
        });
      }
    }
  });
});
