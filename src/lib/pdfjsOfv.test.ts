import { beforeAll, describe, expect, it, vi } from "vitest";

// pdfjs-dist 6 touches global Iterator (Node 22+). CI still pins Node 20 for
// other steps — stub the module so URL-helper unit tests stay Node-20-safe.
vi.mock("pdfjs-dist", () => ({
  version: "0.0.0-test",
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: vi.fn(),
}));

import {
  injectPdfjsAssetUrls,
  pdfjsAssetBase,
  pdfjsCmapUrl,
  pdfjsIccUrl,
  pdfjsWasmUrl,
} from "./pdfjsOfv";

describe("pdfjsOfv", () => {
  beforeAll(() => {
    // Ensure mock settled before assertions (vitest hoists vi.mock).
  });

  it("builds http(s) absolute asset URLs for pdf.js fetch validation", () => {
    const base = pdfjsAssetBase("http://localhost:1420/");
    expect(base).toBe("http://localhost:1420/pdfjs/");
    expect(pdfjsCmapUrl(base)).toBe("http://localhost:1420/pdfjs/cmaps/");
    expect(pdfjsWasmUrl(base)).toBe("http://localhost:1420/pdfjs/wasm/");
    expect(pdfjsIccUrl(base)).toBe("http://localhost:1420/pdfjs/iccs/");
  });

  it("injects wasm/icc when OFV only passes data + cMapUrl", () => {
    const data = new Uint8Array([1, 2, 3]);
    const base = "http://localhost:1420/pdfjs/";
    const out = injectPdfjsAssetUrls(
      {
        data,
        cMapUrl: `${base}cmaps/`,
        cMapPacked: true,
        standardFontDataUrl: `${base}standard_fonts/`,
      },
      base,
    );

    expect(out.data).toBe(data);
    expect(out.wasmUrl).toBe(`${base}wasm/`);
    expect(out.iccUrl).toBe(`${base}iccs/`);
    expect(out.cMapPacked).toBe(true);
  });

  it("does not overwrite explicit wasmUrl", () => {
    const out = injectPdfjsAssetUrls(
      { url: "blob:test", wasmUrl: "/custom/wasm/" },
      "http://localhost:1420/pdfjs/",
    );
    expect(out.wasmUrl).toBe("/custom/wasm/");
    expect(out.iccUrl).toBe("http://localhost:1420/pdfjs/iccs/");
  });
});
