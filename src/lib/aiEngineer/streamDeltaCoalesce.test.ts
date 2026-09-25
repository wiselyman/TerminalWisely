import { describe, expect, it, vi } from "vitest";
import { createStreamDeltaCoalescer } from "./streamDeltaCoalesce";

describe("createStreamDeltaCoalesce", () => {
  it("batches multiple pushes into one rAF flush", () => {
    const frames: FrameRequestCallback[] = [];
    const onFlush = vi.fn();
    const c = createStreamDeltaCoalescer(onFlush, {
      requestAnimationFrame: (cb) => {
        frames.push(cb);
        return frames.length;
      },
      cancelAnimationFrame: () => undefined,
    });
    c.push("hel");
    c.push("lo");
    c.push("!");
    expect(onFlush).not.toHaveBeenCalled();
    expect(frames).toHaveLength(1);
    frames[0](0);
    expect(onFlush).toHaveBeenCalledTimes(1);
    expect(onFlush).toHaveBeenCalledWith("hello!");
  });

  it("flushNow drains without waiting for rAF", () => {
    const onFlush = vi.fn();
    let handle = 0;
    const c = createStreamDeltaCoalescer(onFlush, {
      requestAnimationFrame: (cb) => {
        handle = 1;
        void cb;
        return handle;
      },
      cancelAnimationFrame: () => {
        handle = 0;
      },
    });
    c.push("ab");
    c.push("c");
    c.flushNow();
    expect(onFlush).toHaveBeenCalledWith("abc");
    expect(c.pending()).toBe("");
  });

  it("ignores empty pushes", () => {
    const onFlush = vi.fn();
    const c = createStreamDeltaCoalescer(onFlush, {
      requestAnimationFrame: (cb) => {
        cb(0);
        return 1;
      },
      cancelAnimationFrame: () => undefined,
    });
    c.push("");
    expect(onFlush).not.toHaveBeenCalled();
  });
});
