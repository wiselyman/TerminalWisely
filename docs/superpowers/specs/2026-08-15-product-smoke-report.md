# Product smoke report — 2026-08-15 (round 2)

## Verdict

**Still partial.** New evidence this round from **Chrome headless against Vite** (IPv4).
Native Tauri **AX click-through still unreliable** (often `windows=0` / `buttons=0`).

## Round 2 results

### Static / compile (unchanged)

| Check | Result |
|-------|--------|
| `node scripts/smoke-product-checklist.mjs` | **39 PASS / 0 FAIL** |
| Prior `cargo check` / `npm run build` | PASS (earlier) |

### Chrome headless @ `http://127.0.0.1:1420/` (rendered welcome)

| Check | Result |
|-------|--------|
| Product name TerminalWisely | PASS |
| No 「本地终端」 / Git Bash local phrase | PASS |
| AI Linux Engineer copy present | PASS |
| SSH session product copy present | PASS |
| `workspace-ai-edge` in DOM | PASS |
| `WorkspaceToolRail` not mounted (`App.tsx`) | PASS (source) |
| `workspace-tool-rail` string absent from DOM | FAIL\* |

\*False positive likely: class still defined in `App.css` for legacy styling; mount site removed from `App.tsx`.

### Native Accessibility

| Check | Result |
|-------|--------|
| Earlier authorized dump (round 1) | PASS: no local terminal; AI edge + SSH bookmarks visible |
| Round 2 click automation | FAIL: process often has **0 windows** or **0 AXButtons** after relaunch; cannot open AI header |

### Not exercised

SSH connect, drag-upload, live AI `terminal_exec`, model dropdown click, tools menu click.

## Note for future automation

Vite must bind **`127.0.0.1`** (`npx vite --host 127.0.0.1 --port 1420`). Default Tauri `host: false` can end up IPv6-only; WebView/`curl 127.0.0.1` then fails.

## Manual remaining

Same 6 steps as report round 1 (AI header / tools / model / SSH / AI exec / drag upload).
