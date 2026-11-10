import { describe, expect, it } from "vitest";
import {
  createRoundTripDocument,
  projectRoundTripDocument,
  restoreRoundTripProjection,
  serializeRoundTripDocument,
} from "./markdownSourceRoundTrip";

describe("markdown source round trip", () => {
  it("keeps front matter, raw HTML, unknown fenced blocks, footnotes, and references byte-for-byte", () => {
    const source = [
      "---", "title: Keep exact spacing", "custom: [one, two]", "---", "",
      "Editable paragraph.", "", "<widget data-a='1'>", "  raw   value", "</widget>", "",
      "```unknown-engine option=x", "  raw payload  ", "```", "",
      "[^note]: Footnote   text", "[reference]: ./target with spaces", "",
    ].join("\n");
    const model = createRoundTripDocument(source);
    const editable = model.segments.find((segment) => segment.editable);
    const output = serializeRoundTripDocument(model, { [editable!.id]: "Edited paragraph.\n" });

    expect(output).toContain("title: Keep exact spacing\ncustom: [one, two]");
    expect(output).toContain("<widget data-a='1'>\n  raw   value\n</widget>");
    expect(output).toContain("```unknown-engine option=x\n  raw payload  \n```");
    expect(output).toContain("[^note]: Footnote   text\n[reference]: ./target with spaces");
    expect(output).toContain("Edited paragraph.\n");
    expect(output).not.toContain("Editable paragraph.");
  });

  it("returns exact original source when no editable block changed", () => {
    const source = "# Heading\r\n\r\n<!-- raw -->\r\n";
    expect(serializeRoundTripDocument(createRoundTripDocument(source), {})).toBe(source);
  });

  it("keeps common language fences editable and treats an unclosed fence as compatibility content", () => {
    const known = createRoundTripDocument("```typescript\nconst answer = 42;\n```\n");
    expect(known.hasCompatibilityContent).toBe(false);
    const incomplete = createRoundTripDocument("```unknown-engine\nkeep this\n");
    expect(incomplete.hasCompatibilityContent).toBe(true);
    expect(serializeRoundTripDocument(incomplete, {})).toBe("```unknown-engine\nkeep this\n");
  });

  it("keeps Vditor-supported diagram fences editable while preserving unknown engines", () => {
    const mermaid = createRoundTripDocument("```mermaid\nflowchart TD\n  A --> B\n```\n");
    expect(mermaid.hasCompatibilityContent).toBe(false);
    expect(createRoundTripDocument("```unknown-engine\nraw block\n```\n").hasCompatibilityContent).toBe(true);
  });

  it("detects inline raw HTML and generic container directives conservatively", () => {
    for (const source of ["Keep <custom-inline data-x='1'>as-is</custom-inline>\n", "::: note\ncustom directive\n:::\n"]) {
      expect(createRoundTripDocument(source).hasCompatibilityContent).toBe(true);
    }
  });

  it("classifies compatibility spans without changing their exact source", () => {
    const source = [
      "---", "title: exact", "---", "", "Editable paragraph.", "",
      "<widget data-a='1'>", "  untouched", "</widget>", "",
      "```unknown-engine", "opaque", "```", "", "[^n]: reference text", "",
    ].join("\n");
    const model = createRoundTripDocument(source);

    expect(model.segments.filter((segment) => !segment.editable).map((segment) => segment.compatibilityKind)).toEqual([
      "front-matter", "raw-html", "unknown-fence", "reference-definition",
    ]);
    expect(model.segments.filter((segment) => !segment.editable).map((segment) => segment.source)).toEqual([
      "---\ntitle: exact\n---\n",
      "<widget data-a='1'>\n  untouched\n</widget>\n",
      "```unknown-engine\nopaque\n```\n",
      "[^n]: reference text\n",
    ]);
  });

  it("restores untouched spans byte-for-byte after supported prose changes", () => {
    const source = [
      "---", "title: Keep exact spacing", "---", "", "Editable paragraph.", "",
      "<widget data-a='1'>", "  raw   value", "</widget>", "",
      "```unknown-engine option=x", "  raw payload  ", "```", "",
    ].join("\n");
    const model = createRoundTripDocument(source);
    const projection = projectRoundTripDocument(model);
    const editedProjection = projection.source.replace("Editable paragraph.", "Edited paragraph.");

    expect(projection.anchors).toHaveLength(3);
    const restored = restoreRoundTripProjection(model, projection, editedProjection);
    expect(restored).toBe(source.replace("Editable paragraph.", "Edited paragraph."));
    expect(restored).toContain("<widget data-a='1'>\n  raw   value\n</widget>");
    expect(restored).toContain("```unknown-engine option=x\n  raw payload  \n```");
    expect(restored).not.toContain("TW_COMPATIBILITY_ANCHOR");
  });

  it("refuses serialization if an editor projection loses a compatibility anchor", () => {
    const model = createRoundTripDocument("Editable.\n\n<raw>keep</raw>\n");
    const projection = projectRoundTripDocument(model);

    expect(() => restoreRoundTripProjection(model, projection, "Editable.\n")).toThrow(/compatibility anchor/i);
  });

  it("uses distinct anchors for duplicate compatibility spans and preserves CRLF bytes", () => {
    const source = "First.\r\n\r\n<raw>same</raw>\r\n\r\nMiddle.\r\n\r\n<raw>same</raw>\r\n";
    const model = createRoundTripDocument(source);
    const projection = projectRoundTripDocument(model);
    expect(projection.anchors).toHaveLength(2);
    expect(new Set(projection.anchors.map((anchor) => anchor.token)).size).toBe(2);
    expect(restoreRoundTripProjection(model, projection, projection.source.replace("Middle.", "Changed."))).toBe(
      source.replace("Middle.", "Changed."),
    );
  });
});
