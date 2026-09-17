# Typora-like Markdown WYSIWYG Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Markdown Preview’s source/`marked`-preview split with Vditor IR (Typora-like WYSIWYG), keep source as fallback, still save plain Markdown over existing SSH `preview_*` APIs.

**Architecture:** Add pure helpers (mode normalize, image path resolve) + `MarkdownWysiwygEditor` (Vditor IR). Wire `MarkdownPreview` / `PreviewPanel` / `previewStore` so `.md` defaults to `wysiwyg`; HTML preview keeps `source`/`preview`. Register Vditor with `previewEditorFlush` so Save always gets `getValue()`.

**Tech Stack:** React 18, Zustand (`previewStore`), Vditor IR, existing Tauri `preview_open`/`preview_save` + SFTP `read_remote_file_bytes` / `write_remote_bytes`, Vitest, Playwright, smoke checklist.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-17-typora-like-markdown-wysiwyg-design.md`
- Engine: Vditor `mode: "ir"` only for markdown WYSIWYG
- Disk format: raw Markdown; no second SSH login; use existing session handle
- Do not change `AiMarkdown` or invent task-specific hardcoding
- Git: develop on `main` only; **commit only when the user explicitly asks** (skip plan “Commit” steps unless requested)
- New features need tests; finish with `./scripts/run-all-tests.sh` green
- `tsconfig.json` excludes `src/**/*.test.ts` from app `tsc` (keep it that way)

---

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/previewMarkdownMode.ts` | Normalize/migrate mode for markdown tabs |
| `src/lib/previewMarkdownMode.test.ts` | Mode defaults + migration tests |
| `src/lib/markdownImagePath.ts` | Resolve relative image URLs vs md directory |
| `src/lib/markdownImagePath.test.ts` | Path resolver tests |
| `src/components/preview/MarkdownWysiwygEditor.tsx` | Vditor IR React wrapper + flush + theme |
| `src/components/preview/MarkdownPreview.tsx` | Route source vs wysiwyg |
| `src/stores/previewTypes.ts` / `previewStore.ts` | Mode union + default `wysiwyg` for new tabs |
| `src/components/PreviewPanel.tsx` | Toolbar labels; md eye → wysiwyg; search UX |
| `src/i18n/locales/{en,zh-CN}/preview.json` | `modeWysiwyg` copy |
| `src-tauri/src/commands/mod.rs` (+ preview helpers) | Optional `preview_read_bytes` / write for images if no existing FE invoke |
| `src/lib/previewRemoteBytes.ts` | FE invoke wrappers for image load/save |
| `e2e/preview-markdown-wysiwyg.spec.ts` | Default mode + toggle round-trip |
| `scripts/smoke-product-checklist.mjs` | Vditor + editor wiring checks |
| `docs/TEST_MATRIX.md` | Update preview/markdown row |
| `package.json` | Add `vditor` dependency |

---

### Task 1: Markdown mode normalize + default

**Files:**
- Create: `src/lib/previewMarkdownMode.ts`
- Create: `src/lib/previewMarkdownMode.test.ts`
- Modify: `src/stores/previewTypes.ts`
- Modify: `src/stores/previewStore.ts` (type on `setMarkdownMode` only if needed)

**Interfaces:**
- Produces:
  - `export type PreviewMarkdownMode = "source" | "wysiwyg"`
  - `export type PreviewViewMode = "source" | "preview" | "wysiwyg"` — store field (HTML still uses `preview`)
  - `export function normalizeMarkdownMode(mode: string | null | undefined): PreviewMarkdownMode`
  - `export function markdownModeFromViewMode(mode: PreviewViewMode): PreviewMarkdownMode` — `"preview"` → `"wysiwyg"`
  - `export function viewModeForMarkdownToggle(target: "source" | "wysiwyg"): PreviewViewMode`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/previewMarkdownMode.test.ts
import { describe, expect, it } from "vitest";
import {
  normalizeMarkdownMode,
  markdownModeFromViewMode,
  viewModeForMarkdownToggle,
} from "./previewMarkdownMode";

describe("previewMarkdownMode", () => {
  it("defaults unknown/empty to wysiwyg", () => {
    expect(normalizeMarkdownMode(undefined)).toBe("wysiwyg");
    expect(normalizeMarkdownMode("")).toBe("wysiwyg");
    expect(normalizeMarkdownMode("nope")).toBe("wysiwyg");
  });

  it("keeps source and wysiwyg", () => {
    expect(normalizeMarkdownMode("source")).toBe("source");
    expect(normalizeMarkdownMode("wysiwyg")).toBe("wysiwyg");
  });

  it("migrates legacy preview to wysiwyg for markdown", () => {
    expect(normalizeMarkdownMode("preview")).toBe("wysiwyg");
    expect(markdownModeFromViewMode("preview")).toBe("wysiwyg");
    expect(markdownModeFromViewMode("source")).toBe("source");
    expect(markdownModeFromViewMode("wysiwyg")).toBe("wysiwyg");
  });

  it("toolbar targets map to store view modes", () => {
    expect(viewModeForMarkdownToggle("source")).toBe("source");
    expect(viewModeForMarkdownToggle("wysiwyg")).toBe("wysiwyg");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run src/lib/previewMarkdownMode.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/previewMarkdownMode.ts
export type PreviewMarkdownMode = "source" | "wysiwyg";
export type PreviewViewMode = "source" | "preview" | "wysiwyg";

export function normalizeMarkdownMode(
  mode: string | null | undefined,
): PreviewMarkdownMode {
  if (mode === "source") return "source";
  if (mode === "wysiwyg" || mode === "preview") return "wysiwyg";
  return "wysiwyg";
}

export function markdownModeFromViewMode(
  mode: PreviewViewMode,
): PreviewMarkdownMode {
  return normalizeMarkdownMode(mode);
}

export function viewModeForMarkdownToggle(
  target: PreviewMarkdownMode,
): PreviewViewMode {
  return target;
}
```

Update `previewTypes.ts`:

```ts
markdownMode: PreviewViewMode; // import type
// createPreviewTab: markdownMode: "wysiwyg",
```

Update `previewStore.ts` `setMarkdownMode` param to `PreviewViewMode`.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run src/lib/previewMarkdownMode.test.ts`  
Expected: PASS

- [ ] **Step 5: Commit** — only if user asked

---

### Task 2: Relative markdown image path resolver

**Files:**
- Create: `src/lib/markdownImagePath.ts`
- Create: `src/lib/markdownImagePath.test.ts`

**Interfaces:**
- Produces:
  - `export function parentRemoteDir(mdPath: string): string`
  - `export function resolveMarkdownImageSrc(mdPath: string, src: string): string | null`  
    — returns absolute remote path for relative/`./`/`../` local paths; returns `null` for empty, `http(s):`, `data:`, `//`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import {
  parentRemoteDir,
  resolveMarkdownImageSrc,
} from "./markdownImagePath";

describe("markdownImagePath", () => {
  it("parentRemoteDir strips filename", () => {
    expect(parentRemoteDir("/home/u/docs/a.md")).toBe("/home/u/docs");
    expect(parentRemoteDir("a.md")).toBe(".");
  });

  it("resolves relative and dotted paths", () => {
    expect(resolveMarkdownImageSrc("/home/u/docs/a.md", "img.png")).toBe(
      "/home/u/docs/img.png",
    );
    expect(resolveMarkdownImageSrc("/home/u/docs/a.md", "./x/y.png")).toBe(
      "/home/u/docs/x/y.png",
    );
    expect(resolveMarkdownImageSrc("/home/u/docs/a.md", "../pic.png")).toBe(
      "/home/u/pic.png",
    );
  });

  it("leaves remote/web/data urls alone (null = do not fetch via SSH)", () => {
    expect(resolveMarkdownImageSrc("/a.md", "https://x/y.png")).toBe(null);
    expect(resolveMarkdownImageSrc("/a.md", "http://x/y.png")).toBe(null);
    expect(resolveMarkdownImageSrc("/a.md", "data:image/png;base64,xx")).toBe(
      null,
    );
    expect(resolveMarkdownImageSrc("/a.md", "")).toBe(null);
  });
});
```

- [ ] **Step 2: Run test — expect FAIL**

Run: `npm test -- --run src/lib/markdownImagePath.test.ts`

- [ ] **Step 3: Implement**

Use POSIX-style join/normalize (no Node `path` in renderer). Reject `..` escape past root if path would become empty; still return a cleaned absolute path string. Do **not** special-case filenames or apps.

```ts
export function parentRemoteDir(mdPath: string): string {
  const normalized = mdPath.replace(/\\/g, "/");
  const i = normalized.lastIndexOf("/");
  if (i <= 0) return i === 0 ? "/" : ".";
  return normalized.slice(0, i) || "/";
}

export function resolveMarkdownImageSrc(
  mdPath: string,
  src: string,
): string | null {
  const s = src.trim();
  if (!s) return null;
  if (/^(https?:|data:|\/\/)/i.test(s)) return null;
  if (s.startsWith("/")) return s.replace(/\\/g, "/");
  const base = parentRemoteDir(mdPath);
  const joined = `${base === "/" ? "" : base}/${s}`.replace(/\\/g, "/");
  return normalizePosixPath(joined);
}

function normalizePosixPath(p: string): string {
  const parts = p.split("/");
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (out.length && out[out.length - 1] !== "..") out.pop();
      continue;
    }
    out.push(part);
  }
  return `/${out.join("/")}`;
}
```

(Adjust `normalizePosixPath` so `base === "."` cases still work in tests — if `parentRemoteDir` returns `.`, join to `./img` then normalize to `/img` or `img`; prefer absolute `/…` when mdPath was absolute.)

- [ ] **Step 4: Run test — expect PASS**

- [ ] **Step 5: Commit** — only if user asked

---

### Task 3: Remote bytes FE helpers (+ Rust command if missing)

**Files:**
- Create: `src/lib/previewRemoteBytes.ts`
- Create: `src/lib/previewRemoteBytes.test.ts` (pure filename helper only if no invoke in unit)
- Modify: `src-tauri/src/commands/mod.rs` — add `preview_read_bytes` / reuse save write if needed
- Modify: `src-tauri/src/lib.rs` — register command
- Possibly thin wrapper in `src-tauri/src/preview.rs`

**Interfaces:**
- Produces (FE):
  - `export function suggestPasteImageName(originalName: string, nowMs: number): string` — sanitize basename, default `paste-{nowMs}.png`
  - `export async function readPreviewRemoteBytes(sessionId: string, remotePath: string): Promise<Uint8Array>`
  - `export async function writePreviewRemoteBytes(sessionId: string, remotePath: string, bytes: Uint8Array): Promise<void>`
- Rust: `preview_read_bytes { session_id, path }` → `{ base64, mime_hint }` using existing `sftp::read_remote_file_bytes` on the **same** session handle; write can call existing save path or `sftp::write_remote_bytes` (sudo escalate same as `preview_save` if permission denied — mirror preview.rs patterns, no new SSH login).

- [ ] **Step 1: Failing test for name helper**

```ts
import { describe, expect, it } from "vitest";
import { suggestPasteImageName } from "./previewRemoteBytes";

describe("suggestPasteImageName", () => {
  it("keeps safe basename", () => {
    expect(suggestPasteImageName("Shot.PNG", 1)).toBe("Shot.PNG");
  });
  it("falls back when empty", () => {
    expect(suggestPasteImageName("", 42)).toBe("paste-42.png");
  });
  it("strips path segments", () => {
    expect(suggestPasteImageName("/tmp/a/b.jpg", 1)).toBe("b.jpg");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement helper + invoke wrappers + Rust command**

FE:

```ts
export function suggestPasteImageName(originalName: string, nowMs: number): string {
  const base = originalName.replace(/\\/g, "/").split("/").pop()?.trim() ?? "";
  if (!base || base === "." || base === "..") return `paste-${nowMs}.png`;
  return base.replace(/[^\w.\-()+ ]+/g, "_");
}

export async function readPreviewRemoteBytes(
  sessionId: string,
  remotePath: string,
): Promise<{ bytes: Uint8Array; mime: string }> {
  const { invoke } = await import("@tauri-apps/api/core");
  const res = await invoke<{ base64: string; mime_hint: string }>(
    "preview_read_bytes",
    { sessionId, path: remotePath },
  );
  const bin = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
  return { bytes: bin, mime: res.mime_hint || "application/octet-stream" };
}
```

Rust sketch (commands/mod.rs): look up session SSH handle → `sftp::read_remote_file_bytes` → base64; size-cap similar to text preview limits. Write: reuse preview save byte path or dedicated `preview_write_bytes`.

- [ ] **Step 4: `cd src-tauri && cargo test` for any new Rust unit tests; FE name helper PASS**

- [ ] **Step 5: Commit** — only if user asked

---

### Task 4: `MarkdownWysiwygEditor` (Vditor IR)

**Files:**
- Modify: `package.json` — `npm install vditor`
- Create: `src/components/preview/MarkdownWysiwygEditor.tsx`
- Modify: `src/App.css` — `.preview-markdown-wysiwyg` height 100%, theme vars bridge
- Create: `src/components/preview/markdownWysiwygFlush.test.ts` — test that document documents flush registration contract via small exported helper if needed

**Interfaces:**
- Consumes: `registerPreviewEditorFlush` / `unregisterPreviewEditorFlush` from `src/lib/previewEditorFlush.ts`
- Consumes: `resolveMarkdownImageSrc`, `readPreviewRemoteBytes`, `writePreviewRemoteBytes`, `suggestPasteImageName`, `parentRemoteDir`
- Produces: React component

```ts
export interface MarkdownWysiwygEditorProps {
  tabId: string;
  sessionId: string;
  filePath: string;
  text: string;
  editable: boolean;
  onChange?: (value: string) => void;
}
```

- [ ] **Step 1: Install dependency**

```bash
npm install vditor
```

- [ ] **Step 2: Implement editor**

Requirements inside the component:

1. `import Vditor from "vditor"` and `import "vditor/dist/index.css"`.
2. Mount on a `div` ref; `new Vditor(el, { mode: "ir", value: text, cdn: … })`. Prefer bundling from `node_modules/vditor/dist` so KaTeX/Mermaid work offline — set `cdn` to a path Vite can serve, or Vditor’s documented self-host approach for this repo (document the chosen URL in a one-line comment).
3. Theme: read document/`data-theme` / existing app theme class; `theme` / `preview.theme` dark|light; re-apply on theme change via MutationObserver or store subscription already used elsewhere.
4. `input` / `blur` → `onChange?.(vditor.getValue())`.
5. `useEffect` register flush: `() => vditor.getValue()`; unregister on cleanup; destroy Vditor on unmount.
6. When `text` changes from outside (tab switch) and differs from `getValue()`, `vditor.setValue(text)`.
7. `editable === false` → `vditor.disabled()` / destroy+recreate readOnly if API requires.
8. `data-testid="preview-markdown-wysiwyg"` on wrapper.
9. **Images:** `upload.handler` async: write bytes beside md via `writePreviewRemoteBytes(sessionId, parentRemoteDir(filePath) + "/" + suggestPasteImageName(...))`, return Markdown image syntax Vditor expects (follow Vditor upload handler return format from its types).
10. After render, rewrite relative `<img src>` by resolving path + `readPreviewRemoteBytes` → blob URL; revoke URLs on cleanup.
11. Init failure: render error + suggest source mode (i18n key `wysiwygInitFailed`).

Enable footnotes / math / mermaid via Vditor options (`preview.math`, `preview.mermaid`, etc. per Vditor docs — turn on, don’t invent custom parsers).

- [ ] **Step 3: Manual sanity in unit — export a tiny pure `bytesToObjectUrl` if useful and test revoke list helper; otherwise rely on E2E**

- [ ] **Step 4: Commit** — only if user asked

---

### Task 5: Wire `MarkdownPreview` + `PreviewPanel` + i18n + search

**Files:**
- Modify: `src/components/preview/MarkdownPreview.tsx`
- Modify: `src/components/PreviewPanel.tsx`
- Modify: `src/i18n/locales/en/preview.json`
- Modify: `src/i18n/locales/zh-CN/preview.json`
- Modify: `src/components/preview/HtmlPreview.tsx` only if mode prop typing requires it (keep `source` | `preview`)

**Interfaces:**
- Consumes: `markdownModeFromViewMode`, `viewModeForMarkdownToggle`

- [ ] **Step 1: Update i18n**

```json
"modeWysiwyg": "WYSIWYG",
"modePreview": "Preview",
"wysiwygInitFailed": "Rich editor failed to start. Switch to Source.",
"wysiwygSearchHint": "Switch to Source for advanced search"
```

zh-CN: `"所见即所得"`, etc.

- [ ] **Step 2: Rewrite MarkdownPreview**

```tsx
import { markdownModeFromViewMode, type PreviewViewMode } from "../../lib/previewMarkdownMode";
import { MarkdownWysiwygEditor } from "./MarkdownWysiwygEditor";

// props.mode: PreviewViewMode
const mdMode = markdownModeFromViewMode(mode === "preview" ? "preview" : mode);

if (mdMode === "source") {
  return <EditableTextPreview ... />;
}
return (
  <MarkdownWysiwygEditor
    tabId={tabId!}
    sessionId={sessionId!}  // add prop from PreviewPanel
    filePath={filePath!}
    text={text}
    editable={editable}
    onChange={onChange}
  />
);
```

Pass `sessionId` + `filePath` from `PreviewPanel` active tab (already available).

- [ ] **Step 3: PreviewPanel toolbar**

For `data.kind === "markdown"`:

- Source button → `setMarkdownMode(viewModeForMarkdownToggle("source"))` after `flushPreviewEditor(activeTab.id)` into `setEditedContent`.
- Eye button → flush then `setMarkdownMode("wysiwyg")`; `title={t("modeWysiwyg")}`; active when `markdownModeFromViewMode(markdownMode) === "wysiwyg"`.

For `data.kind === "html"`: keep eye → `"preview"`, labels `modePreview`.

Before any mode click for markdown:

```ts
const flushed = flushPreviewEditor(activeTab.id);
if (flushed != null) setEditedContent(flushed);
```

Search bar:

- HTML: unchanged (`markdownMode !== "preview"`).
- Markdown: show search when `mdMode === "source"`; when wysiwyg, either hide regex cluster and show short hint using `wysiwygSearchHint`, **or** if Task 4 wired Vditor find to the same input, keep input and call into editor — prefer hint+source for v1 if Vditor find wiring is costly (matches spec preference).

Remove `marked` usage from `MarkdownPreview` (may keep `marked` dep for AI chat).

- [ ] **Step 4: Typecheck / unit**

Run: `npm test -- --run src/lib/previewMarkdownMode.test.ts src/lib/markdownImagePath.test.ts`  
Run: `npx tsc --noEmit` (via `npm run build` later in full suite)

- [ ] **Step 5: Commit** — only if user asked

---

### Task 6: Smoke, TEST_MATRIX, Playwright E2E

**Files:**
- Modify: `scripts/smoke-product-checklist.mjs`
- Modify: `docs/TEST_MATRIX.md`
- Create: `e2e/preview-markdown-wysiwyg.spec.ts`
- Modify: `src/e2e/tauriCoreMock.ts` if needed to open markdown preview with text

- [ ] **Step 1: Smoke checks**

Assert:

- `package.json` includes `"vditor"`
- `MarkdownWysiwygEditor.tsx` exists and contains `mode: "ir"` (or `mode:"ir"`)
- `previewTypes` / mode helper default wysiwyg
- `data-testid="preview-markdown-wysiwyg"`

- [ ] **Step 2: TEST_MATRIX**

Update row for Text/Markdown preview to mention Vditor IR + mode tests + e2e spec.

- [ ] **Step 3: E2E**

```ts
// e2e/preview-markdown-wysiwyg.spec.ts
test("markdown opens in wysiwyg by default", async ({ page }) => {
  // use existing mock: open preview for *.md with text_content
  await expect(page.getByTestId("preview-markdown-wysiwyg")).toBeVisible();
});

test("source toggle round-trips without losing body text", async ({ page }) => {
  // set content with unique string in mock
  // click source, assert textarea/editor contains string
  // click wysiwyg, assert wysiwyg visible and string still in store/DOM
});
```

Wire mock `preview_open` to return `kind: "markdown"`, `editable: true`, known `text_content`.

- [ ] **Step 4: Run smoke + e2e slice**

```bash
npm run test:smoke
npm run test:e2e
```

Expected: PASS (or fix until green)

- [ ] **Step 5: Commit** — only if user asked

---

### Task 7: Full regression

- [ ] **Step 1: Run**

```bash
./scripts/run-all-tests.sh
```

Expected: `All automated tests PASSED.`

- [ ] **Step 2: Fix any failures** without narrowing feature scope; no hardcoding.

- [ ] **Step 3: Commit** — only if user asked

---

## Spec coverage checklist (self-review)

| Spec requirement | Task |
|------------------|------|
| Default WYSIWYG / Typora IR | 1, 4, 5 |
| Source fallback toolbar | 5 |
| Remove read-only marked preview for md | 5 |
| Save raw MD via existing preview_save + flush | 4, 5 |
| Tables/images/task/footnotes/math/mermaid | 4 (Vditor options) |
| Relative image resolve + SSH fetch | 2, 3, 4 |
| Paste image same dir | 3, 4 |
| Read-only files | 4 |
| Init failure → source hint | 4, 5 i18n |
| Search: source full; wysiwyg hint or Vditor find | 5 |
| HTML preview unchanged | 5 |
| Tests + TEST_MATRIX + full suite | 1, 2, 6, 7 |
| No AiMarkdown change | — (non-goal) |

## Placeholder / consistency notes

- Store field remains `markdownMode` but type is `PreviewViewMode` (`source` \| `preview` \| `wysiwyg`) so HTML keeps `preview`.
- Markdown UI never sets `preview` going forward; legacy `preview` normalizes to `wysiwyg`.
- Commit steps are optional under project git rules.
