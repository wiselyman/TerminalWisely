import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Copy Vditor dist assets into public/vditor/dist so IR loads lute/katex/mermaid offline.
 * Vditor resolves `${cdn}/dist/js/...` — keep the `/dist` segment. */
export function copyVditorAssetsPlugin(): Plugin {
  const sync = () => {
    const root = process.cwd();
    const from = path.join(root, "node_modules/vditor/dist");
    const to = path.join(root, "public/vditor/dist");
    if (!existsSync(from)) return;
    mkdirSync(path.dirname(to), { recursive: true });
    rmSync(to, { recursive: true, force: true });
    cpSync(from, to, { recursive: true });
  };

  return {
    name: "copy-vditor-assets",
    buildStart() {
      sync();
    },
    configureServer() {
      sync();
    },
  };
}
