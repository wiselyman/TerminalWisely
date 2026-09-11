import { describe, expect, it } from "vitest";
import { looksLikeImageUrl, mediaDisplaySrc } from "./chatMedia";

describe("looksLikeImageUrl", () => {
  it("detects common image extensions", () => {
    expect(looksLikeImageUrl("https://cdn.example.com/a/b.png")).toBe(true);
    expect(looksLikeImageUrl("https://cdn.example.com/a.jpg?x=1")).toBe(true);
    expect(looksLikeImageUrl("https://example.com/page")).toBe(false);
  });
});

describe("mediaDisplaySrc", () => {
  it("prefers data_url", () => {
    expect(
      mediaDisplaySrc({
        media_id: "abc",
        path: "/tmp/x.png",
        content_type: "image/png",
        bytes: 3,
        data_url: "data:image/png;base64,aaa",
      }),
    ).toBe("data:image/png;base64,aaa");
  });

  it("rejects bare filesystem paths", () => {
    expect(() =>
      mediaDisplaySrc({
        media_id: "abc",
        path: "/tmp/x.png",
        content_type: "image/png",
        bytes: 3,
        data_url: "",
      }),
    ).toThrow(/media_missing_data_url/);
  });
});
