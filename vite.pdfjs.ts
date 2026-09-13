import { cpSync, existsSync, mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { Plugin } from "vite";

/** Copy pdf.js CMaps, fonts, wasm, ICC into public/ for OFV (CJK + compressed PDFs). */
export function copyPdfjsAssetsPlugin(): Plugin {
  const sync = () => {
    const root = process.cwd();
    const pairs: Array<[string, string]> = [
      [
        path.join(root, "node_modules/pdfjs-dist/cmaps"),
        path.join(root, "public/pdfjs/cmaps"),
      ],
      [
        path.join(root, "node_modules/pdfjs-dist/standard_fonts"),
        path.join(root, "public/pdfjs/standard_fonts"),
      ],
      [
        path.join(root, "node_modules/pdfjs-dist/wasm"),
        path.join(root, "public/pdfjs/wasm"),
      ],
      [
        path.join(root, "node_modules/pdfjs-dist/iccs"),
        path.join(root, "public/pdfjs/iccs"),
      ],
    ];
    for (const [from, to] of pairs) {
      if (!existsSync(from)) continue;
      mkdirSync(path.dirname(to), { recursive: true });
      rmSync(to, { recursive: true, force: true });
      cpSync(from, to, { recursive: true });
    }
  };

  return {
    name: "copy-pdfjs-assets",
    buildStart() {
      sync();
    },
    configureServer() {
      sync();
    },
  };
}
