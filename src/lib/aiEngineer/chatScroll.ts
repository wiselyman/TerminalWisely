/** Chat transcript scroll — open pins to bottom; !stick never writes scrollTop. */

/** Scroll ONLY this element — never scrollIntoView (that moves ancestors too). */
export function scrollChatToBottom(el: HTMLElement): void {
  const top = Math.max(0, el.scrollHeight - el.clientHeight);
  if (Math.abs(el.scrollTop - top) > 1) {
    el.scrollTop = top;
  }
}

/**
 * Composer tool buttons (model / security / …) take focus on click; WKWebView
 * may yank a nearby overflow scroller — often AFTER React commits the menu.
 * Snapshot scrollTop around the action, then keep restoring for a short lock.
 */
export function runPreservingChatScroll(
  el: HTMLElement | null | undefined,
  action: () => void,
): void {
  if (!el) {
    action();
    return;
  }
  const top = el.scrollTop;
  action();
  if (Math.abs(el.scrollTop - top) > 1) {
    el.scrollTop = top;
  }
}

/** Mouse/pointer down on composer chrome: block focus-scroll without killing click. */
export function shouldPreventComposerChromeFocusScroll(): boolean {
  return true;
}

/** How long to fight async focus/layout scroll after opening composer menus. */
export const COMPOSER_CHROME_SCROLL_LOCK_MS = 600;

/**
 * rAF loop: keep `scrollTop` at the locked value (or pin bottom if sticky)
 * until the lock window expires. Cancels any prior lock loop for the same caller.
 */
export function scheduleComposerChromeScrollLock(opts: {
  isActive: () => boolean;
  restore: () => void;
  maxFrames?: number;
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
}): { cancel: () => void } {
  const raf =
    opts.requestAnimationFrame ??
    ((cb: FrameRequestCallback) => window.requestAnimationFrame(cb));
  const caf =
    opts.cancelAnimationFrame ??
    ((id: number) => window.cancelAnimationFrame(id));
  const maxFrames = opts.maxFrames ?? 48;
  let frames = 0;
  let id = 0;
  let cancelled = false;

  const tick = () => {
    if (cancelled || !opts.isActive()) return;
    opts.restore();
    frames += 1;
    if (frames >= maxFrames || !opts.isActive()) return;
    id = raf(tick);
  };

  opts.restore();
  id = raf(tick);

  return {
    cancel: () => {
      cancelled = true;
      caf(id);
    },
  };
}

/** Scroll event during chrome lock must not rewrite stick / leave a yanked top. */
export function shouldHoldChatScrollForComposerChrome(opts: {
  withinChromeScrollLock: boolean;
}): boolean {
  return opts.withinChromeScrollLock;
}

/** True when the viewport is already near the bottom (user following the stream). */
export function isChatNearBottom(el: HTMLElement, thresholdPx = 120): boolean {
  return el.scrollHeight - el.scrollTop - el.clientHeight <= thresholdPx;
}

/**
 * Parked / pre-layout scrollers often report clientHeight 0 (or tiny). Treating
 * that as "near bottom" stops open-pin retries while scrollTop is still mid.
 */
export function isChatScrollGeometryReady(
  el: HTMLElement,
  minClientHeightPx = 48,
): boolean {
  return el.clientHeight >= minClientHeightPx && el.scrollHeight > 0;
}

/** Wheel / touch always clears stick (even during programmatic pin ignore). */
export function shouldClearStickOnUserIntent(): boolean {
  return true;
}

/** Programmatic pin fires scroll — those must not rewrite stick. */
export function shouldUpdateStickFromScrollEvent(opts: {
  withinProgrammaticPinIgnore: boolean;
  /** Open / host-restore follow window: keep stick forced. */
  withinOpenFollowWindow: boolean;
}): boolean {
  if (opts.withinOpenFollowWindow) return false;
  return !opts.withinProgrammaticPinIgnore;
}

/**
 * Panel open / ready / thread switch: always follow the latest turn.
 */
export function shouldForceStickOnChatOpen(opts: {
  open: boolean;
  findOpen: boolean;
  ready: boolean;
}): boolean {
  return opts.open && !opts.findOpen && opts.ready;
}

/** How long after open we keep forcing stick + pin despite scroll noise. */
export const OPEN_CHAT_FOLLOW_MS = 2000;

/**
 * After soft-hide / park, the first pin often runs while the scroller still has
 * stale geometry (visibility:hidden or pre-layout). Keep pinning on rAF until
 * geometry is ready AND near bottom, or the frame budget is exhausted.
 */
export function scheduleOpenChatPin(opts: {
  pin: () => void;
  isNearBottom: () => boolean;
  /** When false, do not treat "near bottom" as success (layout not ready). */
  isGeometryReady?: () => boolean;
  maxFrames?: number;
  requestAnimationFrame?: (cb: FrameRequestCallback) => number;
  cancelAnimationFrame?: (id: number) => void;
}): { cancel: () => void } {
  const raf =
    opts.requestAnimationFrame ??
    ((cb: FrameRequestCallback) => window.requestAnimationFrame(cb));
  const caf =
    opts.cancelAnimationFrame ??
    ((id: number) => window.cancelAnimationFrame(id));
  const maxFrames = opts.maxFrames ?? 48;
  let frames = 0;
  let id = 0;
  let cancelled = false;

  const settled = () => {
    if (opts.isGeometryReady && !opts.isGeometryReady()) return false;
    return opts.isNearBottom();
  };

  const tick = () => {
    if (cancelled) return;
    opts.pin();
    frames += 1;
    if (frames >= maxFrames || settled()) return;
    id = raf(tick);
  };

  // Immediate pin (useLayoutEffect callers) + follow-up frames for late layout.
  opts.pin();
  id = raf(tick);

  return {
    cancel: () => {
      cancelled = true;
      caf(id);
    },
  };
}

/**
 * Content height changed (markdown / image / tool expand).
 *
 * - stick → pin to bottom
 * - !stick → never touch scrollTop
 * - no height change → none
 */
export function scrollTopAfterContentHeightChange(opts: {
  stickToBottom: boolean;
  previousScrollTop: number;
  previousHeight: number;
  nextHeight: number;
  clientHeight: number;
}): { action: "pin" | "set" | "none"; scrollTop: number } {
  const delta = opts.nextHeight - opts.previousHeight;
  if (Math.abs(delta) <= 1) {
    return { action: "none", scrollTop: opts.previousScrollTop };
  }
  if (opts.stickToBottom) {
    return {
      action: "pin",
      scrollTop: Math.max(0, opts.nextHeight - opts.clientHeight),
    };
  }
  return { action: "none", scrollTop: opts.previousScrollTop };
}

/**
 * Key for live streaming content. Prefer any streaming assistant/tool (not only
 * the last row) so a trailing approval/notice does not skip layout pins.
 */
export function streamFollowPinKey(
  messages: ReadonlyArray<{
    kind: string;
    id?: string;
    content?: string;
    streaming?: boolean;
    output?: string;
    status?: string;
  }>,
): string {
  const n = messages.length;
  if (n === 0) return "0";
  for (let i = n - 1; i >= 0; i--) {
    const m = messages[i]!;
    if (m.kind === "assistant" && m.streaming) {
      return `a:${m.id ?? i}:${(m.content ?? "").length}:1`;
    }
    if (m.kind === "tool" && m.status === "running") {
      return `t:${m.id ?? i}:${(m.output ?? "").length}:running`;
    }
  }
  const last = messages[n - 1]!;
  if (last.kind === "assistant") {
    return `a:${last.id ?? n}:${(last.content ?? "").length}:${last.streaming ? 1 : 0}`;
  }
  if (last.kind === "tool") {
    return `t:${last.id ?? n}:${(last.output ?? "").length}:${last.status ?? ""}`;
  }
  if (last.kind === "thought") {
    return `th:${last.id ?? n}:${(last.content ?? "").length}`;
  }
  return `${last.kind}:${n}`;
}

/** Pin on stream updates only while following (stick or open-follow window). */
export function shouldPinChatOnStreamUpdate(opts: {
  stickToBottom: boolean;
  withinOpenFollowWindow: boolean;
}): boolean {
  return opts.stickToBottom || opts.withinOpenFollowWindow;
}

/**
 * Maximize / viewport resize of the messages scroller.
 * Following → pin; mid-reading → freeze scrollTop (never yank to bottom).
 */
export function shouldPinChatAfterViewportResize(opts: {
  stickToBottom: boolean;
  wasNearBottom: boolean;
}): boolean {
  return opts.stickToBottom || opts.wasNearBottom;
}

export function scrollTopAfterViewportResize(opts: {
  stickToBottom: boolean;
  wasNearBottom: boolean;
  previousScrollTop: number;
  previousClientHeight: number;
  nextClientHeight: number;
  scrollHeight: number;
  /** Window/Tauri resize: always re-evaluate even if clientHeight delta is tiny. */
  force?: boolean;
}): { action: "pin" | "freeze" | "none"; scrollTop: number } {
  if (
    !opts.force &&
    Math.abs(opts.nextClientHeight - opts.previousClientHeight) <= 1
  ) {
    return { action: "none", scrollTop: opts.previousScrollTop };
  }
  const maxTop = Math.max(0, opts.scrollHeight - opts.nextClientHeight);
  if (opts.stickToBottom || opts.wasNearBottom) {
    return { action: "pin", scrollTop: maxTop };
  }
  return {
    action: "freeze",
    scrollTop: Math.min(Math.max(0, opts.previousScrollTop), maxTop),
  };
}

/** While busy + stick: scroll proximity must not clear stick (wheel/touch still can). */
export function shouldHoldStickWhileBusyFollow(opts: {
  busy: boolean;
  stickToBottom: boolean;
}): boolean {
  return opts.busy && opts.stickToBottom;
}

/**
 * Use stick / pre-resize near-bottom intent — never re-read "near bottom" after
 * the browser may already have yanked scrollTop on maximize.
 */
export function shouldFollowChatOnViewportResize(opts: {
  stickToBottom: boolean;
  rememberedNearBottom: boolean;
}): boolean {
  return opts.stickToBottom || opts.rememberedNearBottom;
}

export function scrollTopForAiFiberReveal(
  scrollHeight: number,
  clientHeight: number,
): number {
  return Math.max(0, scrollHeight - clientHeight);
}

/** True when this fiber should pin to bottom while soft-hidden / parked. */
export function shouldParkChatScrollerAtBottom(opts: {
  open: boolean;
  ready: boolean;
}): boolean {
  return !opts.open && opts.ready;
}

/** Stamp so builds can verify this scroll model is loaded. */
export const AI_CHAT_SCROLL_FIX_ID = "2026-09-20-maximize-follow" as const;
