# Host isolation + browser chrome polish

**Date:** 2026-09-18  
**Status:** Approved (user: 开始)

## Goals

1. Address bar: Enter submits; remove Go button.
2. History control: icon instead of “Hist” / “历史” text.
3. Browser multi-tabs, **absolutely isolated per SSH host** (`sessionId`).
4. Switching SSH host tabs restores that host’s last workspace shell (terminal / desktop / AI), independent of browser tab details beyond what desktop already tracks.

## Non-goals

- Multiple WKWebViews per host (one child webview per session remains).
- Persisting workspace/browser tabs to disk across app restarts (in-memory for session lifetime is enough).
- Changing K8s workspace memory.

## Design

### Per-host workspace shell

On `sessionStore.setActiveTab(next)`:

1. Snapshot **outgoing** `activeTabId` → `{ panel: "none"|"desktop"|"aiEngineer", desktopApps, focusOrder, filesTab }`.
2. Apply **incoming** snapshot (default `none` if first visit): close other panels, reopen desktop/AI as recorded, restore desktop app windows.

Browser open/minimized stays coupled to desktop `apps.browser` + `browserStore` session bucket (not a separate shell panel).

### Browser tabs

Each `sessionId` owns:

- `tabs: { id, url, title, navStack, navIndex }[]`
- `activeTabId`

UI: tab strip above address bar; `+` new tab; `×` close (keep ≥1). Back/forward use the active tab’s stack. One docked webview; switching tabs calls `navigate` to that tab’s URL. Switching hosts flushes/restores the bucket and `ensureForSession`.

### Chrome polish

- Remove Go; keep form `onSubmit` / Enter.
- History toggle: clock/history glyph; `aria-label` from i18n; keep `host-browser-history-toggle`.
