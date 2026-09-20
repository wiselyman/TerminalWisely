# Host Browser (SOCKS) — Implementation Plan

> For humans / agents executing or verifying the 2026-09-17 design.

## Tasks

1. **Locale flags** — `LocaleSwitcher` flag UI; Vitest `localeFlag`; E2E still uses menu testids.
2. **Panel shell** — `WorkspacePanelId` `browser`, `BrowserTool`, `BrowserPanel`, i18n, CSS.
3. **SOCKS bridge** — `src-tauri/src/ssh/socks.rs` CONNECT-only; `browser_*` commands; `BrowserManager`.
4. **Isolated webview** — `proxy_url` + profile data dir / `data_store_identifier`; capabilities `host-browser-*`; `macos-proxy`.
5. **Lifecycle** — closeTab / disconnect / panel close shutdown; active-tab rebind.
6. **Tests/docs** — unit, smoke, Playwright `e2e/host-browser.spec.ts`, TEST_MATRIX, this plan + design spec.

## Commands

```bash
node scripts/check-no-agent-hardcoding.mjs
npm test -- --run src/lib/browserProfile.test.ts src/lib/localeFlag.test.ts
cd src-tauri && cargo test browser:: socks::
./scripts/run-all-tests.sh
```
