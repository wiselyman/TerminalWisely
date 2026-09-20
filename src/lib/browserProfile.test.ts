import { describe, expect, it } from "vitest";
import {
  browserProfileKey,
  browserProfileLabelSlug,
  browserSessionProfileKey,
  browserSessionWebviewLabel,
  browserWebviewLabel,
} from "./browserProfile";

describe("browserProfile", () => {
  it("builds user@host:port keys", () => {
    expect(browserProfileKey("alice", "10.0.0.1", 22)).toBe(
      "alice@10.0.0.1:22",
    );
  });

  it("scopes profile + label per SSH session", () => {
    expect(
      browserSessionProfileKey("alice", "10.0.0.1", 22, "sess-a"),
    ).toBe("alice@10.0.0.1:22#sess-a");
    expect(
      browserSessionProfileKey("alice", "10.0.0.1", 22, "sess-b"),
    ).not.toBe(browserSessionProfileKey("alice", "10.0.0.1", 22, "sess-a"));
    expect(browserSessionWebviewLabel("sess-a")).toBe("host-browser-sess-a");
    expect(browserSessionWebviewLabel("sess-a")).not.toBe(
      browserSessionWebviewLabel("sess-b"),
    );
  });

  it("slugs labels safely", () => {
    expect(browserProfileLabelSlug("alice@10.0.0.1:22")).toBe(
      "alice-10-0-0-1-22",
    );
    expect(browserWebviewLabel("alice@10.0.0.1:22")).toBe(
      "host-browser-alice-10-0-0-1-22",
    );
  });
});
