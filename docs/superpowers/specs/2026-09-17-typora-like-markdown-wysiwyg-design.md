# Typora-like Markdown WYSIWYG (Preview Panel)

**Date:** 2026-09-17  
**Status:** Approved for planning (user OK on §§1–3)  
**Scope:** Replace Markdown source/preview split in the file Preview float with Typora-style instant-render editing.

## Goal

When opening a remote `.md` / `.markdown` file in the Preview panel, editing should feel like Typora: rendered typography by default, Markdown markers visible mainly on the focused line/block, while the on-disk format remains plain Markdown. Keep a pure source-code mode as a fallback.

## Non-goals

- Changing AI chat markdown (`AiMarkdown`) or HTML preview.
- Building a custom ProseMirror stack from scratch.
- Separate local-only vault / note app outside Preview.
- Replacing SSH load/save (`preview_open` / `preview_save`).

## Decisions (locked)

| Topic | Choice |
|--------|--------|
| Interaction model | Pure WYSIWYG (Typora-like), not split-pane |
| Source mode | Kept as fallback (toolbar toggle) |
| Feature depth (v1) | Full: basics + tables/images + task lists, footnotes, math, Mermaid |
| Delivery | One-shot (not phased) |
| Engine | Vditor **IR** (`mode: "ir"`) |

## Current state

- `MarkdownPreview`: `mode === "source"` → `EditableTextPreview` (textarea + hljs); `mode === "preview"` → `marked` → read-only HTML.
- Store: `markdownMode: "source" | "preview"` (default `"source"`).
- Load/save: Tauri `preview_open` / `preview_save` on the existing SSH session (SFTP / exec capture). No second login.
- No existing WYSIWYG / TipTap / Milkdown / Vditor usage.

## Architecture

```
PreviewPanel (shell, toolbar, search, save)
  └─ MarkdownPreview
       ├─ source  → EditableTextPreview (unchanged)
       └─ wysiwyg → MarkdownWysiwygEditor (Vditor IR)
```

- Default mode for new markdown tabs: **`wysiwyg`**.
- Mode type: `"wysiwyg" | "source"`. Persist/migrate legacy `"preview"` → `"wysiwyg"`.
- Toolbar:
  - Eye / rendered icon → WYSIWYG (editable IR), not read-only preview.
  - `</>` → source fallback.
- Remove the read-only `marked` preview path for markdown files (IR supersedes it).
- Disk format: always Markdown string via Vditor `getValue()` / source textarea; existing dirty detection and `preview_save` unchanged.

## Components & data flow

### New: `MarkdownWysiwygEditor`

- React wrapper around Vditor instance lifecycle (`create` / `destroy` on mount/unmount/tab switch).
- Options: `mode: "ir"`, theme tied to app dark/light, toolbar subset appropriate for Preview float.
- `value` from `editedContent ?? text_content`; `input`/`blur` → `onChange` → `previewStore` `editedContent`.
- `editable: false` → Vditor read-only.
- `data-testid="preview-markdown-wysiwyg"` for E2E.

### Sync on mode switch

- Before source → wysiwyg or wysiwyg → source: flush latest Markdown into store so neither side shows stale text.
- Reuse / extend `previewEditorFlush` patterns so Save always sees current buffer.

### Images (remote)

- Relative image paths resolve against the markdown file’s directory on the remote host.
- Fetch via existing session-backed preview/media path (or equivalent invoke); display blob/data URL in editor.
- Failure → placeholder; user can fix path in source mode.
- Paste/insert image: write bytes into the **same directory as the `.md` file** (unique filename from original name or timestamp), then insert `![…](relative-name)` Markdown; if write fails, show error and do not pretend success.

### Preview search

- Existing Preview search bar keeps working in **source** mode (current textarea match UX).
- In **wysiwyg** mode v1: either wire Vditor’s built-in find, or no-op the panel search with a short hint to switch to source for regex/advanced search — prefer wiring Vditor find when low-cost; do not break source search.

### Feature set (v1 — all required)

- Headings, paragraphs, bold/italic, lists, blockquotes, links, inline code, fenced code, hr
- Tables, images
- Task lists, footnotes
- Math (KaTeX via Vditor), Mermaid diagrams

## Error handling & boundaries

- Read-only remote files: IR non-editable; save disabled as today.
- Vditor init failure: surface error in panel; offer switch to source.
- Very large files: if IR is sluggish, messaging may suggest source mode (no hard size blacklist / special-case filenames).
- HTML / image / PDF / other preview kinds unchanged.
- External content in markdown remains untrusted display data (no elevated authority).

## Testing

### Unit / smoke

- Default `markdownMode` is `wysiwyg`; `"preview"` migrates to `wysiwyg`.
- Mode-switch sync helper: content identical after round-trip.
- Relative image path resolver unit tests.
- Smoke: Vditor dependency wired; `MarkdownWysiwygEditor` mounted for markdown wysiwyg; update `docs/TEST_MATRIX.md` preview row.

### E2E

- Open `.md` → WYSIWYG container visible by default.
- Toggle source ↔ wysiwyg without content loss.
- Read-only mock: not editable (when mock supports it).

### Acceptance

- Edit headings/lists/tables/task lists in IR; save yields valid Markdown on remote.
- Math, Mermaid, footnotes render; complex cases recoverable via source.
- Relative images show or fail clearly with placeholder.
- `./scripts/run-all-tests.sh` passes.

## Implementation sketch (for plan, not yet executed)

1. Add `vditor` dependency + CSS; theme bridge.
2. Introduce mode rename/migration + i18n (`modeWysiwyg` vs old preview copy).
3. Build `MarkdownWysiwygEditor`; wire `MarkdownPreview` / `PreviewPanel`.
4. Image resolve + paste path.
5. Tests + TEST_MATRIX + smoke.
6. Full suite green.

## Out of scope follow-ups (explicit)

- Collaborative editing, version history UI, export to PDF/DOCX from Preview.
- Custom Markdown dialect beyond what Vditor IR supports with stock plugins.
