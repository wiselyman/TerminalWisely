/** Minimal DOM/i18n stubs for Node-based unit tests. */
if (typeof document === "undefined") {
  Object.defineProperty(globalThis, "document", {
    value: { documentElement: { lang: "en" } },
    writable: true,
  });
}
