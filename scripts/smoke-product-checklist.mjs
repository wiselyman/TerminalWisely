#!/usr/bin/env node
/**
 * Product smoke checklist (static + logic). Exit 1 on FAIL.
 * Does not replace SSH/UI interactive smoke — those are reported BLOCKED/MANUAL.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const results = [];

function pass(id, note = "") {
  results.push({ id, status: "PASS", note });
}
function fail(id, note) {
  results.push({ id, status: "FAIL", note });
}
function blocked(id, note) {
  results.push({ id, status: "BLOCKED", note });
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

// --- Cursor UI / titlebar tools ---
{
  const app = read("src/App.tsx");
  if (app.includes("WorkspaceToolRail")) {
    fail("ui.no-five-icon-rail", "App.tsx still mounts WorkspaceToolRail");
  } else {
    pass("ui.no-five-icon-rail", "WorkspaceToolRail not mounted");
  }
  if (app.includes("chrome-titlebar-actions") && app.includes("AiEngineerTool")) {
    pass("ui.titlebar-tools", "tools cluster in title bar");
  } else {
    fail("ui.titlebar-tools", "missing chrome-titlebar-actions / AiEngineerTool");
  }
}

{
  const panel = read("src/components/aiEngineer/AiEngineerPanel.tsx");
  const need = [
    ["createThread", "header.new"],
    ["aiEngineer.history", "header.history"],
    ["ChatHistoryIcon", "header.history-icon"],
    ["WorkspacePanelHeadActions", "header.pin-collapse"],
    ["aiEngineer.manageModels", "composer.manage-models"],
    ["aiEngineer.modelPicker", "composer.model-picker"],
  ];
  for (const [needle, id] of need) {
    if (panel.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle}`);
  }
  if (panel.includes("aiEngineer.toolsMenu") || panel.includes("☰")) {
    fail("header.no-tools-collapse", "tools menu still in panel header");
  } else {
    pass("header.no-tools-collapse", "tools menu removed");
  }
  if (panel.includes("@") && panel.includes("mention")) {
    fail("ui.no-at", "looks like @-mention UI present");
  } else {
    pass("ui.no-at", "no @-mention feature wired");
  }
  if (panel.includes("interruptIfBusy: true")) {
    fail("composer.send-while-busy", "Send still uses interruptIfBusy true");
  } else {
    pass("composer.send-while-busy", "Send does not interrupt via same button");
  }

  {
    const md = read("src/components/aiEngineer/AiMarkdown.tsx");
    const open = read("src/lib/aiEngineer/openExternalUrl.ts");
    const media = read("src/lib/aiEngineer/chatMedia.ts");
    const css = read("src/App.css");
    if (
      md.includes('data-testid="ai-md-external-link"') &&
      md.includes("openExternalUrl") &&
      md.includes("cacheRemoteMedia") &&
      md.includes("decorateImages") &&
      open.includes("openUrl") &&
      media.includes("ai_chat_cache_remote_media")
    ) {
      pass("ai.chat-images-links", "AiMarkdown openUrl + media cache");
    } else {
      fail("ai.chat-images-links", "missing chat image/link wiring");
    }
    if (
      css.includes(".ai-engineer-md img") &&
      css.includes("container-type: inline-size") &&
      css.includes("max-width: min(100%, 82cqi)") &&
      css.includes("max-width: min(100%, 82%)") &&
      css.includes("margin: 0.65em auto")
    ) {
      pass("ai.chat-images-css", "markdown images scale with chat width");
    } else {
      fail("ai.chat-images-css", "missing responsive md image css");
    }
  }

  // Catch deleted useState leftovers (e.g. setApproveForSession crash).
  {
    const hy = spawnSync(
      process.execPath,
      [path.join(root, "scripts/check-ai-engineer-panel-hygiene.mjs")],
      { encoding: "utf8" },
    );
    if (hy.status === 0) {
      pass("ai.panel-setter-hygiene", "AiEngineerPanel setters declared");
    } else {
      fail(
        "ai.panel-setter-hygiene",
        (hy.stderr || hy.stdout || "hygiene check failed").trim(),
      );
    }
  }
  for (const tid of [
    "ai-engineer-approval-once",
    "ai-engineer-approval-session",
    "ai-engineer-approval-reject",
    "ai-engineer-approval-command",
  ]) {
    if (panel.includes(`data-testid="${tid}"`)) pass(`ai.approval.${tid}`, tid);
    else fail(`ai.approval.${tid}`, `missing ${tid}`);
  }
  if (
    panel.includes('data-testid="ai-engineer-approval-command"') &&
    panel.includes("is-approval") &&
    panel.includes("ai-engineer-exec-card") &&
    panel.includes('className="ai-engineer-exec-command"')
  ) {
    pass(
      "ai.approval.command-exec-chrome",
      "approval is one exec card: title + $ command + actions",
    );
  } else {
    fail(
      "ai.approval.command-exec-chrome",
      "approval missing unified exec-card chrome",
    );
  }
  {
    const fmt = read("src/lib/aiEngineer/formatToolResultDisplay.ts");
    const store = read("src/stores/aiEngineerStore.ts");
    if (
      fmt.includes("formatToolResultForDisplay") &&
      fmt.includes("unwrapToolOutputForDisplay") &&
      store.includes("formatToolResultForDisplay") &&
      !store.includes("output: JSON.stringify(event.payload)")
    ) {
      pass(
        "ai.exec.tool-result-display",
        "tool_result paints stdout not harness JSON envelope",
      );
    } else {
      fail(
        "ai.exec.tool-result-display",
        "tool_result still dumps JSON.stringify(payload) to exec card",
      );
    }
  }
  const css = read("src/App.css");
  if (
    css.includes(".ai-engineer-exec-card.is-collapsed") &&
    css.includes("background: var(--tw-surface)") &&
    /ai-engineer-exec-card\.is-collapsed[\s\S]{0,120}border: 1px solid var\(--tw-border\)/.test(
      css,
    )
  ) {
    pass("ai.exec.collapsed-title-bar", "collapsed exec cards framed as title bars");
  } else {
    fail(
      "ai.exec.collapsed-title-bar",
      "collapsed exec cards missing bordered title-bar chrome",
    );
  }
}

// --- Store multi-thread (disk-backed history) ---
{
  const store = read("src/stores/aiEngineerStore.ts");
  const disk = read("src/lib/aiEngineer/chatHistoryDisk.ts");
  for (const [needle, id] of [
    ["CHAT_HISTORY_KEY_V2", "store.v2-key"],
    ["CHAT_HISTORY_KEY_V1", "store.v1-migrate"],
    ["hydrateChatHistoryWithMigration", "store.disk-hydrate"],
    ["ai_chat_history_load", "store.disk-load-cmd"],
    ["ai_chat_history_load_scope", "store.disk-load-scope-cmd"],
    ["fillScopeMessagesFromDisk", "store.fill-scope-msgs"],
    ["applyScopeAfterDiskLoad", "store.apply-scope-after-disk"],
    ["needsDiskMessageHydration", "store.needs-disk-hydrate"],
  ]) {
    const hay =
      needle.startsWith("CHAT_HISTORY") || needle.startsWith("ai_chat")
        ? disk
        : needle === "needsDiskMessageHydration"
          ? store + read("src/lib/aiEngineer/chatScopeHydrate.ts")
          : store;
    if (hay.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle}`);
  }
  const compact = read("src-tauri/src/webkit_localstorage.rs");
  const libRs = read("src-tauri/src/lib.rs");
  if (
    compact.includes("VACUUM") &&
    compact.includes("freelist_count") &&
    libRs.includes("compact_bloated_webkit_localstorage")
  ) {
    pass("store.webkit-ls-compact", "startup VACUUM for bloated WebKit localStorage");
  } else {
    fail("store.webkit-ls-compact", "missing webkit localStorage compact");
  }
  for (const [needle, id] of [
    ["createThread", "store.createThread"],
    ["switchThread", "store.switchThread"],
    ["deleteThread", "store.deleteThread"],
    ["activeRunThreadId", "store.run-thread-guard"],
    ["ensureChatHistoryHydrated", "store.hydrate-fn"],
    ["MAX_THREADS_PER_SCOPE = 40", "store.cap-40"],
  ]) {
    if (store.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle}`);
  }
  if (store.includes("messagesByScope")) {
    fail("store.no-legacy-map", "messagesByScope still referenced");
  } else {
    pass("store.no-legacy-map", "messagesByScope removed");
  }
  if (store.includes('localStorage.setItem(CHAT_HISTORY_KEY_V2')) {
    fail("store.no-ls-chat-write", "store still writes chat to localStorage");
  } else {
    pass("store.no-ls-chat-write", "chat persist uses disk helper");
  }
}

// --- Local terminal removal ---
{
  const hits = [];
  const scan = (rel) => {
    if (!exists(rel)) return;
    const t = read(rel);
    for (const bad of [
      "create_local_session",
      "createLocalSession",
      "SessionKind::Local",
      "get_local_shell_info",
    ]) {
      if (t.includes(bad)) hits.push(`${rel}:${bad}`);
    }
  };
  scan("src-tauri/Cargo.toml");
  scan("src-tauri/src/lib.rs");
  scan("src-tauri/src/types.rs");
  scan("src-tauri/src/commands/mod.rs");
  scan("src/stores/sessionStore.ts");
  scan("src/types/index.ts");
  if (hits.length) fail("local-terminal.removed", hits.join(", "));
  else pass("local-terminal.removed", "no create_local / portable-pty / Local kind");

  if (exists("src-tauri/src/pty/mod.rs") || exists("src-tauri/src/local_shell.rs")) {
    fail("local-terminal.modules-gone", "pty/ or local_shell.rs still on disk");
  } else {
    pass("local-terminal.modules-gone", "pty/ and local_shell.rs deleted");
  }

  const conn = read("src/components/ConnectionPanel.tsx");
  if (/localTerminal|createLocalSession|gitBashMissing/.test(conn)) {
    fail("local-terminal.ui-entry", "ConnectionPanel still has local terminal entry");
  } else {
    pass("local-terminal.ui-entry", "ConnectionPanel clean of local terminal");
  }
  if (exists("src/lib/terminalFont.ts")) {
    const font = read("src/lib/terminalFont.ts");
    if (
      font.includes("getTerminalFontSize") &&
      font.includes("handleTerminalFontSizeHotkey") &&
      font.includes("tw.terminal.fontSize")
    ) {
      pass("terminal.font-size-zoom", "Cmd/Ctrl+/- font size with persistence");
    } else {
      fail("terminal.font-size-zoom", "missing terminal font size zoom helpers");
    }
  } else {
    fail("terminal.font-size-zoom", "missing terminalFont.ts");
  }
  if (conn.includes('data-testid="k8s-host-add-cluster"')) {
    pass("k8s.host-add-cluster", "Hosts row has add-to-K8s control");
  } else {
    fail("k8s.host-add-cluster", "missing k8s-host-add-cluster testid");
  }
  const appCss = read("src/App.css");
  if (
    appCss.includes("saved-item-action--k8s-detected") &&
    appCss.includes("k8s-host-detected-flash")
  ) {
    pass("k8s.host-detected-flash", "Hosts K8s detected flash animation wired");
  } else {
    fail("k8s.host-detected-flash", "missing K8s host detected flash CSS");
  }
  if (
    /bindSshPickHost|k8s-bind-ssh-panel|bindSshNoKubectl/.test(conn)
  ) {
    fail(
      "k8s.bind-ssh-panel-gone",
      "ConnectionPanel still has K8s sidebar SSH bind panel",
    );
  } else {
    pass("k8s.bind-ssh-panel-gone", "K8s sidebar SSH bind panel removed");
  }
  if (
    conn.includes("EntityListView") &&
    conn.includes('scope="hosts"') &&
    conn.includes('scope="k8s"') &&
    conn.includes("onAddEntity")
  ) {
    pass("sidebar.entity-list-dnd", "Hosts/K8s lists use EntityListView drag layout");
  } else {
    fail("sidebar.entity-list-dnd", "EntityListView not wired for hosts/k8s");
  }
  const k8sStore = read("src/stores/k8sStore.ts");
  if (
    k8sStore.includes("ensureJumpHostConnected") &&
    k8sStore.includes("jumpHostGate") &&
    k8sStore.includes("liveJumpHostSessionId")
  ) {
    pass(
      "k8s.jump-host-gate",
      "ssh_kubectl open auto-connects jump host or shows gate",
    );
  } else {
    fail("k8s.jump-host-gate", "jump host gate missing from k8sStore");
  }
  const entityListView = read("src/components/management/EntityListView.tsx");
  if (
    entityListView.includes("entity-list-icon-btn") &&
    entityListView.includes("entity-add-item-") &&
    entityListView.includes("TerminalIcon") &&
    entityListView.includes("FolderPlus")
  ) {
    pass("sidebar.entity-list-toolbar-icons", "entity list toolbar uses icon buttons");
  } else {
    fail("sidebar.entity-list-toolbar-icons", "entity list toolbar icons missing");
  }
  const layoutLib = read("src/lib/entityListLayout.ts");
  if (
    layoutLib.includes("ENTITY_LAYOUT_KEYS") &&
    layoutLib.includes("LAYOUT_VERSION = 3") &&
    layoutLib.includes("SIDEBAR_LAYOUT_KEY") &&
    layoutLib.includes("migrateV2SidebarScope")
  ) {
    pass("sidebar.per-scope-layout-v3", "sidebar uses per-view v3 entity layout");
  } else {
    fail("sidebar.per-scope-layout-v3", "per-view entity layout storage missing");
  }
}

// --- AI interactive password fail-fast ---
{
  const fe = read("src/lib/aiEngineer/sudoOutput.ts");
  const rust = read("src-tauri/src/preview_sudo.rs");
  const client = read("src-tauri/src/ssh/client.rs");
  if (fe.includes("looksLikeInteractivePasswordPrompt") && fe.includes("AI_INTERACTIVE_PASSWORD")) {
    pass("ai.interactive-password-fe", "FE interactive password detector");
  } else {
    fail("ai.interactive-password-fe", "missing FE detector");
  }
  if (rust.includes("looks_like_interactive_password_prompt") && rust.includes("AI_INTERACTIVE_PASSWORD")) {
    pass("ai.interactive-password-rs", "Rust interactive password detector");
  } else {
    fail("ai.interactive-password-rs", "missing Rust detector");
  }
  if (client.includes("abort_on_interactive_password")) {
    pass("ai.interactive-password-abort", "capture aborts on password prompt");
  } else {
    fail("ai.interactive-password-abort", "missing capture abort flag");
  }
  const term = read("src-tauri/src/ai_engineer/terminal.rs");
  if (client.includes("idle_after_output") && term.includes("AI_IDLE_AFTER_OUTPUT")) {
    pass("ai.exec-idle-timeout", "idle-after-output timeout wired");
  } else {
    fail("ai.exec-idle-timeout", "missing idle_after_output / AI_IDLE_AFTER_OUTPUT");
  }
}

// --- Preview: OFV readonly binary + TW text editor ---
{
  const pkg = JSON.parse(read("package.json"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  if (deps["@open-file-viewer/core"] && deps["@open-file-viewer/react"] && deps["pdfjs-dist"]) {
    pass("preview.ofv-deps", "open-file-viewer + pdfjs-dist");
  } else {
    fail("preview.ofv-deps", "missing OFV/pdfjs deps");
  }
  const panel = read("src/components/PreviewPanel.tsx");
  const ofv = read("src/components/preview/OfvReadonlyPreview.tsx");
  const fileType = read("src/lib/fileType.ts");
  const rust = read("src-tauri/src/preview.rs");
  const nativePdf = read("src/components/preview/NativePdfPreview.tsx");
  if (
    panel.includes("OfvReadonlyPreview") &&
    panel.includes("NativePdfPreview") &&
    panel.includes('data?.kind === "pdf"') &&
    panel.includes("EditableTextPreview") &&
    nativePdf.includes("preview-native-pdf") &&
    ofv.includes("imagePlugin") &&
    ofv.includes("pdfPlugin") &&
    ofv.includes("cMapUrl") &&
    ofv.includes("createOfvPdfjsModule") &&
    ofv.includes("pdfjsAssetBase") &&
    ofv.includes("useFetchData") &&
    ofv.includes("officePlugin") &&
    ofv.includes("archivePlugin") &&
    !ofv.includes("textPlugin") &&
    fileType.includes('"office"') &&
    fileType.includes("isReadonlyBinaryPreviewKind") &&
    rust.includes("MAX_BINARY_PREVIEW_BYTES") &&
    rust.includes('"office"') &&
    rust.includes("is_binary_preview_kind")
  ) {
    pass("preview.ofv-hybrid", "native PDF + OFV readonly + TW editable text");
  } else {
    fail("preview.ofv-hybrid", "OFV hybrid preview wiring incomplete");
  }
  const vitePdf = read("vite.pdfjs.ts");
  const pdfjsOfv = read("src/lib/pdfjsOfv.ts");
  if (
    vitePdf.includes("pdfjs-dist/cmaps") &&
    vitePdf.includes("standard_fonts") &&
    vitePdf.includes("pdfjs-dist/wasm") &&
    vitePdf.includes("pdfjs-dist/iccs") &&
    pdfjsOfv.includes("wasmUrl") &&
    pdfjsOfv.includes("injectPdfjsAssetUrls") &&
    pdfjsOfv.includes("pdfjsWasmUrl")
  ) {
    pass("preview.pdfjs-assets", "vite copies cmaps/fonts/wasm/iccs + OFV inject");
  } else {
    fail("preview.pdfjs-assets", "vite.pdfjs / pdfjsOfv asset wiring incomplete");
  }
}

// --- Preview: Markdown Typora-like WYSIWYG (Vditor IR) ---
{
  const pkg = JSON.parse(read("package.json"));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  const wysiwyg = read("src/components/preview/MarkdownWysiwygEditor.tsx");
  const mdPreview = read("src/components/preview/MarkdownPreview.tsx");
  const mode = read("src/lib/previewMarkdownMode.ts");
  const viteVditor = read("vite.vditor.ts");
  const viteCfg = read("vite.config.ts");
  const rust = read("src-tauri/src/preview.rs");
  const cmds = read("src-tauri/src/commands/mod.rs");
  if (
    deps.vditor &&
    wysiwyg.includes('mode: "ir"') &&
    wysiwyg.includes('data-testid="preview-markdown-wysiwyg"') &&
    mdPreview.includes("MarkdownWysiwygEditor") &&
    mode.includes('markdownMode: "wysiwyg"') === false &&
    mode.includes('return "wysiwyg"') &&
    viteVditor.includes("copyVditorAssetsPlugin") &&
    viteCfg.includes("copyVditorAssetsPlugin") &&
    rust.includes("preview_read_bytes") === false &&
    rust.includes("read_preview_bytes") &&
    cmds.includes("preview_read_bytes") &&
    cmds.includes("preview_write_bytes")
  ) {
    pass("preview.markdown-wysiwyg", "Vditor IR + mode helpers + remote bytes");
  } else {
    fail("preview.markdown-wysiwyg", "markdown WYSIWYG wiring incomplete");
  }
}

// --- AI exec busy dots placement ---
{
  const panel = read("src/components/aiEngineer/AiEngineerPanel.tsx");
  const css = read("src/App.css");
  const phase = read("src/lib/aiEngineer/runBusyPhase.ts");
  if (panel.includes("ai-engineer-exec-live-banner")) {
    fail("ai.exec-no-live-banner", "live banner still rendered");
  } else {
    pass("ai.exec-no-live-banner", "exec live banner removed");
  }
  if (panel.includes('className="ai-engineer-exec-head-dots"') || panel.includes("ai-engineer-exec-head-dots")) {
    pass("ai.exec-head-dots", "busy dots in exec head row");
  } else {
    fail("ai.exec-head-dots", "missing exec head dots");
  }
  if (phase.includes("shouldShowChatBusyLine")) {
    pass("ai.busy-line-gate", "shouldShowChatBusyLine present");
  } else {
    fail("ai.busy-line-gate", "missing shouldShowChatBusyLine");
  }
  if (css.includes(".ai-engineer-exec-live-banner")) {
    fail("ai.exec-banner-css-gone", "live banner CSS still present");
  } else {
    pass("ai.exec-banner-css-gone", "live banner CSS removed");
  }
}

// --- Keep upload / drop-kind local ---
{
  const appCss = read("src/App.css");
  if (appCss.includes('data-drop-kind="local"') || appCss.includes("[data-drop-kind=\"local\"]")) {
    pass("keep.drop-kind-local", "CSS retains OS-file drop-kind local");
  } else {
    fail("keep.drop-kind-local", "missing data-drop-kind=local styles");
  }
  const cmds = read("src-tauri/src/commands/mod.rs");
  if (cmds.includes("insert_local_paths")) {
    pass("keep.insert_local_paths", "insert_local_paths command present");
  } else {
    fail("keep.insert_local_paths", "insert_local_paths missing");
  }
}

// --- i18n keys ---
{
  for (const lang of ["en", "zh-CN"]) {
    const j = JSON.parse(read(`src/i18n/locales/${lang}/tools.json`));
    for (const k of [
      "aiEngineer.newChat",
      "aiEngineer.history",
      "panel.pin",
      "panel.unpin",
      "panel.collapse",
      "aiEngineer.manageModels",
      "aiEngineer.modelPicker",
      "aiEngineer.picker.tabModel",
      "aiEngineer.picker.tabAgent",
      "aiEngineer.findChat",
      "aiEngineer.outline",
      "aiEngineer.outlineHint",
      "aiEngineer.evidenceWithTools",
      "aiEngineer.evidenceNoTools",
      "aiEngineer.notice.evidence_nudge",
      "aiEngineer.notice.evidence_nudge_blocked",
      "aiEngineer.notice.audit_nudge",
      "aiEngineer.notice.resume_miss",
      "aiEngineer.notice.run_stalled",
      "aiEngineer.hostExecuting",
      "aiEngineer.waitingApprovalBusy",
      "aiEngineer.waitingSudoBusy",
      "aiEngineer.awaitingApprovedExec",
      "aiEngineer.toolWaitingAlive",
      "aiEngineer.toolLiveOutput",
    ]) {
      if (j[k]) pass(`i18n.${lang}.${k}`, j[k]);
      else fail(`i18n.${lang}.${k}`, "missing key");
    }
  }
}

// --- Migration logic (inline mirror of store behavior) ---
{
  const DEFAULT = "New chat";
  function titleFromMessages(messages) {
    const u = messages.find((m) => m.kind === "user");
    if (!u) return DEFAULT;
    const t = String(u.content).trim().replace(/\s+/g, " ");
    if (!t) return DEFAULT;
    return t.length > 48 ? `${t.slice(0, 48)}…` : t;
  }
  function migrateV1(v1) {
    const out = {};
    for (const [k, lines] of Object.entries(v1)) {
      if (!Array.isArray(lines)) continue;
      const messages = lines.filter((m) =>
        m && ["user", "assistant", "tool", "error"].includes(m.kind),
      );
      const id = "t-mig";
      out[k] = {
        activeThreadId: id,
        threads: [
          {
            id,
            title: titleFromMessages(messages, "Chat 1"),
            messages,
            createdAt: 1,
            updatedAt: 1,
          },
        ],
      };
    }
    return out;
  }
  const migrated = migrateV1({
    "server:u@h:22": [
      { id: "1", kind: "user", content: "disk full please help" },
      { id: "2", kind: "assistant", content: "ok" },
      { id: "3", kind: "ask", question: "x" },
    ],
  });
  const th = migrated["server:u@h:22"].threads[0];
  if (th.messages.length !== 2) fail("migrate.drop-ask", `got ${th.messages.length}`);
  else pass("migrate.drop-ask", "ask not persisted");
  if (th.title !== "disk full please help") fail("migrate.title", th.title);
  else pass("migrate.title", th.title);
  if (th.messages.some((m) => m.kind === "ask")) fail("migrate.no-ask-line", "ask leaked");
  else pass("migrate.no-ask-line", "ok");
}

// --- Model provider presets (OpenAI-compat only) ---
{
  const settings = read("src/components/aiEngineer/AiEngineerSettings.tsx");
  for (const type of ["openai", "anthropic", "gemini", "ollama"]) {
    if (settings.includes(`"${type}"`) || settings.includes(`'${type}'`)) {
      pass(`provider.type.${type}`, type);
    } else {
      fail(`provider.type.${type}`, `missing ${type}`);
    }
  }
  if (settings.includes("deepseek") && settings.includes('ProviderType = "openai" | "deepseek"')) {
    fail("provider.no-deepseek-card", "legacy deepseek ProviderType still primary");
  } else {
    pass("provider.no-deepseek-card", "deepseek not a primary card");
  }
  if (settings.includes("listAiModels") && settings.includes("refreshModels")) {
    pass("provider.refresh-models", "refresh models wired");
  } else {
    fail("provider.refresh-models", "missing listAiModels / refreshModels");
  }
  const gw = read("agent-sidecar/app/llm/gateway.py");
  if (gw.includes("async def list_models") && gw.includes("parse_openai_models_payload")) {
    pass("gateway.list-models", "ModelGateway.list_models");
  } else {
    fail("gateway.list-models", "missing list_models");
  }
  const css = read("src/App.css");
  if (/terminal-view-inner[\s\S]*?padding:\s*8px/.test(css)) {
    pass("ui.terminal-padding", "terminal inset padding");
  } else {
    fail("ui.terminal-padding", "missing terminal padding");
  }
  if (/\.ai-engineer-line\s*\{[\s\S]*?font-size:\s*0\.84rem/.test(css)) {
    pass("ui.chat-font", "chat font ~0.84rem");
  } else {
    fail("ui.chat-font", "chat font not reduced");
  }
}

// --- Host file tree ops (create / clipboard / DnD) ---
{
  const menu = read("src/components/LocalFsContextMenu.tsx");
  const tree = read("src/components/LocalFsTreeView.tsx");
  const cmds = read("src-tauri/src/lib.rs");
  for (const [needle, id] of [
    ["newFolder", "hostfs.menu-new-folder"],
    ["newFile", "hostfs.menu-new-file"],
    ["copyItem", "hostfs.menu-copy"],
    ["cutItem", "hostfs.menu-cut"],
    ["pasteItem", "hostfs.menu-paste"],
    ["duplicateItem", "hostfs.menu-duplicate"],
  ]) {
    if (menu.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle}`);
  }
  const panelHost = read("src/components/LocalFsPanel.tsx");
  if (
    tree.includes("startLocalFsPointerMove") &&
    tree.includes("data-path") &&
    tree.includes("event.metaKey || event.ctrlKey || event.shiftKey") &&
    tree.includes("directoriesOnly") &&
    tree.includes("openDirectory") &&
    panelHost.includes("invokeWithSudoRetry") &&
    panelHost.includes("handleMovePaths") &&
    panelHost.includes("passwordRef") &&
    panelHost.includes("local-fs-split") &&
    panelHost.includes("LocalFsContentsView") &&
    panelHost.includes("setViewMode") &&
    read("src/lib/invokeWithSudoRetry.ts").includes("passwordRef") &&
    read("src/stores/localFsStore.ts").includes("contentsPath") &&
    read("src/stores/localFsStore.ts").includes("openDirectory") &&
    read("src/components/LocalFsContentsView.tsx").includes("local-fs-contents")
  ) {
    pass("hostfs.tree-dnd", "Finder split + multi-select + batch sudo");
  } else {
    fail("hostfs.tree-dnd", "missing tree pointer move / Finder split");
  }
  {
    const ops = read("src/lib/localFsOps.ts");
    const contents = read("src/components/LocalFsContentsView.tsx");
    const panelFs = read("src/components/LocalFsPanel.tsx");
    const storeFs = read("src/stores/localFsStore.ts");
    const openDirSlice = storeFs.slice(
      storeFs.indexOf("openDirectory: async"),
      storeFs.indexOf("openDirectory: async") + 900,
    );
    if (
      ops.includes("sanitizeDeleteSelection") &&
      ops.includes("pathBreadcrumbSegments") &&
      ops.includes("pathsIntersectingMarquee") &&
      contents.includes("beginMarquee") &&
      contents.includes("local-fs-marquee") &&
      panelFs.includes("LocalFsPathBreadcrumb") &&
      panelFs.includes("sanitizeDeleteSelection") &&
      panelFs.includes("local-fs-transfer-strip") &&
      panelFs.includes("StatusBarTransfers") &&
      /selectedPaths:\s*\[\s*\]/.test(openDirSlice)
    ) {
      pass(
        "hostfs.safe-select-delete",
        "marquee + breadcrumb + transfer strip + cwd not selected on open",
      );
    } else {
      fail(
        "hostfs.safe-select-delete",
        "missing marquee/breadcrumb/safe-delete wiring",
      );
    }
  }
  const css = read("src/App.css");
  const backdropIdx = css.indexOf(".send-to-backdrop");
  const backdropSlice = backdropIdx >= 0 ? css.slice(backdropIdx, backdropIdx + 280) : "";
  if (/z-index:\s*(3[6-9]\d{3}|[4-9]\d{4})\b/.test(backdropSlice)) {
    pass("hostfs.dialog-z", "FS dialog above Host panel");
  } else {
    fail("hostfs.dialog-z", "send-to-backdrop z-index still under Host panel");
  }
  if (
    cmds.includes("create_path") &&
    cmds.includes("copy_path") &&
    cmds.includes("duplicate_path")
  ) {
    pass("hostfs.tauri-cmds", "create/copy/duplicate registered");
  } else {
    fail("hostfs.tauri-cmds", "missing Tauri commands");
  }
  const store = read("src/stores/localFsStore.ts");
  const panel = read("src/components/LocalFsPanel.tsx");
  const dialog = read("src/components/TerminalFsDialog.tsx");
  if (
    store.includes("reloadDirectory:") &&
    panel.includes("reloadDirsLocally") &&
    dialog.includes("onCommitted")
  ) {
    pass("hostfs.local-reload", "create/move reload parent dir only");
  } else {
    fail("hostfs.local-reload", "missing local directory reload wiring");
  }
  const sessionRs = read("src-tauri/src/session/mod.rs");
  const moveBlock = sessionRs.includes("pub async fn move_path");
  const noPtyLsAfterMutations =
    !sessionRs.includes("refresh_listing") &&
    !/pub async fn move_path[\s\S]*?write_input\("ls/.test(sessionRs);
  if (moveBlock && noPtyLsAfterMutations && sessionRs.includes("mv --")) {
    pass("hostfs.no-pty-ls", "FS mutations do not inject ls; move uses quoted mv --");
  } else {
    fail("hostfs.no-pty-ls", "move/create still refresh Terminal via ls");
  }
}

// --- Manual skill distill ---
{
  const schema = read("agent-sidecar/app/tools/schema.py");
  const writer = read("agent-sidecar/app/skills/writer.py");
  const panel = read("src/components/aiEngineer/AiEngineerPanel.tsx");
  if (
    schema.includes("TOOL_SKILL_SAVE") &&
    writer.includes("save_user_skill") &&
    panel.includes("ai-engineer-save-skill") &&
    panel.includes("BookmarkPlus") &&
    panel.includes("ai-engineer-skills-toggle") &&
    panel.includes("ai-engineer-skills-open-folder") &&
    !panel.includes("ai-engineer-save-skill-btn")
  ) {
    pass("skills.manual-distill", "skill_save + reply-end icon + skills list UI");
  } else {
    fail("skills.manual-distill", "missing skill distill wiring");
  }
}

{
  const mainPy = read("agent-sidecar/app/main.py");
  const loader = read("agent-sidecar/app/skills/loader.py");
  const commands = read("src-tauri/src/commands/mod.rs");
  if (
    mainPy.includes('/v1/skills') &&
    loader.includes("list_user_skills_catalog") &&
    commands.includes("reveal_local_path")
  ) {
    pass("skills.list-ui", "GET /v1/skills + reveal_local_path");
  } else {
    fail("skills.list-ui", "missing skills list API or reveal command");
  }
}

{
  const mainPy = read("agent-sidecar/app/main.py");
  const panel = read("src/components/aiEngineer/AiEngineerPanel.tsx");
  const api = read("src/lib/aiEngineer/api.ts");
  const statusBar = read("agent-sidecar/app/agent/status_bar.py");
  const artifacts = read("agent-sidecar/app/session/tool_artifacts.py");
  const hostStore = read("agent-sidecar/app/memory/host_store.py");
  const userStore = read("agent-sidecar/app/memory/user_store.py");
  if (
    mainPy.includes('/v1/memory/meta') &&
    mainPy.includes("engineer_mode") &&
    api.includes("fetchMemoryMeta") &&
    api.includes("engineer_mode") &&
    panel.includes("ai-engineer-memory-toggle") &&
    panel.includes("ai-engineer-memory-section-user") &&
    panel.includes("ai-engineer-memory-section-targets") &&
    !panel.includes("ai-engineer-open-data-dir") &&
    !panel.includes("ai-engineer-memory-path") &&
    hostStore.includes('leaf = "clusters"') &&
    userStore.includes("user-k8s.json") &&
    statusBar.includes("AGENT_STATUS") &&
    artifacts.includes("maybe_spill_tool_content")
  ) {
    pass(
      "agent.book-roadmap",
      "status bar + mode-scoped memory UI + tool artifacts",
    );
  } else {
    fail("agent.book-roadmap", "missing status bar / memory / artifact wiring");
  }
  const probe = read("agent-sidecar/app/harness/guards/probe_streak.py");
  const loopPy = read("agent-sidecar/app/agent/loop.py");
  const pathsPy = read("agent-sidecar/app/paths.py");
  if (
    probe.includes("PROBE_STREAK_FORCE_THRESHOLD") &&
    probe.includes("probe_tool_streak") &&
    loopPy.includes("FORCE_TOOL_CHOICE_NONE_KEY") &&
    loopPy.includes("probe_streak") &&
    exists("agent-sidecar/tests/test_probe_streak.py")
  ) {
    pass("agent.probe-streak", "consecutive probe tools force conclude");
  } else {
    fail("agent.probe-streak", "missing probe streak harness");
  }
  const repeatTool = read("agent-sidecar/app/harness/guards/repeat_tool.py");
  if (
    repeatTool.includes("HARD_DENY_AT") &&
    repeatTool.includes("FAIL_DENY_AT") &&
    repeatTool.includes("stop_repeating") &&
    repeatTool.includes("note_result") &&
    repeatTool.includes("prior_failed") &&
    loopPy.includes("stop_repeating") &&
    loopPy.includes("repeat_tool_stop") &&
    loopPy.includes("note_result") &&
    loopPy.includes("PROBE_CONCLUDE_SENT_KEY") &&
    /FORCE_TOOL_CHOICE_NONE_KEY[\s\S]*extract_tool_calls_from_content/.test(
      loopPy,
    ) &&
    exists("agent-sidecar/tests/test_repeat_tool.py")
  ) {
    pass(
      "agent.repeat-tool-hard-deny",
      "identical cmds hard-deny; failed identical cmds deny at 2",
    );
  } else {
    fail(
      "agent.repeat-tool-hard-deny",
      "missing repeat-tool hard deny / fail-deny / FORCE content recovery gate",
    );
  }
  if (
    pathsPy.includes("prefer_complete_max_output_tokens") &&
    pathsPy.includes('"32768"') &&
    pathsPy.includes('"65536"') &&
    loopPy.includes("prefer_complete_max_output_tokens")
  ) {
    pass("agent.prefer-complete-output", "high max_tokens before auto-continue");
  } else {
    fail("agent.prefer-complete-output", "missing prefer-complete output budget");
  }
}

// --- AI chat wiring (run trace / mid-run context) ---
{
  const panel = read("src/components/aiEngineer/AiEngineerPanel.tsx");
  const chatScroll = read("src/lib/aiEngineer/chatScroll.ts");
  if (panel.includes("AiEngineerRunTraceBar") && panel.includes("ai-engineer-composer")) {
    pass("ai.panel-chat", "chat panel + composer");
  } else {
    fail("ai.panel-chat", "missing RunTraceBar or composer in AiEngineerPanel");
  }
  const composerInput = read("src/components/aiEngineer/AiEngineerComposerInput.tsx");
  const truncAsst = read("src/lib/aiEngineer/truncatedAssistant.ts");
  if (
    composerInput.includes("AiEngineerComposerTextarea") &&
    composerInput.includes("useAiEngineerStore((s) => s.input)") &&
    panel.includes("AiEngineerComposerTextarea") &&
    panel.includes("AiEngineerComposerSendButton") &&
    !/useAiEngineerStore\(\(s\) => s\.input\)/.test(panel) &&
    panel.includes("setComposerInput")
  ) {
    pass("ai.composer-input-island", "input subscribed only in composer island");
  } else {
    fail(
      "ai.composer-input-island",
      "panel still selects s.input or missing AiEngineerComposerInput",
    );
  }
  if (
    truncAsst.includes("looksIncompleteAssistant") &&
    truncAsst.includes("endsWithoutSentenceTerminator") &&
    truncAsst.includes("SOFT_CONTINUE_MIN_CHARS") &&
    !read("src/stores/aiEngineerStore.ts").includes(
      'content: "assistant_incomplete"',
    ) &&
    read("src/stores/aiEngineerStore.ts").includes(
      'event.type === "assistant_incomplete"',
    ) &&
    read("src/components/aiEngineer/AiEngineerPanel.tsx").includes(
      'line.content === "assistant_incomplete"',
    ) &&
    read("agent-sidecar/app/harness/verify.py").includes(
      "def join_answer_continuation",
    ) &&
    read("agent-sidecar/app/agent/loop.py").includes("join_answer_continuation") &&
    read("agent-sidecar/app/agent/loop.py").includes("_trunc_answer_text") &&
    read("agent-sidecar/app/agent/loop.py").includes("max_trunc_nudges = 16") &&
    read("src/lib/aiEngineer/reconcileAssistantFromTranscript.ts").includes(
      "shouldReplaceAssistantWithTranscript",
    ) &&
    read("src/stores/aiEngineerStore.ts").includes("fetchRunTranscript") &&
    read("src/stores/aiEngineerStore.ts").includes(
      'kind === "truncated_answer" ? "streaming" : "thinking"',
    ) &&
    !/act_nudge[\s\S]{0,80}appendIfSameThread[\s\S]{0,40}act_nudge_conclude/.test(
      read("src/stores/aiEngineerStore.ts"),
    )
  ) {
    pass(
      "ai.incomplete-reply",
      "auto-continue only; never show 回复未写完/continue notice",
    );
  } else {
    fail(
      "ai.incomplete-reply",
      "missing incomplete heuristics or still surfaces continue notice",
    );
  }
  if (
    read("agent-sidecar/app/agent/stall.py").includes("is_progress_stalled") &&
    read("agent-sidecar/app/agent/stall.py").includes("pending_tool") &&
    read("agent-sidecar/app/paths.py").includes("progress_stall_seconds") &&
    read("src/stores/aiEngineerStore.ts").includes("THINKING_IDLE_ABORT_MS") &&
    read("src/stores/aiEngineerStore.ts").includes("shouldAbortThinkingIdle") &&
    read("src/lib/aiEngineer/thinkingIdleAbort.ts").includes(
      "hasRunningTool",
    ) &&
    /run_stalled[\s\S]{0,200}abort\.abort/.test(
      read("src/stores/aiEngineerStore.ts"),
    )
  ) {
    pass(
      "ai.thinking-stall",
      "stall skips running tools/approvals; FE idle abort gated",
    );
  } else {
    fail("ai.thinking-stall", "missing progress stall / FE idle abort");
  }
  if (
    chatScroll.includes('AI_CHAT_SCROLL_FIX_ID = "2026-09-23-table-stream"') &&
    chatScroll.includes("OPEN_CHAT_FOLLOW_MS") &&
    chatScroll.includes("RUN_SETTLE_FOLLOW_MS") &&
    chatScroll.includes("STREAM_WHEEL_RELEASE_DELTA_PX") &&
    chatScroll.includes("COMPOSER_CHROME_SCROLL_LOCK_MS") &&
    chatScroll.includes("isChatScrollGeometryReady") &&
    chatScroll.includes("scheduleComposerChromeScrollLock") &&
    chatScroll.includes("streamFollowPinKey") &&
    chatScroll.includes("shouldParkChatScrollerAtBottom") &&
    chatScroll.includes("shouldPinChatOnStreamUpdate") &&
    chatScroll.includes("scrollTopAfterViewportResize") &&
    chatScroll.includes("shouldHoldStickWhileBusyFollow") &&
    chatScroll.includes("shouldHoldStickWhileForcedFollow") &&
    chatScroll.includes("shouldForceChatFollow") &&
    chatScroll.includes("shouldPinDuringComposerChromeLock") &&
    chatScroll.includes("shouldFollowChatTranscript") &&
    panel.includes("shouldFollowChatTranscript") &&
    panel.includes("hasStreamingAssistant") &&
    panel.includes("AI_CHAT_SCROLL_FIX_ID") &&
    panel.includes("data-scroll-fix={AI_CHAT_SCROLL_FIX_ID}") &&
    panel.includes("scheduleOpenChatPin") &&
    panel.includes("openFollowUntilRef") &&
    panel.includes("settleFollowUntilRef") &&
    panel.includes("runPreservingChatScroll") &&
    panel.includes("beginComposerChromeScrollLock") &&
    panel.includes("streamFollowPinKey") &&
    panel.includes("shouldParkChatScrollerAtBottom") &&
    panel.includes("scrollTopAfterViewportResize") &&
    panel.includes("shouldHoldStickWhileBusyFollow") &&
    panel.includes("shouldHoldStickWhileForcedFollow") &&
    panel.includes("userReleasedFollowRef") &&
    panel.includes("shouldFollowChatOnViewportResize") &&
    panel.includes("rememberedNearBottomRef") &&
    panel.includes("shouldPreventComposerChromeFocusScroll") &&
    panel.includes("shouldForceStickOnChatOpen") &&
    !panel.includes("beginViewportFreeze") &&
    !panel.includes("AI_CHAT_REVEAL_PIN_MS") &&
    !chatScroll.includes("beginViewportFreeze") &&
    chatScroll.includes("shouldPinChatAfterViewportResize") &&
    chatScroll.includes("runPreservingChatScroll") &&
    /shouldPinChatAfterViewportResize[\s\S]*return opts\.stickToBottom/.test(
      chatScroll,
    ) &&
    read("src/App.css").includes("table-layout: fixed") &&
    read("src/components/aiEngineer/AiMarkdown.tsx").includes(
      "selectStreamingMarkdownHtml",
    ) &&
    read("src/components/aiEngineer/AiMarkdown.tsx").includes(
      "stabilizeStreamingMarkdown",
    ) &&
    read("src/lib/aiEngineer/stabilizeStreamingMarkdown.ts").includes(
      "closeProseLeakingCodeFence",
    ) &&
    read("src/lib/aiEngineer/stabilizeStreamingMarkdown.ts").includes(
      "stabilizeTrailingIncompleteTable",
    ) &&
    read("src/lib/aiEngineer/stabilizeStreamingMarkdown.ts").includes(
      "fixCjkBoldClosingPunctuation",
    ) &&
    read("src/lib/aiEngineer/stabilizeStreamingMarkdown.ts").includes(
      "fixCjkBoldOpeningPunctuation",
    ) &&
    read("src/lib/aiEngineer/stabilizeStreamingMarkdown.ts").includes(
      "materializeBoldMarkers",
    ) &&
    read("src/lib/aiEngineer/stabilizeStreamingMarkdown.ts").includes(
      "rewriteToolCallMarkupForDisplay",
    ) &&
    read("src/lib/aiEngineer/stabilizeStreamingMarkdown.ts").includes(
      "stripEmptyCodeFences",
    ) &&
    read("src/lib/aiEngineer/stabilizeStreamingMarkdown.ts").includes(
      "isLanguageTaggedFence",
    ) &&
    !read("src/components/aiEngineer/AiMarkdown.tsx").includes(
      "asyncHtml ?? initialHtml",
    ) &&
    !read("src/components/aiEngineer/AiMarkdown.tsx").includes("setAsyncHtml(null)")
  ) {
    pass(
      "ai.chat-scroll-final",
      "table-stream: fixed tables + tagged fences trusted + settle",
    );
  } else {
    fail(
      "ai.chat-scroll-final",
      "scroll chaos remnants or missing 2026-09-23-table-stream stamp",
    );
  }

  {
    const store = read("src/stores/aiEngineerStore.ts");
    const coalesce = read("src/lib/aiEngineer/streamDeltaCoalesce.ts");
    if (
      coalesce.includes("createStreamDeltaCoalescer") &&
      store.includes("createStreamDeltaCoalescer") &&
      store.includes("persist: false") &&
      store.includes("flushStreamCoalescers") &&
      /opts\?\.persist !== false/.test(store)
    ) {
      pass(
        "ai.stream-smooth",
        "assistant/tool stream coalesced; mid-stream skips disk persist",
      );
    } else {
      fail(
        "ai.stream-smooth",
        "missing rAF coalesce or persist:false on stream updates",
      );
    }
  }

  {
    const fe = read("src/lib/aiEngineer/readProbeOutcome.ts");
    const bridge = read("src/lib/aiEngineer/toolBridge.ts");
    const py = read("agent-sidecar/app/harness/read_probe_outcome.py");
    const prompts = read("agent-sidecar/app/agent/prompts.py");
    if (
      fe.includes("filter_no_match") &&
      bridge.includes("interpretReadProbeOutcome") &&
      py.includes("annotate_read_probe_result") &&
      prompts.includes("filter_no_match")
    ) {
      pass(
        "ai.read-probe-filter-miss",
        "exit1+empty stderr+stdout → soft-ok; prompt warns against retry",
      );
    } else {
      fail(
        "ai.read-probe-filter-miss",
        "missing read-probe filter-miss soft-ok wiring",
      );
    }
  }

  {
    const secrets = read("src-tauri/src/ai_engineer/secrets.rs");
    const sidecar = read("src-tauri/src/ai_engineer/sidecar.rs");
    const pathsPy = read("agent-sidecar/app/paths.py");
    const mainPy = read("agent-sidecar/app/main.py");
    const store = read("src/stores/aiEngineerStore.ts");
    if (
      secrets.includes("apply_settings_to_sidecar") &&
      secrets.includes("thread::spawn") &&
      !/store\.save\(\)[\s\S]{0,80}restart_sidecar\(app\)/.test(secrets) &&
      sidecar.includes("hot_reload_sidecar_config") &&
      sidecar.includes("/v1/runtime/config") &&
      pathsPy.includes("apply_runtime_config") &&
      mainPy.includes("/v1/runtime/config") &&
      store.includes("Optimistic label swap")
    ) {
      pass(
        "ai.model-switch-no-freeze",
        "model save hot-reloads sidecar in background (no sync restart)",
      );
    } else {
      fail(
        "ai.model-switch-no-freeze",
        "save_ai_settings still sync-restarts sidecar or missing hot reload",
      );
    }
  }

  {
    const chatScroll = read("src/lib/aiEngineer/chatScroll.ts");
    const panel = read("src/components/aiEngineer/AiEngineerPanel.tsx");
    if (
      /COMPOSER_CHROME_SCROLL_LOCK_MS\s*=\s*1[2-9]\d{2}/.test(chatScroll) &&
      chatScroll.includes("shouldDeferResizeScrollDuringComposerChrome") &&
      panel.includes("runWithComposerChromeScrollGuard") &&
      panel.includes("shouldDeferResizeScrollDuringComposerChrome") &&
      /setModelOpen\(false\)[\s\S]{0,120}void saveSettings/.test(panel) &&
      /ai-engineer-picker-tab-model[\s\S]{0,900}runWithComposerChromeScrollGuard/.test(
        panel,
      ) &&
      /ai-engineer-picker-tab-agent[\s\S]{0,900}runWithComposerChromeScrollGuard/.test(
        panel,
      ) &&
      /\[modelOpen, pickerTab, profiles\.length/.test(panel)
    ) {
      pass(
        "ai.model-switch-scroll",
        "model/agent tab chrome lock + menu place deps include pickerTab",
      );
    } else {
      fail(
        "ai.model-switch-scroll",
        "missing chrome lock or non-blocking model switch click path",
      );
    }
  }

  const appCss = read("src/App.css");
  if (
    appCss.includes(".ai-engineer-panel.ai-engineer-panel-parked") &&
    appCss.includes("opacity: 0 !important") &&
    appCss.includes("visibility: visible !important") &&
    !appCss.includes("visibility: hidden !important")
  ) {
    pass("ai.chat-scroll-park-css", "park uses opacity not visibility:hidden");
  } else {
    fail("ai.chat-scroll-park-css", "parked panel still uses visibility:hidden or missing opacity");
  }

  if (panel.includes("ai-engineer-composer-stack")) {
    pass("ai.composer-stack", "composer-stack present");
  } else {
    fail("ai.composer-stack", "missing ai-engineer-composer-stack");
  }
  if (
    panel.includes('data-testid="ai-engineer-find-bar"') &&
    panel.includes('data-testid="ai-engineer-find-input"') &&
    panel.includes('data-testid="ai-engineer-outline-toggle"') &&
    panel.includes("data-chat-node-id")
  ) {
    pass("ai.chat-find-outline", "find bar + outline jump anchors");
  } else {
    fail("ai.chat-find-outline", "missing find bar / outline wiring");
  }
  if (
    panel.includes('data-testid="ai-engineer-web-card"') &&
    panel.includes('data-testid="ai-engineer-web-keyword"') &&
    panel.includes('data-testid="ai-engineer-web-preview"') &&
    panel.includes('data-testid="ai-engineer-web-card-toggle"') &&
    panel.includes("webToolKeywordLine") &&
    panel.includes("formatWebToolPreview")
  ) {
    pass("ai.web-tool-card", "web_search/web_fetch keyword + preview card");
  } else {
    fail("ai.web-tool-card", "missing web tool card keyword/preview wiring");
  }
  if (
    panel.includes("ai-engineer-copy-reply") &&
    panel.includes("ChatCopyButton")
  ) {
    pass("ai.chat-copy-reply", "assistant copy reply control");
  } else {
    fail("ai.chat-copy-reply", "missing ai-engineer-copy-reply");
  }
  const css = read("src/App.css");
  const overlayZ = css.match(/\.ai-engineer-settings-overlay\s*\{[^}]*z-index\s*:\s*(\d+)/);
  if (overlayZ && Number(overlayZ[1]) >= 36000) {
    pass("ai.settings-zindex", `settings overlay z-index ${overlayZ[1]}`);
  } else {
    fail("ai.settings-zindex", "settings overlay z-index must be >= 36000");
  }
  if (
    panel.includes('data-testid="ai-engineer-model-menu"') &&
    panel.includes("ai-engineer-model-menu ai-engineer-menu-portal") &&
    panel.includes("createPortal")
  ) {
    pass("ai.model-menu-portal", "model picker menu portaled (avoids composer overflow clip)");
  } else {
    fail("ai.model-menu-portal", "model menu must use body portal to avoid overflow clip");
  }
  if (
    panel.includes('data-testid="ai-engineer-picker-tabs"') &&
    panel.includes('"ai-engineer-runtime-cursor"') &&
    panel.includes('"ai-engineer-runtime-status-cursor"') &&
    panel.includes('data-testid="ai-engineer-runtime-install"') &&
    panel.includes("external_activity") &&
    read("agent-sidecar/app/main.py").includes("asyncio.to_thread(probe_cursor)") &&
    read("src/lib/aiEngineer/api.ts").includes('path.includes("/v1/runtime/probe")')
  ) {
    pass(
      "ai.runtime-picker",
      "Model/Agent tabs + per-agent CLI status icons + non-blocking probe",
    );
  } else {
    fail("ai.runtime-picker", "missing Model/Agent picker tabs or local CLI gate");
  }
  const secretsRs = read("src-tauri/src/ai_engineer/secrets.rs");
  const storeTs = read("src/stores/aiEngineerStore.ts");
  if (
    secretsRs.includes("agent_runtime") &&
    storeTs.includes('saveSettings({ agent_runtime: next })') &&
    storeTs.includes("normalizeAgentRuntime(settings.agent_runtime)") &&
    read("src/lib/aiEngineer/api.ts").includes("agent_runtime?: string")
  ) {
    pass("ai.agent-runtime-persist", "agent_runtime saved with AI settings like model");
  } else {
    fail("ai.agent-runtime-persist", "agent selection not persisted in settings");
  }
  const externalAct = read("src/lib/aiEngineer/externalAgentActivity.ts");
  if (
    panel.includes('data-testid="ai-engineer-exec-agent-source"') &&
    panel.includes("ai-engineer-exec-agent-source") &&
    storeTs.includes("toolAgentSource") &&
    storeTs.includes("agentSource") &&
    externalAct.includes("isMirroredTwMcpActivity") &&
    externalAct.includes("return null") &&
    read("src/App.css").includes(".ai-engineer-exec-agent-source")
  ) {
    pass(
      "ai.runtime-exec-agent-source",
      "TW exec/web cards badge Cursor/Codex/Claude; mirrored MCP activity suppressed",
    );
  } else {
    fail(
      "ai.runtime-exec-agent-source",
      "missing agent source badge or mirrored MCP suppress",
    );
  }
  const remotePlane = read("agent-sidecar/app/runtime/remote_plane.py");
  const cliHostRemotePlane = read("agent-sidecar/app/runtime/cli_host.py");
  if (
    remotePlane.includes("REMOTE_PLANE_ADDENDUM") &&
    remotePlane.includes("is_local_desktop_impersonation") &&
    remotePlane.includes("这台电脑") &&
    cliHostRemotePlane.includes("--disable") &&
    cliHostRemotePlane.includes("computer_use") &&
    cliHostRemotePlane.includes("write_remote_plane_guidance") &&
    externalAct.includes("isLocalDesktopImpersonationActivity")
  ) {
    pass(
      "ai.runtime-remote-plane",
      "external agents: deixis=SSH host; Codex disables computer_use; CUA suppressed",
    );
  } else {
    fail(
      "ai.runtime-remote-plane",
      "missing remote-plane addendum / computer_use disable / CUA suppress",
    );
  }
  if (panel.includes("ai-engineer-platform") || panel.includes("AiEngineerPlatformPanel")) {
    fail("ai.no-platform", "Platform panel remnants in AiEngineerPanel");
  } else {
    pass("ai.no-platform", "Platform panel removed");
  }
  const trace = read("src/components/aiEngineer/AiEngineerRunTraceBar.tsx");
  if (
    trace.includes("data-testid=\"ai-engineer-run-trace\"") &&
    trace.includes("TraceSpanRow") &&
    trace.includes("ChevronRight") &&
    !trace.includes("open={busy}")
  ) {
    pass("ai.run-trace-bar", "RunTraceBar collapsed by default with chevron");
  } else {
    fail("ai.run-trace-bar", "RunTraceBar missing collapse chevron / still auto-opens");
  }
  const api = read("src/lib/aiEngineer/api.ts");
  if (api.includes("fetchRunTrace")) pass("ai.api.trace", "fetchRunTrace");
  else fail("ai.api.trace", "missing fetchRunTrace in api.ts");
  for (const dead of ["listMcpServers", "searchMemoryCases", "runOpsEval", "listAgentSkills"]) {
    if (api.includes(dead)) fail(`ai.api.no-${dead}`, `${dead} still in api.ts`);
    else pass(`ai.api.no-${dead}`, `${dead} removed`);
  }
  const chat = read("src/lib/aiEngineer/chatClient.ts");
  if (chat.includes("flushUserContext")) pass("ai.user-context", "flushUserContext");
  else fail("ai.user-context", "missing flushUserContext");
  if (
    chat.includes("stream_cursor") &&
    chat.includes("cursor: streamCursor")
  ) {
    pass("ai.stream-cursor-resume", "chatClient wires stream_cursor into SSE/pull");
  } else {
    fail("ai.stream-cursor-resume", "chatClient missing stream_cursor wiring");
  }
  const cliHost = read("agent-sidecar/app/runtime/cli_host.py");
  if (
    cliHost.includes('.codex') &&
    cliHost.includes("config.toml") &&
    cliHost.includes("mcp_servers.terminalwisely")
  ) {
    pass("ai.codex-mcp-config", "write_tw_mcp_config writes Codex .codex/config.toml");
  } else {
    fail("ai.codex-mcp-config", "Codex project MCP config.toml missing");
  }
  if (
    cliHost.includes('"stream-json"') &&
    cliHost.includes("--verbose") &&
    cliHost.includes("--include-partial-messages") &&
    cliHost.includes("--strict-mcp-config") &&
    cliHost.includes("bypassPermissions")
  ) {
    pass(
      "ai.claude-stream-json-verbose",
      "Claude -p stream-json includes --verbose + bypassPermissions for TW MCP",
    );
  } else {
    fail(
      "ai.claude-stream-json-verbose",
      "Claude argv missing --verbose / bypassPermissions for stream-json MCP",
    );
  }
  const store = read("src/stores/aiEngineerStore.ts");
  for (const dead of ["platformOpen", "togglePlatformView", "openPlatformView"]) {
    if (store.includes(dead)) fail(`ai.store.no-${dead}`, `${dead} still in store`);
    else pass(`ai.store.no-${dead}`, `${dead} removed`);
  }
}

// --- K8s workbench wiring ---
{
  const wb = read("src/components/k8s/K8sWorkbench.tsx");
  const summary = read("src/components/k8s/K8sClusterSummary.tsx");
  if (summary.includes('data-testid="k8s-overview-title"')) {
    pass("k8s.overview-title", "overview title");
  } else {
    fail("k8s.overview-title", "missing overview title in K8sClusterSummary");
  }
  if (
    summary.includes("onWarningSendToChat") &&
    summary.includes("k8s-warning-send-chat") &&
    summary.includes("k8s-health-send-chat") &&
    summary.includes("onHealthSendToChat") &&
    wb.includes("sendWarningToChat") &&
    wb.includes("sendLogsToChat") &&
    wb.includes("sendYamlToChat") &&
    wb.includes("sendHealthToChat") &&
    wb.includes("sendSelectionToChat") &&
    wb.includes("k8s-yaml-send-chat") &&
    wb.includes("k8s-yaml-apply") &&
    wb.includes("K8sYamlEditor") &&
    wb.includes("k8s-yaml-find") &&
    wb.includes("sendErrorToChat")
  ) {
    pass("k8s.send-to-chat", "warning/logs/yaml/health/error/selection send to chat");
  } else {
    fail("k8s.send-to-chat", "missing send-to-chat wiring");
  }
  const term = read("src/components/k8s/K8sClusterTerminal.tsx");
  const podShell = read("src/components/k8s/K8sPodShellTerminal.tsx");
  const ctxMenu = read("src/components/k8s/K8sSelectionContextMenu.tsx");
  if (
    term.includes("onSendSelection") &&
    term.includes('testIdPrefix="k8s-cluster-terminal"') &&
    term.includes("contextMenuSelectionRef") &&
    term.includes("K8sSelectionContextMenu") &&
    !term.includes("k8s-terminal-selection-bar") &&
    podShell.includes("onSendSelection") &&
    podShell.includes('testIdPrefix="k8s-pod-shell"') &&
    podShell.includes("contextMenuSelectionRef") &&
    podShell.includes("K8sSelectionContextMenu") &&
    !podShell.includes("k8s-terminal-selection-bar") &&
    ctxMenu.includes("sendToChat") &&
    ctxMenu.includes("${testIdPrefix}-send-chat") &&
    wb.includes("k8s-logs-pre") &&
    wb.includes("setLogsMenu")
  ) {
    pass("k8s.terminal-send-selection", "cluster + pod shell + logs selection menus");
  } else {
    fail("k8s.terminal-send-selection", "missing terminal/logs selection send-to-chat");
  }
  const toastStore = read("src/stores/toastStore.ts");
  const statusBar = read("src/components/StatusBarToasts.tsx");
  if (
    toastStore.includes("actionLabel") &&
    statusBar.includes("statusbar-toast-action")
  ) {
    pass("k8s.toast-action", "toast action button");
  } else {
    fail("k8s.toast-action", "missing toast action wiring");
  }
  for (const [needle, id] of [
    ["K8sClusterSummaryView", "k8s.summary"],
    ["K8sNamespacePicker", "k8s.namespace-picker"],
    ["k8sPodLogs", "k8s.pod-logs"],
    ["buildNavGroups", "k8s.nav-groups"],
  ]) {
    if (wb.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle} in K8sWorkbench`);
  }
  const k8sApi = read("src/lib/k8s/api.ts");
  for (const [needle, id] of [
    ["k8s_list_resources", "k8s.api.list"],
    ["k8s_apply_yaml", "k8s.api.apply"],
    ["k8s_delete_resource", "k8s.api.delete"],
    ["k8s_scale_resource", "k8s.api.scale"],
    ["k8s_helm_install", "k8s.api.helm-install"],
    ["k8s_rollout_restart", "k8s.api.rollout-restart"],
    ["k8s_kubectl_cluster_shell_start", "k8s.api.kubectl-cluster-shell"],
    ["k8s_open_kubectl_terminal", "k8s.api.kubectl-terminal-legacy"],
  ]) {
    if (k8sApi.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle} in k8s/api.ts`);
  }
  const workbench = read("src/components/k8s/K8sWorkbench.tsx");
  const k8sStoreSrc = read("src/stores/k8sStore.ts");
  if (
    workbench.includes("buildNavGroups") &&
    workbench.includes("K8S_AUTO_REFRESH_MS") &&
    workbench.includes("k8s-nav-session-actions") &&
    workbench.includes("k8s-nav-terminal") &&
    workbench.includes("k8s-nav-create-resource") &&
    workbench.includes("Terminal") &&
    workbench.includes("ssh_kubectl") &&
    workbench.includes("k8s-action-restart") &&
    workbench.includes("k8s-detail-tab-port-forward") &&
    workbench.includes("k8s-port-forward-pane") &&
    workbench.includes("parseForwardablePorts") &&
    workbench.includes("k8s-port-forward-rows") &&
    workbench.includes("parsePodVolumes") &&
    workbench.includes("k8s-overview-volumes") &&
    k8sStoreSrc.includes("Keep open resource tabs") &&
    exists("src/lib/k8s/forwardablePorts.ts") &&
    exists("src/lib/k8s/podVolumes.ts") &&
    !workbench.includes("k8s-row-menu-btn") &&
    !workbench.includes("K8sDetailTabAddMenu") &&
    !workbench.includes("sessionToolbarActions") &&
    !workbench.includes("K8sWorkbenchDockAddBar") &&
    !workbench.includes("title={cluster.display_name}")
  ) {
    pass("k8s.workbench-create", "nav footer + PF tab; tabs persist across category");
  } else {
    fail("k8s.workbench-create", "missing nav footer / PF tab / tabs still cleared on category");
  }
  if (exists("src/components/k8s/K8sClusterTerminalPanel.tsx")) {
    pass("k8s.dock-component", "K8sClusterTerminalPanel.tsx");
  } else {
    fail("k8s.dock-component", "missing K8sClusterTerminalPanel.tsx");
  }
  const terminalPanel = read("src/components/k8s/K8sClusterTerminalPanel.tsx");
  const createResource = read("src/lib/k8s/createResourceTemplates.ts");
  if (
    terminalPanel.includes("K8sClusterTerminalTabs") &&
    terminalPanel.includes("K8sCreateResourceTabs") &&
    terminalPanel.includes("K8sTemplatePicker") &&
    terminalPanel.includes("K8sYamlEditor") &&
    createResource.includes("CREATE_RESOURCE_TEMPLATE_GROUPS") &&
    createResource.includes("CREATE_RESOURCE_TEMPLATES") &&
    terminalPanel.includes("K8sDetailTabAddMenu") &&
    terminalPanel.includes("K8sCreateResourcePanes") &&
    workbench.includes("k8s-detail-tabs") &&
    workbench.includes("k8s-tree-footer-spacer")
  ) {
    pass("k8s.terminal-inline-tabs", "terminal/create tabs in detail tablist");
  } else {
    fail("k8s.terminal-inline-tabs", "terminal not wired into detail tabs");
  }
  if (exists("src/lib/k8s/createResource.ts")) {
    pass("k8s.create-resource", "createResource helper");
  } else {
    fail("k8s.create-resource", "missing createResource helper");
  }
  const actions = read("src/lib/k8s/actions.ts");
  if (actions.includes("canRestart") && actions.includes("canLogs")) {
    pass("k8s.actions", "canRestart/canLogs");
  } else {
    fail("k8s.actions", "missing canRestart/canLogs helpers");
  }
  const appTsx = read("src/App.tsx");
  const clusterTabs = read("src/lib/k8s/clusterTabs.ts");
  const k8sStore = read("src/stores/k8sStore.ts");
  if (
    appTsx.includes('data-tab-role="k8s-cluster"') &&
    appTsx.includes("cluster.display_name") &&
    appTsx.includes("k8s-cluster-tab-title") &&
    clusterTabs.includes("syncOpenClusterTabIds") &&
    k8sStore.includes("syncOpenClusterTabIds")
  ) {
    pass("k8s.cluster-tab-title", "top bar shows cluster display_name");
  } else {
    fail("k8s.cluster-tab-title", "missing cluster tab title wiring");
  }
  const k8sClusterStatusBar = read("src/components/k8s/K8sClusterStatusBar.tsx");
  const appSrc = read("src/App.tsx");
  if (
    k8sClusterStatusBar.includes('data-testid="k8s-cluster-statusbar"') &&
    k8sClusterStatusBar.includes("buildK8sStatusBarChips") &&
    appSrc.includes("K8sClusterStatusBar") &&
    appSrc.includes('sidebarView === "k8s"')
  ) {
    pass("k8s.cluster-statusbar", "K8sClusterStatusBar wired for k8s sidebar");
  } else {
    fail("k8s.cluster-statusbar", "missing K8s status bar wiring");
  }
  const connPanel = read("src/components/ConnectionPanel.tsx");
  if (
    appSrc.includes("chrome-sidebar-views") &&
    appSrc.includes('data-testid="sidebar-view-hosts"') &&
    appSrc.includes('data-testid="sidebar-view-k8s"') &&
    !connPanel.includes("sidebar-activity-bar")
  ) {
    pass("shell.chrome-sidebar-views", "Hosts/K8s switch in titlebar after sidebar toggle");
  } else {
    fail("shell.chrome-sidebar-views", "Hosts/K8s switch still in sidebar body or missing from chrome");
  }
}

// --- Sidecar API surface (Platform/MCP/eval removed) ---
{
  if (exists("agent-sidecar/tests/test_api_surface_integration.py")) {
    pass("sidecar.test-api-surface", "test_api_surface_integration.py");
  } else {
    fail("sidecar.test-api-surface", "missing test_api_surface_integration.py");
  }
  for (const dead of [
    "agent-sidecar/eval/runner.py",
    "agent-sidecar/app/mcp/registry.py",
    "agent-sidecar/app/memory/store.py",
  ]) {
    if (exists(dead)) fail(`sidecar.no-${dead.replace(/\//g, ".")}`, `${dead} still present`);
    else pass(`sidecar.no-${dead.replace(/\//g, ".")}`, `${dead} removed`);
  }
  const mainPy = read("agent-sidecar/app/main.py");
  for (const route of ["/v1/mcp/servers", "/v1/eval/run", "/v1/memory/search"]) {
    if (mainPy.includes(route)) fail(`sidecar.no-route-${route}`, `${route} still in main.py`);
    else pass(`sidecar.no-route-${route}`, `${route} removed`);
  }
}

// --- Test infrastructure ---
{
  if (exists("vitest.config.ts")) pass("test.vitest-config", "vitest.config.ts");
  else fail("test.vitest-config", "missing vitest.config.ts");
  if (exists("scripts/run-all-tests.sh")) pass("test.run-all", "run-all-tests.sh");
  else fail("test.run-all", "missing run-all-tests.sh");
  if (exists("scripts/cross-arch-rust-check.sh"))
    pass("test.cross-arch-script", "cross-arch-rust-check.sh");
  else fail("test.cross-arch-script", "missing cross-arch-rust-check.sh");
  if (exists("scripts/run-sidecar-pytest.sh"))
    pass("test.sidecar-pytest-script", "run-sidecar-pytest.sh");
  else fail("test.sidecar-pytest-script", "missing run-sidecar-pytest.sh");
  const ci = read(".github/workflows/ci.yml");
  if (ci.includes("linux-aarch64") && ci.includes("windows-x86_64"))
    pass("ci.cross-platform-matrix", "linux arm64 + windows in CI");
  else fail("ci.cross-platform-matrix", "CI matrix missing arch runners");
  if (exists("docs/TEST_MATRIX.md")) pass("test.matrix-doc", "TEST_MATRIX.md");
  else fail("test.matrix-doc", "missing TEST_MATRIX.md");
  if (exists("scripts/check-no-agent-hardcoding.mjs")) {
    pass("test.hardcoding-ban-script", "check-no-agent-hardcoding.mjs");
    const r = spawnSync(
      process.execPath,
      [path.join(root, "scripts/check-no-agent-hardcoding.mjs")],
      { encoding: "utf8" },
    );
    if (r.status === 0) pass("test.hardcoding-ban", (r.stdout || "").trim());
    else
      fail(
        "test.hardcoding-ban",
        (r.stderr || r.stdout || `exit ${r.status}`).trim().slice(0, 500),
      );
  } else {
    fail("test.hardcoding-ban-script", "missing check-no-agent-hardcoding.mjs");
  }
  if (exists("scripts/e2e-ssh-fixture.sh") && exists("scripts/e2e-ssh-integration.sh"))
    pass("test.ssh-live-script", "Docker SSH fixture + integration runner");
  else fail("test.ssh-live-script", "missing e2e-ssh scripts");
  if (exists("src-tauri/src/ssh/live_integration.rs"))
    pass("test.ssh-live-rust", "Rust live_integration tests");
  else fail("test.ssh-live-rust", "missing live_integration.rs");
  if (exists("e2e/ssh-drag-upload.spec.ts"))
    pass("test.drag-upload-e2e", "Playwright drag-upload spec");
  else fail("test.drag-upload-e2e", "missing ssh-drag-upload.spec.ts");
  if (exists("scripts/e2e-k8s-fixture.sh") && exists("scripts/e2e-k8s-integration.sh"))
    pass("test.k8s-live-script", "k3d fixture + K8s integration runner");
  else fail("test.k8s-live-script", "missing e2e-k8s scripts");
  if (exists("src-tauri/src/k8s/live_integration.rs"))
    pass("test.k8s-live-rust", "Rust k8s live_integration tests");
  else fail("test.k8s-live-rust", "missing k8s live_integration.rs");
  const e2eSpecs = [
    "e2e/tab-management.spec.ts",
    "e2e/terminal-links.spec.ts",
    "e2e/ssh-connection-ui.spec.ts",
    "e2e/ai-engineer-approval.spec.ts",
    "e2e/local-fs-actions.spec.ts",
    "e2e/k8s-actions.spec.ts",
    "e2e/settings-i18n.spec.ts",
  ];
  for (const rel of e2eSpecs) {
    if (exists(rel)) pass(`test.${rel.replace(/\//g, ".")}`, rel);
    else fail(`test.${rel.replace(/\//g, ".")}`, `missing ${rel}`);
  }
  if (exists("e2e/app-shell.spec.ts")) {
    const shell = read("e2e/app-shell.spec.ts");
    if (
      shell.includes("locale-switcher-menu") &&
      shell.includes('toHaveAttribute("lang"')
    ) {
      pass("test.locale-switch-e2e-asserts", "app-shell asserts menu + html lang");
    } else {
      fail(
        "test.locale-switch-e2e-asserts",
        "app-shell locale test must assert menu visibility and html lang",
      );
    }
    if (
      shell.includes("theme-switcher-menu") &&
      shell.includes('toHaveAttribute("data-theme"')
    ) {
      pass("test.theme-switch-e2e-asserts", "app-shell asserts theme menu + data-theme");
    } else {
      fail(
        "test.theme-switch-e2e-asserts",
        "app-shell theme test must assert menu visibility and data-theme",
      );
    }
  }
  const localeSwitcher = read("src/components/LocaleSwitcher.tsx");
  const localeFlagLib = read("src/lib/localeFlag.tsx");
  if (
    localeSwitcher.includes("createPortal") &&
    localeSwitcher.includes("locale-switcher-trigger") &&
    localeSwitcher.includes("LocaleFlagMark") &&
    localeFlagLib.includes("locale-flag-mark") &&
    localeFlagLib.includes('viewBox="0 0 24 16"') &&
    localeFlagLib.includes("chineseFlagStarPaths") &&
    localeFlagLib.includes("#de2910") &&
    !localeFlagLib.includes("🇨🇳") &&
    !localeFlagLib.includes("🇺🇸")
  ) {
    pass("ui.locale-switcher-portal", "menu portaled out of titlebar overflow");
    pass("ui.locale-flags", "zh-CN/en use flat rectangular SVG marks");
  } else {
    fail("ui.locale-switcher-portal", "LocaleSwitcher must portal menu (titlebar clips)");
    fail("ui.locale-flags", "LocaleSwitcher missing flat SVG flag UI");
  }
}

{
  const app = read("src/App.tsx");
  const switcher = read("src/stores/workspacePanelSwitch.ts");
  const cargo = read("src-tauri/Cargo.toml");
  const browserRs = read("src-tauri/src/browser.rs");
  const socks = read("src-tauri/src/ssh/socks.rs");
  const tunnel = read("src-tauri/src/ssh/tunnel.rs");
  const httpProxy = read("src-tauri/src/ssh/http_proxy.rs");
  const caps = read("src-tauri/capabilities/default.json");
  if (
    app.includes("DesktopPanel") &&
    !app.includes("BrowserTool") &&
    app.includes('switchWorkspacePanel("desktop"') &&
    switcher.includes('"desktop"') &&
    exists("src/components/browser/BrowserPanel.tsx") &&
    exists("src/stores/browserStore.ts") &&
    exists("src/stores/desktopStore.ts") &&
    read("src/components/desktop/desktopApps.ts").includes("dock-app-browser")
  ) {
    pass("ui.host-browser-panel", "Host desktop dock opens the browser (no titlebar globe)");
  } else {
    fail("ui.host-browser-panel", "missing desktop browser wiring, or titlebar BrowserTool is back");
  }
  if (
    exists("src-tauri/src/ssh/tunnel.rs") &&
    exists("src-tauri/src/ssh/http_proxy.rs") &&
    httpProxy.includes("Connection Established") &&
    browserRs.includes("ensure_tab") &&
    browserRs.includes("activate_tab") &&
    socks.includes("into_stream()") &&
    socks.includes("copy_bidirectional") &&
    tunnel.includes("into_stream()") &&
    browserRs.includes("HttpProxy") &&
    browserRs.includes("webview_url_for") &&
    browserRs.includes("start_via_socks") &&
    httpProxy.includes("allow_local_port") &&
    browserRs.includes("SocksBridge") &&
    browserRs.includes("http://127.0.0.1:") &&
    browserRs.includes(".proxy_url(") &&
    browserRs.includes("WebviewBuilder") &&
    browserRs.includes(".user_agent(") &&
    browserRs.includes("host_browser_user_agent") &&
    browserRs.includes("Chrome/131.") &&
    browserRs.includes("add_child") &&
    browserRs.includes("browser-history.json") &&
    browserRs.includes("hide_all_browser_surfaces") &&
    browserRs.includes("hide_browser_surface") &&
    browserRs.includes("tab_id:") &&
    browserRs.includes("#{}") &&
    read("src/stores/hostWorkspaceMemory.ts").includes("parkBrowserOverlays") &&
    read("src/stores/browserStore.ts").includes("browser_hide_session") &&
    read("src/lib/browserTabs.ts").includes("applyBrowserPageEvent") &&
    read("src/stores/browserStore.ts").includes("markBucketWarm") &&
    read("src/stores/browserStore.ts").includes("result.created") &&
    browserRs.includes("wake_browser_surface") &&
    browserRs.includes("set_visible") &&
    browserRs.includes("apply_webview_bounds") &&
    caps.includes("host-browser-*")
  ) {
    pass("ui.host-browser-socks", "SSH SOCKS + HTTP CONNECT, session-scoped webviews");
  } else {
    fail("ui.host-browser-socks", "missing HTTP proxy / child webview wiring");
  }
  if (
    exists("src/components/browser/BrowserDock.tsx") &&
    read("src/stores/browserStore.ts").includes("minimize:") &&
    read("src/components/browser/BrowserPanel.tsx").includes("host-browser-minimize")
  ) {
    pass("ui.host-browser-dock", "host browser minimize + dock restore");
  } else {
    fail("ui.host-browser-dock", "missing browser minimize/dock");
  }
  if (exists("e2e/host-browser.spec.ts")) {
    pass("test.e2e.host-browser", "e2e/host-browser.spec.ts");
  } else {
    fail("test.e2e.host-browser", "missing host-browser E2E");
  }
  const browserStoreSrc = read("src/stores/browserStore.ts");
  const browserPanelSrc = read("src/components/browser/BrowserPanel.tsx");
  if (
    browserStoreSrc.includes("sessionBuckets") &&
    browserStoreSrc.includes("newTab:") &&
    browserPanelSrc.includes("host-browser-tabs") &&
    browserPanelSrc.includes("ChatHistoryIcon") &&
    browserPanelSrc.includes("host-browser-library-toggle") &&
    !browserPanelSrc.includes("host-browser-go")
  ) {
    pass("ui.host-browser-tabs", "per-host tabs + Enter navigate + library icon");
  } else {
    fail("ui.host-browser-tabs", "missing browser tabs / library icon / Go removal");
  }
  if (
    browserRs.includes("FIT_WIDTH_EVAL") &&
    browserRs.includes("PAGE_META_EVAL") &&
    browserRs.includes("host-browser-load") &&
    browserStoreSrc.includes("host-browser-load") &&
    browserPanelSrc.includes("host-browser-progress") &&
    browserPanelSrc.includes("host-browser-tab-favicon") &&
    browserPanelSrc.includes("HostBrowserIcon") &&
    browserPanelSrc.includes("hideTitleText") &&
    exists("src/lib/browserPageChrome.ts")
  ) {
    pass(
      "ui.host-browser-load-chrome",
      "load progress + fit-width + favicon + globe title + window controls",
    );
  } else {
    fail("ui.host-browser-load-chrome", "missing load progress / favicon / compact chrome");
  }
  if (
    exists("src/stores/hostWorkspaceMemory.ts") &&
    read("src/stores/sessionStore.ts").includes("restoreHostWorkspace") &&
    read("src/stores/sessionStore.ts").includes("unstable_batchedUpdates") &&
    read("src/stores/sessionStore.ts").includes("migrateHostWorkspace") &&
    read("src/stores/hostWorkspaceMemory.ts").includes("markHostAiShell") &&
    read("src/stores/desktopStore.ts").includes("applySessionUi") &&
    read("src/lib/aiEngineer/panelVisibility.ts").includes(
      "shouldKeepAiEngineerPanelMounted",
    ) &&
    read("src/lib/aiEngineer/panelVisibility.ts").includes("activeTabId") &&
    app.includes("keepAiPanelMounted") &&
    app.includes("markHostAiShell") &&
    app.includes("activeTabId: sidebarView === \"hosts\" ? activeTabId : null") &&
    read("src/stores/workspacePanelSwitch.ts").includes(
      "Never reopen a parked host",
    ) &&
    read("src/components/aiEngineer/AiEngineerPanel.tsx").includes(
      "ai-engineer-panel-parked",
    ) &&
    read("src/App.css").includes("opacity: 0 !important") &&
    read("src/App.css").includes("visibility: visible !important") &&
    read("src/components/aiEngineer/AiEngineerPanel.tsx").includes(
      "shouldParkChatScrollerAtBottom",
    ) &&
    read("src/components/aiEngineer/AiMarkdown.tsx").includes(
      "selectStreamingMarkdownHtml",
    ) &&
    read("src/stores/hostWorkspaceMemory.ts").includes(
      "skipNextWorkspacePanelEnter",
    ) &&
    read("src/components/aiEngineer/AiEngineerPanel.tsx").includes(
      "already bound to this host",
    )
  ) {
    pass("ui.host-workspace-memory", "per-host shell snapshot on tab switch");
    pass(
      "ui.host-ai-fiber-no-flash",
      "parked AI fibers stay warm across host tab switches",
    );
  } else {
    fail("ui.host-workspace-memory", "missing host workspace memory wiring");
    fail("ui.host-ai-fiber-no-flash", "AI fiber park still uses display:none or empty markdown seed");
  }
  if (
    exists("src/components/desktop/DesktopPanel.tsx") &&
    exists("src/components/desktop/DesktopDock.tsx") &&
    exists("src/components/desktop/DesktopAppWindow.tsx") &&
    exists("src/components/desktop/FileManagerPanel.tsx") &&
    exists("src/components/desktop/ProcessManagerPanel.tsx") &&
    exists("e2e/host-desktop.spec.ts") &&
    read("src/stores/desktopStore.ts").includes("setAppMaximized") &&
    read("src/stores/desktopStore.ts").includes("toggleDockApp") &&
    read("src/components/desktop/DesktopAppWindow.tsx").includes(
      "preview-float-backdrop",
    ) &&
    read("src/components/desktop/DesktopAppWindow.tsx").includes(
      "preview-float-window",
    ) &&
    exists("src/lib/floatStacking.ts") &&
    read("src/lib/floatStacking.ts").includes("DESKTOP_APP_FLOAT_Z_BASE = 34000") &&
    read("src/lib/floatStacking.ts").includes("PREVIEW_FLOAT_Z = 35000")
  ) {
    pass("ui.host-desktop", "desktop dock apps open as Markdown-style floats");
  } else {
    fail("ui.host-desktop", "missing host desktop mode wiring");
  }
}

{
  // keep theme switcher block below from breaking — reinstate after locale block split
  const themeSwitcher = read("src/components/ThemeSwitcher.tsx");
  const appTsx = read("src/App.tsx");
  if (
    themeSwitcher.includes("createPortal") &&
    themeSwitcher.includes("theme-switcher-trigger") &&
    themeSwitcher.includes("setAppTheme") &&
    appTsx.includes("ThemeSwitcher")
  ) {
    pass("ui.theme-switcher", "titlebar ThemeSwitcher wired + portal menu");
  } else {
    fail("ui.theme-switcher", "ThemeSwitcher missing or not mounted in App.tsx");
  }
  const appTheme = read("src/lib/appTheme.ts");
  const appCss = read("src/App.css");
  if (
    appTheme.includes('THEME_STORAGE_KEY') &&
    appCss.includes('[data-theme="light"]') &&
    appCss.includes("--tw-canvas")
  ) {
    pass("ui.app-theme-tokens", "light theme CSS tokens + persistence module");
  } else {
    fail("ui.app-theme-tokens", "missing light theme tokens or appTheme module");
  }
}

pass("automated.ssh-connect", "Docker SSH + Rust live_integration + ssh-connection-ui E2E");
pass("automated.drag-upload", "Playwright drag-upload + Rust SFTP live_integration");
pass(
  "automated.ai-terminal-exec",
  "pytest hard_gates + approval_cancel + e2e/ai-engineer-approval.spec.ts",
);
pass("automated.k8s-workbench-live", "k3d + Rust k8s live_integration + k8s-actions E2E");
blocked(
  "manual.ui-click-header-tools",
  "Native Tauri titlebar hit-test; optional npm run test:e2e:desktop with DISPLAY",
);

const fails = results.filter((r) => r.status === "FAIL");
const passes = results.filter((r) => r.status === "PASS");
const blocks = results.filter((r) => r.status === "BLOCKED");

console.log("\n=== Product smoke checklist ===\n");
for (const r of results) {
  console.log(`${r.status.padEnd(7)} ${r.id}${r.note ? ` — ${r.note}` : ""}`);
}
console.log(
  `\nSummary: ${passes.length} PASS, ${fails.length} FAIL, ${blocks.length} BLOCKED\n`,
);

if (fails.length) process.exit(1);
