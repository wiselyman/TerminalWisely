import { describe, expect, it, vi } from "vitest";
import {
  AI_CHAT_SCROLL_FIX_ID,
  COMPOSER_CHROME_SCROLL_LOCK_MS,
  isChatNearBottom,
  isChatScrollGeometryReady,
  runPreservingChatScroll,
  scheduleComposerChromeScrollLock,
  scheduleOpenChatPin,
  scrollChatToBottom,
  scrollTopAfterContentHeightChange,
  scrollTopAfterViewportResize,
  scrollTopForAiFiberReveal,
  shouldClearStickOnUserIntent,
  shouldForceStickOnChatOpen,
  shouldHoldChatScrollForComposerChrome,
  shouldFollowChatOnViewportResize,
  shouldHoldStickWhileBusyFollow,
  shouldParkChatScrollerAtBottom,
  shouldPinChatAfterViewportResize,
  shouldPinChatOnStreamUpdate,
  shouldPreventComposerChromeFocusScroll,
  shouldUpdateStickFromScrollEvent,
  streamFollowPinKey,
} from "./chatScroll";

describe("chatScroll maximize-follow model", () => {
  it("scrollChatToBottom uses scrollHeight, not offsetTop", () => {
    const el = {
      scrollHeight: 2000,
      clientHeight: 400,
      scrollTop: 0,
    } as HTMLElement;
    scrollChatToBottom(el);
    expect(el.scrollTop).toBe(1600);
  });

  it("isChatNearBottom detects stickiness", () => {
    expect(
      isChatNearBottom({
        scrollHeight: 2000,
        clientHeight: 400,
        scrollTop: 1550,
      } as HTMLElement),
    ).toBe(true);
    expect(
      isChatNearBottom({
        scrollHeight: 2000,
        clientHeight: 400,
        scrollTop: 200,
      } as HTMLElement),
    ).toBe(false);
  });

  it("zero clientHeight is not ready geometry (must not stop open pin)", () => {
    expect(
      isChatScrollGeometryReady({
        scrollHeight: 0,
        clientHeight: 0,
        scrollTop: 500,
      } as HTMLElement),
    ).toBe(false);
    expect(
      isChatScrollGeometryReady({
        scrollHeight: 2000,
        clientHeight: 400,
        scrollTop: 500,
      } as HTMLElement),
    ).toBe(true);
  });

  it("open+ready forces stick path", () => {
    expect(
      shouldForceStickOnChatOpen({ open: true, findOpen: false, ready: true }),
    ).toBe(true);
    expect(
      shouldForceStickOnChatOpen({ open: true, findOpen: true, ready: true }),
    ).toBe(false);
  });

  it("scheduleOpenChatPin retries until near bottom", () => {
    const pin = vi.fn();
    let near = false;
    const queue: FrameRequestCallback[] = [];
    const handle = scheduleOpenChatPin({
      pin,
      isNearBottom: () => near,
      maxFrames: 5,
      requestAnimationFrame: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      cancelAnimationFrame: () => undefined,
    });
    expect(pin).toHaveBeenCalledTimes(1);
    expect(queue).toHaveLength(1);
    queue.shift()!(0);
    expect(pin).toHaveBeenCalledTimes(2);
    near = true;
    queue.shift()!(0);
    expect(pin).toHaveBeenCalledTimes(3);
    expect(queue).toHaveLength(0);
    handle.cancel();
  });

  it("scheduleOpenChatPin ignores near-bottom until geometry ready", () => {
    const pin = vi.fn();
    let ready = false;
    const queue: FrameRequestCallback[] = [];
    scheduleOpenChatPin({
      pin,
      isNearBottom: () => true,
      isGeometryReady: () => ready,
      maxFrames: 4,
      requestAnimationFrame: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      cancelAnimationFrame: () => undefined,
    });
    expect(pin).toHaveBeenCalledTimes(1);
    queue.shift()!(0);
    expect(pin).toHaveBeenCalledTimes(2);
    ready = true;
    queue.shift()!(0);
    expect(pin).toHaveBeenCalledTimes(3);
    expect(queue).toHaveLength(0);
  });

  it("scheduleOpenChatPin stops at maxFrames", () => {
    const pin = vi.fn();
    const queue: FrameRequestCallback[] = [];
    scheduleOpenChatPin({
      pin,
      isNearBottom: () => false,
      maxFrames: 3,
      requestAnimationFrame: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      cancelAnimationFrame: () => undefined,
    });
    while (queue.length) queue.shift()!(0);
    expect(pin).toHaveBeenCalledTimes(4);
  });

  it("wheel clears stick; open-follow blocks stick update from scroll", () => {
    expect(shouldClearStickOnUserIntent()).toBe(true);
    expect(
      shouldUpdateStickFromScrollEvent({
        withinProgrammaticPinIgnore: true,
        withinOpenFollowWindow: false,
      }),
    ).toBe(false);
    expect(
      shouldUpdateStickFromScrollEvent({
        withinProgrammaticPinIgnore: false,
        withinOpenFollowWindow: true,
      }),
    ).toBe(false);
  });

  it("stick + height grow → pin; !stick never writes", () => {
    expect(
      scrollTopAfterContentHeightChange({
        stickToBottom: true,
        previousScrollTop: 1600,
        previousHeight: 2000,
        nextHeight: 2600,
        clientHeight: 400,
      }).action,
    ).toBe("pin");
    expect(
      scrollTopAfterContentHeightChange({
        stickToBottom: false,
        previousScrollTop: 200,
        previousHeight: 2000,
        nextHeight: 2500,
        clientHeight: 400,
      }).action,
    ).toBe("none");
  });

  it("viewport resize pins when following; freezes mid readers", () => {
    expect(
      shouldPinChatAfterViewportResize({
        stickToBottom: true,
        wasNearBottom: false,
      }),
    ).toBe(true);
    expect(
      shouldPinChatAfterViewportResize({
        stickToBottom: false,
        wasNearBottom: true,
      }),
    ).toBe(true);
    expect(
      shouldPinChatAfterViewportResize({
        stickToBottom: false,
        wasNearBottom: false,
      }),
    ).toBe(false);

    expect(
      scrollTopAfterViewportResize({
        stickToBottom: true,
        wasNearBottom: false,
        previousScrollTop: 1600,
        previousClientHeight: 400,
        nextClientHeight: 800,
        scrollHeight: 2000,
      }),
    ).toEqual({ action: "pin", scrollTop: 1200 });

    expect(
      scrollTopAfterViewportResize({
        stickToBottom: false,
        wasNearBottom: false,
        previousScrollTop: 900,
        previousClientHeight: 400,
        nextClientHeight: 800,
        scrollHeight: 2000,
      }),
    ).toEqual({ action: "freeze", scrollTop: 900 });
  });

  it("fiber reveal math targets bottom", () => {
    expect(scrollTopForAiFiberReveal(2000, 400)).toBe(1600);
  });

  it("follows viewport resize from stick or remembered near-bottom", () => {
    expect(
      shouldFollowChatOnViewportResize({
        stickToBottom: false,
        rememberedNearBottom: true,
      }),
    ).toBe(true);
    expect(
      shouldFollowChatOnViewportResize({
        stickToBottom: false,
        rememberedNearBottom: false,
      }),
    ).toBe(false);
  });

  it("force viewport resize pins even when clientHeight delta is tiny", () => {
    expect(
      scrollTopAfterViewportResize({
        stickToBottom: true,
        wasNearBottom: true,
        previousScrollTop: 800,
        previousClientHeight: 400,
        nextClientHeight: 400,
        scrollHeight: 2000,
        force: true,
      }),
    ).toEqual({ action: "pin", scrollTop: 1600 });
  });

  it("exposes maximize-follow fix id", () => {
    expect(AI_CHAT_SCROLL_FIX_ID).toBe("2026-09-20-maximize-follow");
  });

  it("runPreservingChatScroll restores scrollTop if action yanks it", () => {
    const el = {
      scrollHeight: 2000,
      clientHeight: 400,
      scrollTop: 1600,
    } as HTMLElement;
    runPreservingChatScroll(el, () => {
      el.scrollTop = 200;
    });
    expect(el.scrollTop).toBe(1600);
    expect(shouldPreventComposerChromeFocusScroll()).toBe(true);
  });

  it("scheduleComposerChromeScrollLock restores across frames", () => {
    let top = 1600;
    const queue: FrameRequestCallback[] = [];
    let active = true;
    const handle = scheduleComposerChromeScrollLock({
      isActive: () => active,
      restore: () => {
        top = 1600;
      },
      maxFrames: 3,
      requestAnimationFrame: (cb) => {
        queue.push(cb);
        return queue.length;
      },
      cancelAnimationFrame: () => undefined,
    });
    expect(top).toBe(1600);
    top = 200;
    queue.shift()!(0);
    expect(top).toBe(1600);
    active = false;
    top = 50;
    queue.shift()!(0);
    expect(queue).toHaveLength(0);
    handle.cancel();
    expect(COMPOSER_CHROME_SCROLL_LOCK_MS).toBeGreaterThan(0);
    expect(
      shouldHoldChatScrollForComposerChrome({ withinChromeScrollLock: true }),
    ).toBe(true);
  });

  it("streamFollowPinKey prefers streaming assistant over trailing tool", () => {
    const key = streamFollowPinKey([
      { kind: "assistant", id: "1", content: "hello world", streaming: true },
      { kind: "tool", id: "2", output: "x", status: "done" },
    ]);
    expect(key.startsWith("a:1:")).toBe(true);
    expect(
      shouldPinChatOnStreamUpdate({
        stickToBottom: true,
        withinOpenFollowWindow: false,
      }),
    ).toBe(true);
  });

  it("busy+stick holds stick against scroll proximity", () => {
    expect(
      shouldHoldStickWhileBusyFollow({ busy: true, stickToBottom: true }),
    ).toBe(true);
    expect(
      shouldHoldStickWhileBusyFollow({ busy: true, stickToBottom: false }),
    ).toBe(false);
    expect(
      shouldHoldStickWhileBusyFollow({ busy: false, stickToBottom: true }),
    ).toBe(false);
  });

  it("parked fiber should pin scroller to bottom (never inherit mid)", () => {
    expect(
      shouldParkChatScrollerAtBottom({ open: false, ready: true }),
    ).toBe(true);
    expect(
      shouldParkChatScrollerAtBottom({ open: true, ready: true }),
    ).toBe(false);
  });
});
