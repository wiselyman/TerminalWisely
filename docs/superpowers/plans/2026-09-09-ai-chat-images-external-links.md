# AI chat images + external links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chat shows images (markdown / fetched / generated when supported) via local media cache; `http(s)` text links open in the OS default browser.

**Architecture:** `AiMarkdown` intercepts link clicks (`openUrl`) and resolves images through Rust `ai_chat_cache_remote_media` → `convertFileSrc`. Sidecar `web_fetch` image branch and optional `image_generate` write the same `TW_AI_DATA_DIR/ai/media` cache. Prompts state that chat can display images.

**Tech Stack:** React/TS, Tauri 2 + opener, Rust reqwest, agent-sidecar httpx, Vitest/pytest.

## Global Constraints

- No agent hardcoding / per-site image templates (`check-no-agent-hardcoding.mjs` PASS).
- External content is DATA; SSRF via public http(s) only.
- Max remote image **8 MiB**; jpeg/png/webp/gif only.
- Do not restructure chat history into `parts[]`.
- Spec: `docs/superpowers/specs/2026-09-09-ai-chat-images-external-links-design.md`.

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/aiEngineer/openExternalUrl.ts` | Thin opener wrapper |
| `src/lib/aiEngineer/chatMedia.ts` | URL/media_id helpers + cache invoke |
| `src/components/aiEngineer/AiMarkdown.tsx` | Link click + async image rewrite |
| `src-tauri/src/ai_engineer/media_cache.rs` | Download, validate, store |
| `src-tauri/src/commands/mod.rs` + `lib.rs` | Expose `ai_chat_cache_remote_media` |
| `agent-sidecar/app/research/provider.py` | `web_fetch` image branch |
| `agent-sidecar/app/paths.py` | media dir under `TW_AI_DATA_DIR` |
| `agent-sidecar/app/llm/gateway.py` | images/generations probe + call |
| `agent-sidecar/app/tools/schema.py` + loop | `image_generate` tool |
| `agent-sidecar/app/agent/prompts.py` | Can display images |
| Tests + `docs/TEST_MATRIX.md` | Coverage |

---

### Task 1: External links open in system browser

**Files:**
- Create: `src/lib/aiEngineer/openExternalUrl.ts`
- Create: `src/lib/aiEngineer/openExternalUrl.test.ts`
- Modify: `src/components/aiEngineer/AiMarkdown.tsx`
- Modify: `src/e2e/tauriCoreMock.ts` if invoke list needed
- Test: Vitest for click helper + markdown handler

- [ ] **Step 1:** Add `openExternalUrl(url: string): Promise<void>` using `@tauri-apps/plugin-opener` `openUrl`; only allow `http:`/`https:`.
- [ ] **Step 2:** `AiMarkdown` `onClick` capture: if target is `<a href>`, preventDefault, call `openExternalUrl`; mark anchors `data-testid="ai-md-external-link"`.
- [ ] **Step 3:** Vitest: mock opener; clicking https does not throw; rejects `javascript:`.
- [ ] **Step 4:** Run `npm test -- --run src/lib/aiEngineer/openExternalUrl.test.ts`

---

### Task 2: Rust media cache command

**Files:**
- Create: `src-tauri/src/ai_engineer/media_cache.rs`
- Modify: `src-tauri/src/ai_engineer/mod.rs`, `commands/mod.rs`, `lib.rs`
- Test: `#[cfg(test)]` in `media_cache.rs`

- [ ] **Step 1:** Implement `cache_remote_media(app, url) -> { media_id, path, content_type, bytes }` with SSRF-ish host checks, 8MiB cap, magic-byte detect, write `app_data_dir/ai/media/<sha256>.<ext>`.
- [ ] **Step 2:** Register command `ai_chat_cache_remote_media`.
- [ ] **Step 3:** Unit tests: reject non-http; accept PNG magic; reject oversized.
- [ ] **Step 4:** `cd src-tauri && cargo test media_cache -- --nocapture`

---

### Task 3: AiMarkdown image resolve + lightbox

**Files:**
- Create: `src/lib/aiEngineer/chatMedia.ts` (+ test)
- Modify: `AiMarkdown.tsx`, `AiEngineerPanel.tsx` (lightbox callback), `App.css`
- Modify: smoke checklist if needed

- [ ] **Step 1:** `cacheRemoteMedia(url)` invoke wrapper; `looksLikeImageUrl`.
- [ ] **Step 2:** After marked parse, rewrite `<img src="http...">` to placeholder, async cache → `convertFileSrc`; click img opens lightbox via optional `onImageClick`.
- [ ] **Step 3:** Vitest for URL heuristics; smoke mention `ai-md-external-link`.
- [ ] **Step 4:** Run relevant Vitest.

---

### Task 4: Sidecar `web_fetch` image branch

**Files:**
- Modify: `agent-sidecar/app/paths.py`, `research/provider.py`, loop tool result handling if needed
- Test: `agent-sidecar/tests/test_web_fetch_image.py` (httpx mock)

- [ ] **Step 1:** Detect image responses; write under `TW_AI_DATA_DIR/ai/media/`; return `kind: "image"`, `media_id`, `cached_path`, no text decode.
- [ ] **Step 2:** HTML path sets `kind: "html"|"text"`.
- [ ] **Step 3:** pytest PASS.

---

### Task 5: `image_generate` probe + prompts

**Files:**
- Modify: gateway, tools schema, loop, prompts
- Test: pytest for unsupported probe + schema registration gate

- [ ] **Step 1:** Gateway `supports_image_generation` / `images_generations`.
- [ ] **Step 2:** Register tool only when supported (or return unsupported clearly).
- [ ] **Step 3:** Prompt: chat can display images; use markdown / tool media.
- [ ] **Step 4:** pytest + hardcoding check.

---

### Task 6: Tool thumbnail + matrix + full verify

- [ ] Tool card shows thumb when result has `kind: "image"` / `media_id`.
- [ ] Update `docs/TEST_MATRIX.md`.
- [ ] `node scripts/check-no-agent-hardcoding.mjs` + targeted tests; prefer `./scripts/run-all-tests.sh` before claiming done.

## Spec coverage

| Spec | Tasks |
|------|-------|
| §1 links | 1 |
| §2 cache + render | 2, 3 |
| §3 fetch/gen/prompts | 4, 5 |
| §4 errors/tests | all + 6 |
