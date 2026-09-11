/** Minimal DOM/i18n stubs for Node-based unit tests (CI uses Node 20 without navigator). */
if (typeof document === "undefined") {
  Object.defineProperty(globalThis, "document", {
    value: { documentElement: { lang: "en" } },
    writable: true,
  });
}

if (typeof navigator === "undefined") {
  Object.defineProperty(globalThis, "navigator", {
    value: { language: "en-US", languages: ["en-US"] },
    configurable: true,
  });
}

if (typeof localStorage === "undefined") {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", {
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, String(v));
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
      clear: () => store.clear(),
    },
    configurable: true,
  });
}
