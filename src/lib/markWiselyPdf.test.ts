import { describe, expect, it } from "vitest";
import { createMarkdownPdfDefinition } from "./markWiselyPdf";

describe("MarkWisely PDF layout", () => {
  it("creates a paginated A4 layout with title, CJK text, headings, tables, quotes, and code", () => {
    const definition = createMarkdownPdfDefinition([
      "# 中文标题",
      "正文中有 **重点** 内容。",
      "> 需要保留的引用。",
      "```ts\nconst value = '中文';\n```",
      "| 名称 | 状态 |\n| --- | --- |\n| 服务 | 正常 |",
    ].join("\n\n"), "测试报告.md");

    expect(definition.pageSize).toBe("A4");
    expect(definition.info.title).toBe("测试报告");
    expect(definition.defaultStyle.font).toBe("NotoSansSC");
    expect(definition.footer(2, 3).columns).toEqual([
      expect.objectContaining({ text: "MarkWisely" }),
      expect.objectContaining({ text: "2 / 3" }),
    ]);
    expect(definition.content[0]).toMatchObject({ text: "测试报告", style: "documentTitle" });
    expect(definition.content[2]).toMatchObject({ text: [{ text: "中文标题" }], style: "heading1" });
    expect(definition.content[3]).toMatchObject({
      text: [{ text: "正文中有 " }, { text: "重点", bold: true }, { text: " 内容。" }],
      style: "body",
    });
    expect(definition.content[4]).toMatchObject({ text: [{ text: "需要保留的引用。" }], style: "quote" });
    expect(definition.content[5]).toMatchObject({
      table: { body: [[{ text: "const value = '中文';", style: "code" }]] },
    });
    expect(definition.content[6]).toMatchObject({ table: { headerRows: 1 } });
  });
});
