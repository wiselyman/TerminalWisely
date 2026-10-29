import notoSansScFontUrl from "../assets/fonts/NotoSansSC-Regular-subset.ttf?url";
import { parseMarkdownExport, type ExportBlock, type ExportInlineRun } from "./markWiselyExport";

type PdfRun = {
  text: string;
  bold?: boolean;
  italics?: boolean;
  decoration?: "lineThrough";
  font?: string;
  color?: string;
  link?: string;
  background?: string;
};

type PdfNode = Record<string, unknown>;
type PdfDefinition = {
  pageSize: "A4";
  pageMargins: [number, number, number, number];
  info: { title: string; author: string; subject: string };
  defaultStyle: { font: string; fontSize: number; color: string; lineHeight: number };
  styles: Record<string, PdfNode>;
  header: (page: number, pageCount: number) => PdfNode;
  footer: (page: number, pageCount: number) => PdfNode;
  content: PdfNode[];
};

const FONT_FILE = "NotoSansSC-Regular-subset.ttf";
const FONT_FAMILY = "NotoSansSC";
const muted = "#718096";

function inline(runs: ExportInlineRun[]): PdfRun[] {
  return runs.map((run) => ({
    text: run.text,
    ...(run.bold ? { bold: true } : {}),
    ...(run.italic ? { italics: true } : {}),
    ...(run.strike ? { decoration: "lineThrough" as const } : {}),
    ...(run.code ? { background: "#EEF2F7", color: "#31415A" } : {}),
    ...(run.href ? { link: run.href, color: "#245FC7" } : {}),
  }));
}

function blockToPdfNode(block: ExportBlock): PdfNode {
  switch (block.kind) {
    case "heading":
      return {
        text: inline(block.runs),
        style: `heading${Math.min(4, Math.max(1, block.level))}`,
        margin: [0, block.level === 1 ? 18 : 13, 0, 7],
        headlineLevel: block.level,
        keepWithNext: true,
      };
    case "paragraph":
      return { text: inline(block.runs), style: "body", margin: [0, 0, 0, 9] };
    case "list": {
      const items = block.items.map((item) => ({
        text: inline([{ text: item.checked === undefined ? item.text : `${item.checked ? "☑" : "☐"} ${item.text}` }]),
        ...(item.level > 0 ? { margin: [item.level * 14, 0, 0, 0] } : {}),
      }));
      return { [block.ordered ? "ol" : "ul"]: items, style: "list", margin: [0, 0, 0, 10] };
    }
    case "quote":
      return {
        text: inline(block.runs),
        style: "quote",
        background: "#F3F6FB",
        margin: [10, 3, 10, 13],
        border: [3, 0, 0, 0],
        borderColor: "#4B7BEC",
      };
    case "code":
      return {
        table: { widths: ["*"], body: [[{ text: block.text || " ", style: "code" }]] },
        layout: {
          hLineWidth: () => 0,
          vLineWidth: () => 0,
          paddingLeft: () => 11,
          paddingRight: () => 11,
          paddingTop: () => 8,
          paddingBottom: () => 8,
          fillColor: () => "#F4F6F9",
        },
        margin: [0, 3, 0, 12],
      };
    case "table": {
      if (!block.rows.length) return { text: "", margin: [0, 0, 0, 0] };
      const columns = Math.max(1, ...block.rows.map((row) => row.length));
      return {
        table: {
          headerRows: 1,
          widths: Array.from({ length: columns }, () => "*"),
          body: block.rows.map((row, index) => Array.from({ length: columns }, (_, column) => ({
            text: row[column] ?? "",
            style: index === 0 ? "tableHeader" : "tableCell",
          }))),
        },
        layout: "lightHorizontalLines",
        margin: [0, 5, 0, 12],
      };
    }
    case "rule":
      return {
        canvas: [{ type: "line", x1: 0, y1: 0, x2: 500, y2: 0, lineWidth: 0.7, lineColor: "#DCE3EB" }],
        margin: [0, 8, 0, 13],
      };
  }
}

export function createMarkdownPdfDefinition(markdown: string, title: string): PdfDefinition {
  const displayTitle = title.replace(/\.(md|markdown)$/i, "");
  return {
    pageSize: "A4",
    pageMargins: [54, 60, 54, 54],
    info: { title: displayTitle, author: "MarkWisely", subject: "Markdown document export" },
    defaultStyle: { font: FONT_FAMILY, fontSize: 10.5, color: "#263347", lineHeight: 1.42 },
    styles: {
      documentTitle: { fontSize: 24, bold: true, color: "#172033", lineHeight: 1.2 },
      heading1: { fontSize: 18, bold: true, color: "#172033", lineHeight: 1.25 },
      heading2: { fontSize: 15, bold: true, color: "#22324A", lineHeight: 1.3 },
      heading3: { fontSize: 12.5, bold: true, color: "#2F4059" },
      heading4: { fontSize: 11.5, bold: true, color: "#40516A" },
      body: { fontSize: 10.5, lineHeight: 1.5 },
      list: { fontSize: 10.5, lineHeight: 1.42 },
      quote: { fontSize: 10.5, color: "#536278", italics: true, lineHeight: 1.45 },
      code: { font: FONT_FAMILY, fontSize: 8.5, color: "#31415A", lineHeight: 1.28, preserveLeadingSpaces: true },
      tableHeader: { fontSize: 9.5, bold: true, color: "#263347", fillColor: "#EEF2F7", margin: [6, 5, 6, 5] },
      tableCell: { fontSize: 9.5, margin: [6, 5, 6, 5] },
    },
    header: () => ({
      canvas: [{ type: "line", x1: 54, y1: 39, x2: 541, y2: 39, lineWidth: 0.6, lineColor: "#E0E6EE" }],
      margin: [0, 0, 0, 0],
    }),
    footer: (page, pageCount) => ({
      columns: [
        { text: "MarkWisely", color: muted, fontSize: 8 },
        { text: `${page} / ${pageCount}`, alignment: "right", color: muted, fontSize: 8 },
      ],
      margin: [54, 20, 54, 0],
    }),
    content: [
      { text: displayTitle || "Untitled", style: "documentTitle", margin: [0, 0, 0, 13] },
      { canvas: [{ type: "line", x1: 0, y1: 0, x2: 487, y2: 0, lineWidth: 1.1, lineColor: "#D8E0EA" }], margin: [0, 0, 0, 15] },
      ...parseMarkdownExport(markdown).map(blockToPdfNode),
    ],
  };
}

let fontBase64Promise: Promise<string> | undefined;

async function getFontBase64(): Promise<string> {
  fontBase64Promise ??= fetch(notoSansScFontUrl).then(async (response) => {
    if (!response.ok) throw new Error(`Unable to load PDF font (${response.status})`);
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
  });
  return fontBase64Promise;
}

export async function createMarkdownPdf(markdown: string, title: string): Promise<Uint8Array> {
  const [fontData, { default: pdfMake }] = await Promise.all([
    getFontBase64(),
    import("pdfmake/build/pdfmake"),
  ]);
  pdfMake.addVirtualFileSystem({ [FONT_FILE]: fontData });
  pdfMake.addFonts({
    [FONT_FAMILY]: {
      normal: FONT_FILE,
      bold: FONT_FILE,
      italics: FONT_FILE,
      bolditalics: FONT_FILE,
    },
  });
  const bytes = await pdfMake.createPdf(createMarkdownPdfDefinition(markdown, title)).getBuffer();
  return new Uint8Array(bytes);
}
