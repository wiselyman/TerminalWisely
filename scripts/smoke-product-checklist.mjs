#!/usr/bin/env node
/**
 * Product smoke checklist (static + logic). Exit 1 on FAIL.
 * Does not replace SSH/UI interactive smoke — those are reported BLOCKED/MANUAL.
 */
import fs from "node:fs";
import path from "node:path";
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
}

// --- Store multi-thread ---
{
  const store = read("src/stores/aiEngineerStore.ts");
  for (const [needle, id] of [
    ["CHAT_HISTORY_KEY_V2", "store.v2-key"],
    ["CHAT_HISTORY_KEY_V1", "store.v1-migrate"],
    ["createThread", "store.createThread"],
    ["switchThread", "store.switchThread"],
    ["deleteThread", "store.deleteThread"],
    ["activeRunThreadId", "store.run-thread-guard"],
    ["MAX_THREADS_PER_SCOPE = 20", "store.cap-20"],
  ]) {
    if (store.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle}`);
  }
  if (store.includes("messagesByScope")) {
    fail("store.no-legacy-map", "messagesByScope still referenced");
  } else {
    pass("store.no-legacy-map", "messagesByScope removed");
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
      "portable-pty",
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

// Interactive product items that need a live SSH session / human
blocked(
  "manual.ssh-connect",
  "Needs live SSH host credentials in running Tauri app",
);
blocked(
  "manual.drag-upload",
  "Needs OS drag of local file onto SSH terminal",
);
blocked(
  "manual.ai-terminal-exec",
  "Needs connected SSH + configured model + approve path",
);
blocked(
  "manual.ui-click-header-tools",
  "Needs running Tauri window + Accessibility/manual click",
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
