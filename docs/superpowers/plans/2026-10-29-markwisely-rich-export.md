# MarkWisely Rich Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add polished HTML, PDF, and editable DOCX exports from MarkWisely; Markdown remains the editable source and is not an export option.

**Architecture:** A focused export module parses Markdown into reusable block/inline nodes. DOCX serializes those nodes with the `docx` library; HTML emits a safe styled standalone document; PDF uses safe, print-styled HTML and the WebView system print flow. A base64 local-byte-write command persists DOCX output to the selected destination. `MarkWiselyWindow` owns only the format menu and output routing.

**Tech Stack:** React, TypeScript, `marked`, `docx`, Tauri save dialog, browser print API, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-markwisely-rich-export-design.md`

## Global Constraints

- Do not offer Markdown as an export format; preserve autosave, local/SSH document behavior, and source content.
- Do not execute raw Markdown HTML in PDF print content.
- HTML and DOCX use a native save dialog; PDF uses system print-to-PDF.
- Tests must cover common structure: headings, inline formatting, lists, quotes, code, links, and tables.
- Run `node scripts/check-no-agent-hardcoding.mjs` and `./scripts/run-all-tests.sh` before completion.

## Review Focus

- Malicious/raw HTML in Markdown: print output strips executable markup; unit test owns this.
- Chinese text and long pages: print HTML uses system font stack, page margins, and break rules; unit test pins print CSS contract.
- Markdown with inline formatting, nested lists, tables, or empty content: DOCX node mapping remains structured; unit tests cover representative tokens.
- Save dialog cancellation and failures: no false success toast; Playwright covers these paths.
- DOCX/PDF export while autosave is pending: exports latest editor buffer; Playwright covers edited content.

## 要保住的旧行为

- 编辑器的 Open、Open Folder、Save、Save As 与自动保存继续使用现有路径，导出不改动当前 Markdown 源文件。
- Local 与 SSH 文档仍按各自目标打开和保存；导出的 HTML、PDF、Word 文件写入用户选择的本机位置。
- 编辑器格式工具栏仍能操作正文，导出使用最新编辑缓冲区，即使自动保存尚未完成。

## 架构

- Markdown 解析和 HTML、打印 HTML、DOCX 序列化集中在 `src/lib/markWiselyExport.ts`；`MarkWiselyWindow.tsx` 仅负责格式菜单、保存对话框、打印交接和反馈。
- HTML/DOCX 由 Tauri 本机保存对话框选目标；DOCX 字节经 `src/lib/localFsApi.ts` 与窄范围 Rust 命令写入所选路径。PDF 使用隔离的打印文档和系统打印对话框。
- 任务 1 覆盖模型、渲染器和二进制写入接口；任务 2 接入界面及 E2E mock；不拆分既有超大组件之外的文件。

## 设计

- 点击工具栏 Export 后显示 HTML、PDF、Word 三项，不提供 Markdown。
- HTML 与 Word 打开带对应扩展名和过滤器的系统保存对话框；取消不产生文件或成功提示。PDF 以当前文档标题打开系统打印对话框，由用户选择打印或存储为 PDF。
- 成功的 HTML/Word 导出在右下角提示路径；取消无提示；失败显示错误提示和编辑器内错误。导出内容采用适合屏幕阅读/打印的中文字体、标题层级、表格边框、代码块背景和分页规则。

---

### Task 1: Markdown export model and document renderers

**Files:**
- Create: `src/lib/markWiselyExport.ts`
- Create: `src/lib/markWiselyExport.test.ts`
- Modify: `src-tauri/src/fs_local.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src/lib/localFsApi.ts`
- Modify: `src/lib/localFsApi.test.ts`
- Modify: `package.json`, `package-lock.json` (add `docx` runtime dependency)
- Create: `docs/superpowers/plans/2026-10-29-markwisely-rich-export.md`
- Create: `docs/superpowers/specs/2026-10-29-markwisely-rich-export-design.md`

**Interfaces:**
- Produces `parseMarkdownExport(markdown: string): ExportBlock[]`, `renderMarkdownPrintHtml(markdown: string, title: string): string`, and `createMarkdownDocx(markdown: string, title: string): Promise<Uint8Array>`.
- Also produces `renderMarkdownHtml(markdown: string, title: string): string` for standalone HTML output.
- `ExportBlock` covers heading, paragraph, list, quote, code, and table; inline runs preserve strong, emphasis, strike, code, and links.

- [ ] **Step 1: Write failing tests** for Markdown block/inline mapping, HTML/print rendering, DOCX archive output, local binary-write API wiring, and Rust binary writes plus invalid base64/missing-file errors.
- [ ] **Step 2: Run** `npm test -- --run src/lib/markWiselyExport.test.ts src/lib/localFsApi.test.ts` and the focused Rust filesystem test; confirm failures because the renderers and binary-write command do not exist.
- [ ] **Step 3: Implement** the typed token-to-block parser, safe print HTML renderer, and DOCX serializer. Add `docx` as a direct production dependency. Use system CJK font fallbacks in print HTML and Word styles; preserve links and table borders; use page-safe code/table styling.
- [ ] **Step 4: Run** both focused Vitest files and `cargo test fs_local::tests::writes_binary_export_bytes --lib`; confirm all pass.
- [ ] **Step 5: Commit** only the export module, binary-write API, dependency, tests, plan, and design document.

### Task 2: Export format menu and save/print flows

**Files:**
- Modify: `src/components/desktop/MarkWiselyWindow.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Modify: `src/i18n/locales/en/tools.json`
- Modify: `src/i18n/locales/zh-CN/tools.json`
- Modify: `src/e2e/tauriCoreMock.ts`
- Modify: `src/e2eBootstrap.ts`, `e2e/tw-e2e.ts` (expose export test controls)
- Modify: `e2e/host-desktop.spec.ts`

**Interfaces:**
- Consumes the renderer interfaces from Task 1.
- Export menu actions: HTML saves a styled `.html`, Word saves DOCX bytes with `.docx`, and PDF opens a print-ready document using the latest editor buffer. Markdown is not offered.

- [ ] **Step 1: Add failing Playwright coverage** for the HTML/PDF/Word-only format menu, proper HTML/DOCX export extensions, generated Word bytes, PDF print content, current unsaved edits, cancellation, and export failure.
- [ ] **Step 2: Run** `npm run test:e2e -- --grep "MarkWisely.*export"`; confirm the format options and expected flows fail against the existing single-format export.
- [ ] **Step 3: Implement** localized format menu, accessible labels/test IDs, native filters, PDF print document handoff, and accurate success/failure toasts. Ensure menu closes after selection and no operation changes the source file.
- [ ] **Step 4: Run** the focused Playwright export tests and `npm run build`; confirm they pass.
- [ ] **Step 5: Commit** only the listed component, localization, mock, and E2E changes.

### Task 3: Full verification

**Files:**
- Modify: `docs/TEST_MATRIX.md` only if its existing MarkWisely row does not already cover export.

- [ ] **Step 1: Run** `node scripts/check-no-agent-hardcoding.mjs`; expect PASS.
- [ ] **Step 2: Run** `./scripts/run-all-tests.sh`; expect all suites PASS.
- [ ] **Step 3: Commit** any required test matrix update and push the completed commits to `origin main` per repository policy.
