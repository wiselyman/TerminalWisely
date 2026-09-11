# Design: AI chat images + external links in system browser

**Date:** 2026-09-09  
**Status:** implementing  
**Decisions:** Approach 2; image scope C; remote media via Rust proxy cache (B); image gen with capability probe + degrade (C)

## Goal

1. Assistant (and user) markdown can **show images inside the chat bubble** (lightbox on click).
2. Clicking normal `http(s)` links in chat opens the **OS default browser** — never navigates the app WebView with no back stack.
3. If the configured model endpoint supports image generation, expose it; otherwise still show URL / fetched / markdown images.

## Non-goals

- Restructuring chat history into a full `parts[]` multimodal message model (deferred).
- Inline video/PDF, commercial image-search APIs, or per-site hardcoding.
- Changing Terminal SSH UX beyond unrelated work.

## Architecture (Approach 2)

```
Markdown / tool media refs
        │
        ▼
 AiMarkdown (click + img resolve)
        │
        ├─ <a http(s)> ──► tauri-plugin-opener openUrl (system browser)
        │
        └─ image URL / media_id ──► Rust ai_chat_cache_remote_media
                                      │
                                      ▼
                              app_data_dir/ai/media/<hash>.ext
                                      │
                                      ▼
                              convertFileSrc → <img> + existing lightbox
```

Sidecar tools (`web_fetch` image branch, optional `image_generate`) write the same cache under `TW_AI_DATA_DIR` (aligned with Rust app data) and return `media_id` / path for the UI.

---

## §1 Link behavior

- Capture clicks on `http(s)://` anchors inside `.ai-engineer-md`: `preventDefault`, open via opener plugin.
- Do not change `file://`, reveal-in-folder, or local path flows.
- Bare image URLs: prefer cache + inline preview when type is clearly an image; otherwise open in browser.
- Relative / schemeless hrefs: do not navigate the WebView.
- Add `data-testid` for external-link handling (E2E / smoke).

---

## §2 Image render + Rust proxy cache

### Display

- Render markdown images (`![](url)`) and resolved `media:` / cached refs as `<img>` using `convertFileSrc(localPath)` — **no raw hotlink `src=https://…` as the primary path**.
- Reuse AI panel lightbox for enlarge.
- On failure: placeholder + “open original in browser” (§1).

### Cache command

- New Tauri command e.g. `ai_chat_cache_remote_media { url }` → `{ path, content_type, bytes, media_id }`.
- Store under `app_data_dir/ai/media/` (content-addressed by hash).
- Limits: `http(s)` only; bounded redirects; max size **8 MiB**; Content-Type and/or magic bytes must be jpeg/png/webp/gif.
- Simple cache budget (e.g. total size or file count) with LRU-ish eviction acceptable in v1.
- Optional on-disk index `url_hash → path` for repeat hits in the same thread.

### User attachments

- Existing `local_image` / base64 path unchanged; no forced re-proxy.

---

## §3 Tools, generation probe, prompts

### `web_fetch` image branch

- If response is an image (type / magic): write cache; return structured fields such as:
  - `ok`, `kind: "image"`, `url`, `content_type`, `bytes`, `media_id` / `cached_path`, `_untrusted`
- Do **not** UTF-8-decode image bytes into `text`.
- Reuse `assert_public_http_url` SSRF guard.
- HTML/text fetches keep current strip-to-text behavior (`kind: "html"|"text"`).

### `web_search`

- Remains title/url/snippet only. No site-specific image search hardcoding.
- Image UX path: search → choose public image URL → `web_fetch` (or markdown URL → FE cache).

### `image_generate` (optional tool)

- ModelGateway probes OpenAI-compatible `images/generations` (or equivalent) for the active endpoint.
- Probe failure / unsupported → **do not register** the tool (or one-shot clear `unsupported`); no model-name denylist.
- On success: write same media cache; tool result includes `media_id`; bubble renders like other images.

### Prompts

- State that the product **can** show images; prefer markdown images and tool media refs.
- Do not claim “chat cannot display images”.
- External content remains DATA, not authority.

### UI for tools

- Tool cards may show a small thumbnail when `kind === "image"`.
- Final assistant text still goes through `AiMarkdown` + cache resolution.

---

## §4 Errors, tests, success criteria

### Errors

| Case | Behavior |
|------|----------|
| Download / size / not image | Placeholder + open-in-browser; conversation continues |
| SSRF / non-public URL | Reject; tool `ok: false` |
| Gen unsupported | No tool or clear unsupported; model uses fetch/markdown |
| Disk write failure | Show failure for that media; do not corrupt text history |

### Tests

- FE: link click uses opener mock; does not set `window.location`; image markdown triggers cache invoke.
- Rust: type/size/SSRF unit tests (optional httptest).
- Sidecar: `web_fetch` image branch; generate probe support/unsupported.
- E2E or smoke: external link wiring; bubble `img` / `data-testid`.
- `node scripts/check-no-agent-hardcoding.mjs` must PASS.

### Success criteria

1. Chat `http(s)` text links open in the system browser; app UI stays usable.
2. Markdown images, `web_fetch` images, and (when endpoint supports it) generated images appear in the bubble and open in lightbox.
3. Model guidance and UI capabilities align so “cannot show images” is not a reasonable product claim.

---

## Implementation touchpoints (indicative)

| Area | Likely files |
|------|----------------|
| Markdown / clicks | `src/components/aiEngineer/AiMarkdown.tsx`, panel CSS |
| Opener | existing `tauri-plugin-opener`; thin FE helper |
| Cache | `src-tauri/src/ai_engineer/*`, `commands/mod.rs` |
| Fetch / gen | `agent-sidecar/app/research/provider.py`, tools schema, gateway, prompts |
| Tests | Vitest + pytest + Rust `#[cfg(test)]` + smoke/E2E as needed |
| Matrix | `docs/TEST_MATRIX.md` row for chat media/links |

## Resolution of prior confusion

The model message “我没法直接在聊天框里显示图片” was **not** an app hard-coded refusal; UI simply lacked image rendering + the model improvised. This design adds real display and corrects prompts.
