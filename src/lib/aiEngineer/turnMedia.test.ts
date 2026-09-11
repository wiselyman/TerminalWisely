import { describe, expect, it } from "vitest";
import {
  collectTurnImageMedia,
  extractToolImageMedia,
  markdownHasImage,
} from "./turnMedia";

describe("extractToolImageMedia", () => {
  it("reads media_id from image tool payload", () => {
    const ref = extractToolImageMedia(
      JSON.stringify({
        ok: true,
        kind: "image",
        media_id: "a".repeat(64),
        url: "https://example.com/a.png",
      }),
    );
    expect(ref?.mediaId).toBe("a".repeat(64));
    expect(ref?.sourceUrl).toContain("example.com");
  });

  it("ignores non-image payloads", () => {
    expect(
      extractToolImageMedia(JSON.stringify({ ok: true, kind: "html", text: "x" })),
    ).toBeNull();
  });

  it("reads media_id from HTML page with extracted images", () => {
    const id = "c".repeat(64);
    const ref = extractToolImageMedia(
      JSON.stringify({
        ok: true,
        kind: "html",
        media_id: id,
        images: [{ media_id: id, url: "https://example.com/hero.png" }],
        markdown: `![](media:${id})`,
      }),
    );
    expect(ref?.mediaId).toBe(id);
  });
});

describe("collectTurnImageMedia", () => {
  it("collects unique images after the latest user", () => {
    const id = "b".repeat(64);
    const msgs = [
      { kind: "user" },
      {
        kind: "tool",
        output: JSON.stringify({ ok: true, kind: "image", media_id: id }),
      },
      { kind: "assistant" },
    ];
    expect(collectTurnImageMedia(msgs, 2)).toEqual([{ mediaId: id }]);
  });

  it("collects all images[] from an HTML tool result", () => {
    const a = "a".repeat(64);
    const b = "b".repeat(64);
    const msgs = [
      { kind: "user" },
      {
        kind: "tool",
        output: JSON.stringify({
          ok: true,
          kind: "html",
          media_id: a,
          images: [
            { media_id: a, url: "https://ex/a.png" },
            { media_id: b, url: "https://ex/b.png" },
          ],
        }),
      },
    ];
    expect(collectTurnImageMedia(msgs, 1)).toEqual([
      { mediaId: a, sourceUrl: "https://ex/a.png" },
      { mediaId: b, sourceUrl: "https://ex/b.png" },
    ]);
  });
});

describe("markdownHasImage", () => {
  it("detects markdown and html images", () => {
    expect(markdownHasImage("see ![](https://x/a.png)")).toBe(true);
    expect(markdownHasImage('<img src="x">')).toBe(true);
    expect(markdownHasImage("no image here")).toBe(false);
  });
});
