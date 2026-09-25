/**
 * Batch high-frequency stream chunks to one paint (rAF).
 * Avoids per-token Zustand + markdown + disk work.
 */

export type StreamDeltaCoalescer = {
  push: (text: string) => void;
  /** Drain immediately (before non-delta events / run end). */
  flushNow: () => void;
  pending: () => string;
};

export function createStreamDeltaCoalescer(
  onFlush: (batched: string) => void,
  opts?: {
    requestAnimationFrame?: (cb: FrameRequestCallback) => number;
    cancelAnimationFrame?: (id: number) => void;
  },
): StreamDeltaCoalescer {
  const raf =
    opts?.requestAnimationFrame ??
    ((cb: FrameRequestCallback) => window.requestAnimationFrame(cb));
  const cancel =
    opts?.cancelAnimationFrame ??
    ((id: number) => window.cancelAnimationFrame(id));

  let buf = "";
  let handle = 0;

  const drain = () => {
    handle = 0;
    const out = buf;
    buf = "";
    if (out) onFlush(out);
  };

  return {
    push(text: string) {
      if (!text) return;
      buf += text;
      if (handle) return;
      handle = raf(drain);
    },
    flushNow() {
      if (handle) {
        cancel(handle);
        handle = 0;
      }
      drain();
    },
    pending: () => buf,
  };
}
