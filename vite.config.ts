import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
const e2e = process.env.VITE_E2E === "1" || process.env.VITE_E2E === "true";

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react()],
  resolve: e2e
    ? {
        alias: {
          "@tauri-apps/api/core": path.resolve(__dirname, "src/e2e/tauriCoreMock.ts"),
          "@tauri-apps/api/window": path.resolve(__dirname, "src/e2e/tauriWindowMock.ts"),
          "@tauri-apps/api/event": path.resolve(__dirname, "src/e2e/tauriEventMock.ts"),
        },
      }
    : undefined,

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**", "**/.terminal-wisely/**"],
    },
  },
}));
