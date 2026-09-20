# Host Browser (SSH SOCKS5) — Design

**Date:** 2026-09-17  
**Status:** Implemented (v1)

## Problem

Users need to open HTTP services that bind on a remote host’s `127.0.0.1` / LAN (same as Cursor’s remote browser). The app already owns the SSH session; a second login must not be used.

## Decisions

| Topic | Choice |
|-------|--------|
| Transport | SSH `direct-tcpip` **TCP tunnel** to the URL host:port (local `127.0.0.1:ephemeral` → remote). Webview loads the rewritten local URL — no WKWebView `proxy_url` (macOS SOCKS blank-page issues). |
| UI | Right workspace panel chrome + undecorated `WebviewWindow` docked over the panel slot (no `parent()` clipping). |
| Availability | Disabled without an active connected SSH tab |
| Isolation | Per-host profile `user@host:port` → `data_directory` / `data_store_identifier` |
| Locale UI | Flag marks for `zh-CN` / `en` (replace globe+text) |

## Architecture

1. Titlebar **Browser** tool → `switchWorkspacePanel("browser")`.
2. FE `browserStore` invokes `browser_ensure` → Rust starts `SocksBridge` on `127.0.0.1:0`.
3. Rust `add_child` creates `host-browser-{slug}` with `proxy_url=socks5://127.0.0.1:{port}` (hidden 1×1 until docked).
4. Panel slot `getBoundingClientRect` → `browser_set_webview_bounds` with **logical** coords (same space as main webview).
5. Address bar → `browser_navigate`; tab close / disconnect / panel close → `browser_shutdown`.

## Non-goals (v1)

- DevTools / extensions, UDP / BIND, K8s-context browser, detached multi-window, system proxy.

## Risks

- macOS proxy needs **14+** and Cargo feature `macos-proxy`.
- Proxied webviews must not share the main webview data store.
- SOCKS channels must not tear down the session PTY / AI SSH lease.
- Floating `WebviewWindow` docking was abandoned: CSS-as-screen coords produced the “tiny black box” bug.
