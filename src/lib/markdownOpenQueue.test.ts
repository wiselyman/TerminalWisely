import { describe, expect, it, vi } from "vitest";
import { createMarkdownOpenDrain } from "./markdownOpenQueue";

describe("createMarkdownOpenDrain", () => {
  it("delivers every batch even when another batch arrives during delivery", async () => {
    const take = vi.fn()
      .mockResolvedValueOnce(["/tmp/one.md"])
      .mockResolvedValueOnce(["/tmp/two.md"])
      .mockResolvedValueOnce([]);
    const delivered: string[] = [];
    let release!: () => void;
    const waitForFirst = new Promise<void>((resolve) => { release = resolve; });
    const drain = createMarkdownOpenDrain(take, async (path) => {
      delivered.push(path);
      if (path.endsWith("one.md")) await waitForFirst;
    });

    const first = drain();
    await Promise.resolve();
    await drain();
    release();
    await first;

    expect(delivered).toEqual(["/tmp/one.md", "/tmp/two.md"]);
    expect(take).toHaveBeenCalledTimes(3);
  });
});
