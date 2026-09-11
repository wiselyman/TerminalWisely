import { beforeEach, describe, expect, it, vi } from "vitest";

const openUrl = vi.fn(async (_url: string) => undefined);

vi.mock("@tauri-apps/plugin-opener", () => ({
  openUrl: (url: string) => openUrl(url),
}));

import { isHttpUrl, openExternalUrl } from "./openExternalUrl";

describe("openExternalUrl", () => {
  beforeEach(() => {
    openUrl.mockClear();
  });

  it("accepts only http(s)", () => {
    expect(isHttpUrl("https://example.com/a")).toBe(true);
    expect(isHttpUrl("http://example.com")).toBe(true);
    expect(isHttpUrl("javascript:alert(1)")).toBe(false);
    expect(isHttpUrl("file:///tmp/x")).toBe(false);
  });

  it("opens https via opener", async () => {
    await openExternalUrl("https://franka.de/panda");
    expect(openUrl).toHaveBeenCalledWith("https://franka.de/panda");
  });

  it("rejects non-http", async () => {
    await expect(openExternalUrl("javascript:alert(1)")).rejects.toThrow(
      /external_url_not_http/,
    );
    expect(openUrl).not.toHaveBeenCalled();
  });
});
