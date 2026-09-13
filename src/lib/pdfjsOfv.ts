import * as pdfjs from "pdfjs-dist";

/** Absolute `/pdfjs/…` base — pdf.js only treats http(s) URLs as fetchable. */
export function pdfjsAssetBase(href = globalThis.location?.href): string {
  if (!href) return "http://localhost/pdfjs/";
  try {
    return new URL("pdfjs/", href).href;
  } catch {
    return "http://localhost/pdfjs/";
  }
}

export function pdfjsCmapUrl(base = pdfjsAssetBase()): string {
  return `${base}cmaps/`;
}

export function pdfjsStandardFontUrl(base = pdfjsAssetBase()): string {
  return `${base}standard_fonts/`;
}

export function pdfjsWasmUrl(base = pdfjsAssetBase()): string {
  return `${base}wasm/`;
}

export function pdfjsIccUrl(base = pdfjsAssetBase()): string {
  return `${base}iccs/`;
}

type GetDocumentSrc = Parameters<typeof pdfjs.getDocument>[0];

type InitParams = Exclude<
  GetDocumentSrc,
  string | URL | ArrayBuffer | ArrayBufferView | undefined
>;

function asInitParams(src: GetDocumentSrc = {}): InitParams {
  if (typeof src === "string" || src instanceof URL) {
    return { url: src };
  }
  if (src instanceof ArrayBuffer) {
    return { data: src };
  }
  if (ArrayBuffer.isView(src)) {
    return { data: src as Exclude<InitParams["data"], undefined> };
  }
  return { ...(src as InitParams) };
}

/** Inject local wasm/icc (+ default cMap/fonts) for OFV getDocument calls. */
export function injectPdfjsAssetUrls(
  src: GetDocumentSrc = {},
  assetBase = pdfjsAssetBase(),
): InitParams {
  const params = asInitParams(src);
  return {
    ...params,
    cMapUrl: params.cMapUrl ?? pdfjsCmapUrl(assetBase),
    cMapPacked: params.cMapPacked ?? true,
    standardFontDataUrl:
      params.standardFontDataUrl ?? pdfjsStandardFontUrl(assetBase),
    wasmUrl: params.wasmUrl ?? pdfjsWasmUrl(assetBase),
    iccUrl: params.iccUrl ?? pdfjsIccUrl(assetBase),
  };
}

/**
 * pdf.js 5+/6 needs `wasmUrl` for JBIG2/JPEG2000/QCMS. OFV does not forward it,
 * so wrap getDocument and inject local runtime assets.
 */
export function createOfvPdfjsModule(assetBase = pdfjsAssetBase()) {
  return {
    get version() {
      return pdfjs.version;
    },
    get GlobalWorkerOptions() {
      return pdfjs.GlobalWorkerOptions;
    },
    getDocument(src: GetDocumentSrc = {}) {
      return pdfjs.getDocument(injectPdfjsAssetUrls(src, assetBase));
    },
  };
}
