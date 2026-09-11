# AI terminal hang + Cursor-style busy dots

Date: 2026-09-07  
Status: approved (user: A+B + Cursor morphing dots)

## Problem

1. AI `terminal_exec` can hang for tens of minutes with **no stdout/stderr** (interactive sudo on exec channel, or stalled remote). Sidecar default wait is hours; Rust `exec_command_capture` has **no timeout** (`timed_out` always false). UI only warns after 45s; busy/Stop stays forever.
2. Busy indicator uses a **horizontal 7-dot opacity wave**, which reads as static decoration — not Cursor’s **morphing braille/constellation** “still working” glyph.

## Goals

- **A:** No-password sudo never hangs — `sudo -n` / fail → `PREVIEW_SUDO_REQUIRED` → password modal (keep existing peel + `exec_remote_sudo_ai_capture`).
- **B:** Long jobs still allowed (high total timeout / model `timeout_seconds`), but **first-byte / no-output** short timeout (~45s) kills the SSH exec channel and returns `timed_out: true`.
- Busy UI: **2×3 morphing dot grid** (frames change which dots are lit), `prefers-reduced-motion` safe.

## Non-goals

- Scraping interactive PTY for AI commands.
- Task/app hardcoding (no journalctl/xrdp special cases).
- Changing sidecar SessionLog storage.

## Design

### Capture timeouts (Rust)

- Add `exec_command_capture_with_limits(handle, cmd, on_output, first_output, total) -> (stdout, stderr, code, timed_out)`.
- `ai_terminal_exec` / sudo AI capture use:
  - `first_output`: **45s** (no bytes yet → close channel, `timed_out=true`, non-zero code).
  - `total`: request optional or default **7200s** (long compile/log still OK once streaming).
- Mirror limits on stdin-capture sudo `-S` path.
- Keep peel + `sudo -n` empty-fail → password modal.

### FE

- `toolBridge`: surface `timed_out` in tool result error text; `ok=false` when timed out.
- Stuck banner (≥45s no output): keep copy; once host returns timed_out, card becomes failed (no eternal running).
- Optional: if invoke still running and local no-output age ≥ first-byte budget + grace, call `stopActiveRun` — only if needed after Rust path lands.

### Busy dots

- Replace 7 inline spans with **6 dots in CSS `grid` 3×2**.
- Multi-frame `@keyframes` per cell (braille-like pattern cycle ~1.2–1.6s).
- Shared class on busy phase line + exec live banner.
- `prefers-reduced-motion: reduce` → low opacity static or very slow pulse.

## Success

- `sudo …` without password fails in seconds with sudo modal (or clear timeout), never 21m silent busy.
- Streaming long command past 45s stays alive if bytes arrived.
- Busy glyph visibly changes shape while waiting (Cursor-like).
- Tests: Rust unit for peel + timeout outcome shape; FE CSS/component smoke; sidecar timeout tests unchanged unless defaults touched.
