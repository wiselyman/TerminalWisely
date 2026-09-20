# Host Browser chrome — history, bookmarks, all-SOCKS

**Date:** 2026-09-17  
**Status:** Implemented (user chose network mode **B**)

## Network (locked)

**Transport:** Local **HTTP CONNECT proxy** (`proxy_url=http://127.0.0.1:{port}`) → in-process **SOCKS5** → SSH `direct-tcpip` on the existing session.

WebView navigates to the **real** URL (e.g. `http://10.6.20.241:31111/...`). All page traffic — HTML, XHR, WebSocket, assets — uses the remote host’s network (Mode B).

**Why not SOCKS `proxy_url` directly?** WKWebView + `socks5://` often paints a blank page on macOS even when the SOCKS bridge works (curl OK). HTTP CONNECT is the supported WKWebView path.

**Why not per-URL TCP tunnel alone?** Only the first host:port is tunneled; SPA absolute API calls to LAN IPs bypass the tunnel and fail from the Mac.

## Chrome

| Control | Behavior |
|---------|----------|
| Back / Forward | `history.back()` / `history.forward()` via webview `eval`; FE stack tracks canGoBack/Forward |
| Reload | `webview.reload()` |
| Address + Go | Navigate absolute http(s) URL through SOCKS webview |
| URL sync | `on_page_load` → emit `host-browser-page` → FE address bar + history record |
| Autocomplete | Dropdown from visit history (profile-first, then global), keyboard nav |
| Bookmarks | Star toggle + menu; per `user@host:port` profile |
| History | Persist visits; list/search/clear in a small panel or menu |

## Persistence

- `browser-history.json` via `tauri-plugin-store` (cap ~500 entries, newest first)
- `browser-bookmarks.json` (id, url, title, profile_key, created_at)

## Non-goals (this pass)

- Multi-tab inside Host Browser
- Extensions / DevTools
- Download manager UI
- Password manager

## Tests

- Unit: history rank/suggest; bookmark upsert (`browserHistory.test.ts`)
- Smoke: SOCKS `proxy_url` + history/bookmark store keys
- E2E: toolbar buttons present; autocomplete opens on type (mock)
