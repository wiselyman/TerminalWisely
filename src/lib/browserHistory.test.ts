import { describe, expect, it } from "vitest";
import {
  isBookmarked,
  scoreHistoryMatch,
  suggestHistory,
  type BrowserBookmark,
  type BrowserHistoryEntry,
} from "./browserHistory";

const entries: BrowserHistoryEntry[] = [
  {
    url: "https://example.com/docs",
    title: "Docs",
    profile_key: "a@h:22",
    visited_at: 300,
  },
  {
    url: "http://127.0.0.1:8096/",
    title: "Local",
    profile_key: "a@h:22",
    visited_at: 200,
  },
  {
    url: "https://example.com/",
    title: "Example",
    profile_key: "b@other:22",
    visited_at: 400,
  },
];

describe("browserHistory suggest", () => {
  it("prefers active profile and prefix matches", () => {
    const hits = suggestHistory("example", entries, "a@h:22", 5);
    expect(hits[0]?.url).toBe("https://example.com/docs");
    expect(hits.some((h) => h.profile_key === "b@other:22")).toBe(true);
  });

  it("matches local host urls", () => {
    const hits = suggestHistory("127.0.0.1", entries, "a@h:22");
    expect(hits[0]?.url).toContain("127.0.0.1");
  });

  it("scores empty query by profile then recency", () => {
    expect(scoreHistoryMatch("", entries[0], "a@h:22")).toBeGreaterThan(
      scoreHistoryMatch("", entries[2], "a@h:22"),
    );
  });
});

describe("isBookmarked", () => {
  const bookmarks: BrowserBookmark[] = [
    {
      id: "1",
      url: "https://example.com/docs",
      title: "Docs",
      profile_key: "a@h:22",
      created_at: 1,
    },
  ];

  it("finds bookmark for profile+url", () => {
    expect(
      isBookmarked(bookmarks, "https://example.com/docs", "a@h:22")?.id,
    ).toBe("1");
    expect(isBookmarked(bookmarks, "https://example.com/docs", "b@x:22")).toBe(
      null,
    );
  });
});
