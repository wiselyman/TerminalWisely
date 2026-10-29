import { describe, expect, it } from "vitest";
import {
  createMarkdownDocx,
  parseMarkdownExport,
  renderMarkdownHtml,
} from "./markWiselyExport";

describe("MarkWisely export renderers", () => {
  it("preserves common Markdown structure and inline formatting for DOCX", () => {
    const blocks = parseMarkdownExport([
      "# 会议记录",
      "中文 **重点** *斜体* ~~删除~~ `code` [链接](https://example.com)",
      "- 第一项\n- 第二项",
      "> 引用内容",
      "```ts\nconst answer = 42;\n```",
      "| 名称 | 状态 |\n| --- | --- |\n| 服务 | 正常 |",
    ].join("\n\n"));

    expect(blocks.map((block) => block.kind)).toEqual([
      "heading", "paragraph", "list", "quote", "code", "table",
    ]);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1, text: "会议记录" });
    expect(blocks[1]).toMatchObject({
      kind: "paragraph",
      runs: expect.arrayContaining([
        expect.objectContaining({ text: "重点", bold: true }),
        expect.objectContaining({ text: "斜体", italic: true }),
        expect.objectContaining({ text: "删除", strike: true }),
        expect.objectContaining({ text: "code", code: true }),
        expect.objectContaining({ text: "链接", href: "https://example.com" }),
      ]),
    });
    expect(blocks[2]).toMatchObject({
      kind: "list", ordered: false,
      items: [{ text: "第一项", level: 0 }, { text: "第二项", level: 0 }],
    });
    expect(blocks[3]).toMatchObject({ kind: "quote", text: "引用内容" });
    expect(blocks[4]).toMatchObject({ kind: "code", language: "ts", text: "const answer = 42;" });
    expect(blocks[5]).toMatchObject({ kind: "table", rows: [["名称", "状态"], ["服务", "正常"]] });
  });

  it("renders a styled standalone HTML document with escaped title and readable content", () => {
    const html = renderMarkdownHtml("# 标题\n\n中文正文 **重点**", "<script>alert(1)</script>");

    expect(html).toContain("Noto Sans CJK SC");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).toContain("<h1>标题</h1>");
    expect(html).toContain("<strong>重点</strong>");
    expect(html).not.toContain("<script>alert(1)</script>");
  });

  it("creates a DOCX archive", async () => {
    const bytes = await createMarkdownDocx("# 会议记录\n\n中文正文", "会议记录");

    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(Array.from(bytes.slice(0, 4))).toEqual([0x50, 0x4b, 0x03, 0x04]);
    expect(bytes.byteLength).toBeGreaterThan(1000);
  });
});
