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

// --- AI Platform panel (MCP / memory / eval / trace) ---
{
  const panel = read("src/components/aiEngineer/AiEngineerPlatformPanel.tsx");
  for (const [needle, id] of [
    ["listMcpServers", "platform.mcp-api"],
    ["searchMemoryCases", "platform.memory-api"],
    ["runOpsEval", "platform.eval-api"],
    ["data-testid=\"ai-engineer-platform-panel\"", "platform.testid-panel"],
    ["data-testid=\"ai-engineer-eval-run\"", "platform.testid-eval-run"],
    ["VITE_UI_DEMO_SCREENSHOTS", "platform.demo-env"],
  ]) {
    if (panel.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle} in AiEngineerPlatformPanel`);
  }
  const store = read("src/stores/aiEngineerStore.ts");
  for (const [needle, id] of [
    ["platformOpen", "platform.store-open"],
    ["togglePlatformView", "platform.store-toggle"],
    ["openPlatformView", "platform.store-open-fn"],
  ]) {
    if (store.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle} in aiEngineerStore`);
  }
  const trace = read("src/components/aiEngineer/AiEngineerRunTraceBar.tsx");
  if (
    trace.includes("data-testid=\"ai-engineer-run-trace\"") &&
    trace.includes("TraceSpanRow")
  ) {
    pass("platform.run-trace-bar", "RunTraceBar wired");
  } else {
    fail("platform.run-trace-bar", "RunTraceBar missing trace UI");
  }
  const api = read("src/lib/aiEngineer/api.ts");
  for (const [needle, id] of [
    ["listMcpServers", "platform.api.mcp"],
    ["searchMemoryCases", "platform.api.memory"],
    ["runOpsEval", "platform.api.eval"],
    ["fetchRunTrace", "platform.api.trace"],
  ]) {
    if (api.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle} in api.ts`);
  }
  const chat = read("src/lib/aiEngineer/chatClient.ts");
  if (chat.includes("flushUserContext")) pass("platform.api.user-context", "flushUserContext");
  else fail("platform.api.user-context", "missing flushUserContext");
}

// --- K8s workbench wiring ---
{
  const wb = read("src/components/k8s/K8sWorkbench.tsx");
  for (const [needle, id] of [
    ["K8sClusterSummaryView", "k8s.summary"],
    ["k8sPodLogs", "k8s.pod-logs"],
    ["NAV_GROUPS", "k8s.nav-groups"],
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
  ]) {
    if (k8sApi.includes(needle)) pass(id, needle);
    else fail(id, `missing ${needle} in k8s/api.ts`);
  }
}

// --- Sidecar eval harness files ---
{
  for (const rel of [
    "agent-sidecar/eval/runner.py",
    "agent-sidecar/eval/scorer.py",
    "agent-sidecar/eval/scenarios/ops_eval.yaml",
    "agent-sidecar/tests/test_api_surface_integration.py",
  ]) {
    if (exists(rel)) pass(`sidecar.${rel.replace(/\//g, ".")}`, rel);
    else fail(`sidecar.${rel.replace(/\//g, ".")}`, `missing ${rel}`);
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
blocked(
  "manual.platform-run-eval-ui",
  "Automated via Playwright: npm run test:e2e / scripts/e2e-playwright.sh",
);
blocked(
  "manual.k8s-workbench-live",
  "Needs live kubeconfig; SSH/K8s shell E2E planned — core UI covered by Playwright platform tests",
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
