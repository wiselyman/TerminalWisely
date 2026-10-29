import { Document, ExternalHyperlink, HeadingLevel, Paragraph, Packer, ShadingType, Table, TableCell, TableRow, TextRun, WidthType, type IParagraphOptions, type ParagraphChild } from "docx";
import { marked, type Token, type Tokens } from "marked";

export type ExportInlineRun = {
  text: string;
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
};

export type ExportListItem = { text: string; level: number; checked?: boolean };

export type ExportBlock =
  | { kind: "heading"; level: number; text: string; runs: ExportInlineRun[] }
  | { kind: "paragraph"; text: string; runs: ExportInlineRun[] }
  | { kind: "list"; ordered: boolean; items: ExportListItem[] }
  | { kind: "quote"; text: string; runs: ExportInlineRun[] }
  | { kind: "code"; text: string; language: string }
  | { kind: "table"; rows: string[][] }
  | { kind: "rule" };

const bodyFont = `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif`;
const codeFont = `"SFMono-Regular", Consolas, "Liberation Mono", "Noto Sans Mono", monospace`;

function textOf(runs: ExportInlineRun[]): string {
  return runs.map((run) => run.text).join("");
}

function inlineRuns(tokens: Token[] | undefined, marks: Omit<ExportInlineRun, "text"> = {}): ExportInlineRun[] {
  const result: ExportInlineRun[] = [];
  for (const token of tokens ?? []) {
    switch (token.type) {
      case "strong":
      case "em":
      case "del": {
        const styledToken = token as Tokens.Strong | Tokens.Em | Tokens.Del;
        const nested = inlineRuns(styledToken.tokens, {
          ...marks,
          ...(styledToken.type === "strong" ? { bold: true } : {}),
          ...(styledToken.type === "em" ? { italic: true } : {}),
          ...(styledToken.type === "del" ? { strike: true } : {}),
        });
        result.push(...nested);
        break;
      }
      case "link":
        {
          const linkToken = token as Tokens.Link;
          result.push(...inlineRuns(linkToken.tokens, { ...marks, ...(safeHref(linkToken.href) ? { href: linkToken.href } : {}) }));
        }
        break;
      case "codespan":
        result.push({ text: (token as Tokens.Codespan).text, ...marks, code: true });
        break;
      case "br":
        result.push({ text: "\n", ...marks });
        break;
      case "image":
        if (token.text) result.push({ text: token.text, ...marks });
        break;
      case "text":
        {
          const textToken = token as Tokens.Text;
          result.push(...(textToken.tokens ? inlineRuns(textToken.tokens, marks) : [{ text: textToken.text, ...marks }]));
        }
        break;
      case "escape":
        result.push({ text: (token as Tokens.Escape).text, ...marks });
        break;
      case "html":
        // Raw HTML is intentionally omitted from exports.
        break;
      default:
        if ("text" in token && typeof token.text === "string") result.push({ text: token.text, ...marks });
        break;
    }
  }
  return result;
}

function listItems(token: Tokens.List, level = 0): ExportListItem[] {
  return token.items.flatMap((item) => {
    const currentRuns: ExportInlineRun[] = [];
    const nested: ExportListItem[] = [];
    for (const child of item.tokens) {
      if (child.type === "list") nested.push(...listItems(child as Tokens.List, level + 1));
      else currentRuns.push(...inlineRuns([child]));
    }
    const currentText = textOf(currentRuns).trim();
    const own = currentText || item.text.trim()
      ? [{ text: currentText || item.text.trim(), level, ...(item.task ? { checked: item.checked } : {}) }]
      : [];
    return [...own, ...nested];
  });
}

function quoteContent(tokens: Token[]): ExportInlineRun[] {
  const runs: ExportInlineRun[] = [];
  for (const [index, token] of tokens.entries()) {
    if (index > 0 && (token.type === "paragraph" || token.type === "heading")) runs.push({ text: "\n" });
    if (token.type === "paragraph") runs.push(...inlineRuns((token as Tokens.Paragraph).tokens));
    else if (token.type === "heading") runs.push(...inlineRuns((token as Tokens.Heading).tokens));
    else if (token.type === "list") runs.push(...listItems(token as Tokens.List).map((item) => ({ text: `${"  ".repeat(item.level)}• ${item.text}\n` })));
    else if (token.type === "code") runs.push({ text: (token as Tokens.Code).text, code: true });
  }
  return runs;
}

export function parseMarkdownExport(markdown: string): ExportBlock[] {
  const tokens = marked.lexer(markdown, { gfm: true });
  return tokens.flatMap((token): ExportBlock[] => {
    switch (token.type) {
      case "heading": {
        {
          const heading = token as Tokens.Heading;
          const runs = inlineRuns(heading.tokens);
          return [{ kind: "heading", level: heading.depth, text: textOf(runs), runs }];
        }
      }
      case "paragraph": {
        const runs = inlineRuns((token as Tokens.Paragraph).tokens);
        return [{ kind: "paragraph", text: textOf(runs), runs }];
      }
      case "text": {
        const textToken = token as Tokens.Text;
        const runs = inlineRuns(textToken.tokens ?? [textToken]);
        return [{ kind: "paragraph", text: textOf(runs), runs }];
      }
      case "list":
        {
          const list = token as Tokens.List;
          return [{ kind: "list", ordered: list.ordered, items: listItems(list) }];
        }
      case "blockquote": {
        const runs = quoteContent((token as Tokens.Blockquote).tokens);
        return [{ kind: "quote", text: textOf(runs), runs }];
      }
      case "code":
        {
          const code = token as Tokens.Code;
          return [{ kind: "code", text: code.text, language: code.lang?.split(/[\s,]/)[0] ?? "" }];
        }
      case "table":
        {
          const table = token as Tokens.Table;
          return [{ kind: "table", rows: [table.header, ...table.rows].map((row) => row.map((cell) => textOf(inlineRuns(cell.tokens)))) }];
        }
      case "hr":
        return [{ kind: "rule" }];
      default:
        return [];
    }
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character] ?? character);
}

function safeHref(value: string): boolean {
  const href = value.trim();
  if (!href || /[\u0000-\u001f]/.test(href)) return false;
  if (/^[a-z][a-z\d+.-]*:/i.test(href)) return /^(https?:|mailto:)/i.test(href);
  return !href.startsWith("//");
}

function renderRuns(runs: ExportInlineRun[]): string {
  return runs.map((run) => {
    let output = escapeHtml(run.text).replace(/\n/g, "<br>");
    if (run.code) output = `<code>${output}</code>`;
    if (run.strike) output = `<del>${output}</del>`;
    if (run.italic) output = `<em>${output}</em>`;
    if (run.bold) output = `<strong>${output}</strong>`;
    if (run.href && safeHref(run.href)) output = `<a href="${escapeHtml(run.href)}">${output}</a>`;
    return output;
  }).join("");
}

function renderBlocks(blocks: ExportBlock[]): string {
  return blocks.map((block) => {
    switch (block.kind) {
      case "heading":
        return `<h${Math.min(6, Math.max(1, block.level))}>${renderRuns(block.runs)}</h${Math.min(6, Math.max(1, block.level))}>`;
      case "paragraph":
        return `<p>${renderRuns(block.runs)}</p>`;
      case "list": {
        const tag = block.ordered ? "ol" : "ul";
        const items = block.items.map((item) => `<li style="margin-left:${item.level * 1.35}em">${item.checked === undefined ? "" : item.checked ? "☑ " : "☐ "}${escapeHtml(item.text)}</li>`).join("");
        return `<${tag}>${items}</${tag}>`;
      }
      case "quote":
        return `<blockquote>${renderRuns(block.runs)}</blockquote>`;
      case "code":
        return `<pre><code${block.language ? ` class="language-${escapeHtml(block.language)}"` : ""}>${escapeHtml(block.text)}</code></pre>`;
      case "table": {
        const [head = [], ...body] = block.rows;
        return `<table><thead><tr>${head.map((cell) => `<th>${escapeHtml(cell)}</th>`).join("")}</tr></thead><tbody>${body.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
      }
      case "rule":
        return "<hr>";
    }
  }).join("\n");
}

function htmlDocument(markdown: string, title: string): string {
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data: https:;"><title>${escapeHtml(title)}</title><style>
*{box-sizing:border-box}body{max-width:880px;margin:0 auto;padding:56px 64px;color:#1f2937;background:#fff;font-family:${bodyFont};font-size:11pt;line-height:1.75;overflow-wrap:anywhere}.document-title{margin:0 0 2.2em;padding-bottom:.7em;border-bottom:1px solid #d9e0e8;color:#172033;font-size:25pt;line-height:1.25}h1,h2,h3,h4,h5,h6{margin:1.5em 0 .6em;color:#172033;line-height:1.35}h1{font-size:22pt}h2{font-size:17pt}h3{font-size:14pt}p{margin:.6em 0 1em}ul,ol{padding-left:1.8em;margin:.5em 0 1.2em}li{padding-left:.3em;margin:.25em 0}blockquote{margin:1.2em 0;padding:.4em 1.1em;border-left:3px solid #4b7bec;background:#f5f8fc;color:#526174}pre{margin:1em 0;padding:1em 1.15em;border:1px solid #e1e7ee;border-radius:7px;background:#f6f8fa;color:#253044;font:9.5pt/1.55 ${codeFont};white-space:pre-wrap;overflow-wrap:anywhere}code{padding:.12em .34em;border-radius:4px;background:#f1f4f8;font-family:${codeFont};font-size:.92em}pre code{padding:0;background:transparent;font-size:inherit}table{width:100%;margin:1.1em 0;border-collapse:collapse;font-size:10pt}th,td{padding:.58em .72em;border:1px solid #d7dee7;text-align:left;vertical-align:top}th{background:#f1f5f9;color:#263347;font-weight:650}tr:nth-child(even) td{background:#fafbfd}a{color:#245fc7;text-decoration:none}hr{height:1px;margin:1.8em 0;border:0;background:#dce3eb}.export-content> :first-child{margin-top:0}
</style></head><body><header><h1 class="document-title">${escapeHtml(title)}</h1></header><main class="export-content">${renderBlocks(parseMarkdownExport(markdown))}</main></body></html>`;
}

export function renderMarkdownHtml(markdown: string, title: string): string {
  return htmlDocument(markdown, title);
}

const wordFonts = { ascii: "Aptos", hAnsi: "Aptos", eastAsia: "Microsoft YaHei", cs: "Aptos" };
const tableBorder = { style: "single" as const, size: 4, color: "D7DEE7" };

function docxRuns(runs: ExportInlineRun[]): ParagraphChild[] {
  return runs.flatMap((run): ParagraphChild[] => {
    const options = {
      text: run.text,
      bold: run.bold,
      italics: run.italic,
      strike: run.strike,
      font: run.code ? { ascii: "Cascadia Code", hAnsi: "Cascadia Code", eastAsia: "Microsoft YaHei" } : wordFonts,
      color: run.href && safeHref(run.href) ? "245FC7" : undefined,
      underline: run.href && safeHref(run.href) ? {} : undefined,
      size: run.code ? 19 : 22,
    };
    if (run.href && safeHref(run.href)) {
      return [new ExternalHyperlink({ link: run.href, children: [new TextRun(options)] })];
    }
    return [new TextRun(options)];
  });
}

function docxParagraph(text: string, options: IParagraphOptions = {}): Paragraph {
  return new Paragraph({
    ...options,
    children: options.children ?? [new TextRun({ text, font: wordFonts, size: 22 })],
    spacing: { after: 150, line: 340, ...options.spacing },
  });
}

function docxCell(value: string, header: boolean): TableCell {
  return new TableCell({
    children: [docxParagraph(value, { spacing: { after: 30, line: 280 } })],
    shading: header ? { type: ShadingType.CLEAR, color: "F1F5F9", fill: "F1F5F9" } : undefined,
    margins: { top: 90, bottom: 90, left: 120, right: 120 },
    borders: { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder },
  });
}

function docxBlocks(blocks: ExportBlock[]): (Paragraph | Table)[] {
  const children: (Paragraph | Table)[] = [];
  for (const block of blocks) {
    switch (block.kind) {
      case "heading": {
        const level = Math.min(6, Math.max(1, block.level));
        const heading = [HeadingLevel.HEADING_1, HeadingLevel.HEADING_2, HeadingLevel.HEADING_3, HeadingLevel.HEADING_4, HeadingLevel.HEADING_5, HeadingLevel.HEADING_6][level - 1];
        children.push(docxParagraph("", {
          heading,
          children: docxRuns(block.runs),
          spacing: { before: level === 1 ? 320 : 240, after: 100, line: 300 },
          keepNext: true,
        }));
        break;
      }
      case "paragraph":
        children.push(docxParagraph("", { children: docxRuns(block.runs) }));
        break;
      case "list":
        block.items.forEach((item, index) => {
          const marker = item.checked === undefined ? block.ordered ? `${index + 1}. ` : "• " : item.checked ? "☑ " : "☐ ";
          children.push(docxParagraph("", {
            children: [new TextRun({ text: marker, font: wordFonts, size: 22 }), new TextRun({ text: item.text, font: wordFonts, size: 22 })],
            indent: { left: 420 + item.level * 360, hanging: 240 },
            spacing: { after: 75, line: 320 },
          }));
        });
        break;
      case "quote":
        children.push(docxParagraph("", {
          children: docxRuns(block.runs.map((run) => ({ ...run, italic: true }))),
          indent: { left: 420, right: 240 },
          border: { left: { style: "single", size: 16, color: "4B7BEC", space: 8 } },
          shading: { type: ShadingType.CLEAR, color: "F5F8FC", fill: "F5F8FC" },
          spacing: { before: 120, after: 180, line: 340 },
        }));
        break;
      case "code":
        for (const line of (block.text || " ").split("\n")) {
          children.push(docxParagraph(line, {
            indent: { left: 180, right: 180 },
            shading: { type: ShadingType.CLEAR, color: "F6F8FA", fill: "F6F8FA" },
            border: { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder },
            spacing: { before: 0, after: 0, line: 280 },
            run: { font: { ascii: "Cascadia Code", hAnsi: "Cascadia Code", eastAsia: "Microsoft YaHei" }, size: 19, color: "253044" },
          }));
        }
        children.push(docxParagraph("", { spacing: { after: 140 } }));
        break;
      case "table": {
        if (!block.rows.length) break;
        const columnCount = Math.max(1, ...block.rows.map((row) => row.length));
        const rows = block.rows.map((row, rowIndex) => new TableRow({
          children: Array.from({ length: columnCount }, (_, column) => docxCell(row[column] ?? "", rowIndex === 0)),
          tableHeader: rowIndex === 0,
        }));
        children.push(new Table({
          rows,
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: { top: tableBorder, bottom: tableBorder, left: tableBorder, right: tableBorder, insideHorizontal: tableBorder, insideVertical: tableBorder },
        }));
        children.push(docxParagraph("", { spacing: { after: 100 } }));
        break;
      }
      case "rule":
        children.push(docxParagraph("", { border: { bottom: { style: "single", size: 4, color: "DCE3EB", space: 1 } }, spacing: { after: 220 } }));
        break;
    }
  }
  return children.length ? children : [docxParagraph("")];
}

export async function createMarkdownDocx(markdown: string, title: string): Promise<Uint8Array> {
  const documentTitle = new Paragraph({
    children: [new TextRun({ text: title, bold: true, font: wordFonts, size: 36, color: "172033" })],
    spacing: { after: 360, line: 420 },
    keepNext: true,
  });
  const doc = new Document({
    title,
    creator: "MarkWisely",
    styles: {
      default: {
        document: {
          run: { font: wordFonts, size: 22, color: "1F2937" },
          paragraph: { spacing: { after: 150, line: 340 } },
        },
      },
      paragraphStyles: [
        { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: wordFonts, size: 36, bold: true, color: "172033" }, paragraph: { spacing: { before: 320, after: 120 }, keepNext: true } },
        { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: wordFonts, size: 30, bold: true, color: "172033" }, paragraph: { spacing: { before: 260, after: 100 }, keepNext: true } },
        { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { font: wordFonts, size: 26, bold: true, color: "172033" }, paragraph: { spacing: { before: 220, after: 90 }, keepNext: true } },
      ],
    },
    sections: [{
      properties: { page: { margin: { top: 1080, right: 1080, bottom: 1080, left: 1080 } } },
      children: [documentTitle, ...docxBlocks(parseMarkdownExport(markdown))],
    }],
  });
  const blob = await Packer.toBlob(doc);
  return new Uint8Array(await blob.arrayBuffer());
}
