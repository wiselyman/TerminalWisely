/** Browser E2E mode: Vite preview + Playwright, real sidecar over HTTP (no Tauri shell). */

export function isE2eBrowserMode(): boolean {
  const flag = import.meta.env.VITE_E2E;
  return flag === "1" || flag === "true";
}

export function e2eSidecarUrl(): string {
  return (
    import.meta.env.VITE_E2E_SIDECAR_URL?.trim() || "http://127.0.0.1:8765"
  );
}

export function e2eSidecarToken(): string {
  return import.meta.env.VITE_E2E_SIDECAR_TOKEN?.trim() || "dev-token";
}
