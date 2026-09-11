#!/usr/bin/env node
/**
 * One-shot: import AI chat history from WebKit localStorage.sqlite3 into
 * app_data/ai-engineer/ui-chat.sqlite3 (schema matches Rust chat_history.rs).
 *
 * Usage:
 *   node scripts/migrate-ui-chat-from-webkit-ls.mjs [--force] [path-to-localstorage.sqlite3 ...]
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const KEY_V2 = "tw.aiEngineer.chatByScope.v2";
const KEY_V1 = "tw.aiEngineer.chatByScope.v1";
const META_MIGRATED = "migrated_localstorage_v2";

const DEFAULT_LS = path.join(
  os.homedir(),
  "Library/WebKit/TerminalWisely/WebsiteData/Default",
  "Kd2gZC-WfIvDAjJ9D2lyBM_sVmUbZifHCke25BAyFwQ",
  "Kd2gZC-WfIvDAjJ9D2lyBM_sVmUbZifHCke25BAyFwQ/LocalStorage",
);

const DEFAULT_OUT = path.join(
  os.homedir(),
  "Library/Application Support/com.wangyunfei.terminalwisely/ai-engineer/ui-chat.sqlite3",
);

function decodeLsValue(raw) {
  if (raw == null) return null;
  if (typeof raw === "string") {
    // Already decoded text, or accidental CSV of code units.
    if (raw.startsWith("{") || raw.startsWith("[")) return raw;
    if (/^\d+(,\d+){20,}/.test(raw)) {
      const codes = raw.split(",").map((n) => Number(n));
      const buf = Buffer.from(Uint8Array.from(codes));
      return buf.toString("utf16le");
    }
    return raw;
  }
  const buf = Buffer.isBuffer(raw)
    ? raw
    : Buffer.from(raw instanceof Uint8Array ? raw : Uint8Array.from(raw));
  // WebKit LocalStorage values are typically UTF-16LE.
  if (buf.length >= 2 && buf[1] === 0) {
    return buf.toString("utf16le");
  }
  if (buf.length >= 2 && buf[0] === 0) {
    return buf.swap16().toString("utf16le");
  }
  return buf.toString("utf8");
}

function readChatMap(sqlitePath) {
  const db = new DatabaseSync(sqlitePath, { readOnly: true });
  try {
    const row = db
      .prepare("SELECT value FROM ItemTable WHERE key = ?")
      .get(KEY_V2);
    let text = decodeLsValue(row?.value);
    if (!text) {
      const row1 = db
        .prepare("SELECT value FROM ItemTable WHERE key = ?")
        .get(KEY_V1);
      text = decodeLsValue(row1?.value);
      if (!text) return {};
      const parsed = JSON.parse(text);
      if (!parsed || typeof parsed !== "object") return {};
      const out = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (!Array.isArray(v)) continue;
        const id = `t_mig_${k.slice(0, 24)}`;
        out[k] = {
          activeThreadId: id,
          threads: [
            {
              id,
              title: "Chat 1",
              createdAt: Date.now(),
              updatedAt: Date.now(),
              securityMode: "safe",
              interactionMode: "agent",
              messages: v,
            },
          ],
        };
      }
      return out;
    }
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : {};
  } finally {
    db.close();
  }
}

function mergeByScope(base, incoming) {
  const out = { ...base };
  for (const [scope, bundle] of Object.entries(incoming)) {
    if (!bundle?.threads) continue;
    const prev = out[scope];
    if (!prev) {
      out[scope] = bundle;
      continue;
    }
    const byId = new Map();
    for (const t of prev.threads || []) byId.set(t.id, t);
    for (const t of bundle.threads || []) {
      const old = byId.get(t.id);
      if (!old || (t.updatedAt ?? 0) >= (old.updatedAt ?? 0)) byId.set(t.id, t);
    }
    const threads = [...byId.values()].sort(
      (a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0),
    );
    const active =
      threads.find((t) => t.id === bundle.activeThreadId)?.id ??
      threads.find((t) => t.id === prev.activeThreadId)?.id ??
      threads[0]?.id;
    out[scope] = { activeThreadId: active, threads };
  }
  return out;
}

function ensureSchema(db) {
  db.exec(`
    PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS scope_meta (
      scope TEXT PRIMARY KEY NOT NULL,
      active_thread_id TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY NOT NULL,
      scope TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      security_mode TEXT NOT NULL DEFAULT 'safe',
      interaction_mode TEXT NOT NULL DEFAULT 'agent',
      messages_json TEXT NOT NULL,
      last_run_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_threads_scope_updated
      ON threads(scope, updated_at DESC);
  `);
  try {
    db.exec("ALTER TABLE threads ADD COLUMN last_run_id TEXT");
  } catch {
    /* exists */
  }
}

function writeUiChat(outPath, byScope) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  if (fs.existsSync(outPath)) fs.unlinkSync(outPath);
  const db = new DatabaseSync(outPath);
  try {
    ensureSchema(db);
    const upsertMeta = db.prepare(
      "INSERT INTO meta(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    );
    const upsertScope = db.prepare(
      "INSERT INTO scope_meta(scope, active_thread_id) VALUES(?, ?) ON CONFLICT(scope) DO UPDATE SET active_thread_id = excluded.active_thread_id",
    );
    const insertThread = db.prepare(
      `INSERT INTO threads(
        id, scope, title, created_at, updated_at, security_mode, interaction_mode, messages_json, last_run_id
      ) VALUES(?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET
        scope = excluded.scope,
        title = excluded.title,
        created_at = excluded.created_at,
        updated_at = excluded.updated_at,
        security_mode = excluded.security_mode,
        interaction_mode = excluded.interaction_mode,
        messages_json = excluded.messages_json,
        last_run_id = excluded.last_run_id`,
    );

    const tx = db.prepare("BEGIN IMMEDIATE");
    const commit = db.prepare("COMMIT");
    tx.run();
    for (const [scope, bundle] of Object.entries(byScope)) {
      const threads = Array.isArray(bundle.threads) ? bundle.threads : [];
      if (!threads.length) continue;
      upsertScope.run(scope, bundle.activeThreadId || threads[0].id);
      for (const t of threads) {
        insertThread.run(
          t.id,
          scope,
          t.title || "New chat",
          Number(t.createdAt) || Date.now(),
          Number(t.updatedAt) || Date.now(),
          t.securityMode || "safe",
          t.interactionMode || "agent",
          JSON.stringify(t.messages || []),
          t.lastRunId ?? null,
        );
      }
    }
    upsertMeta.run(META_MIGRATED, "1");
    upsertMeta.run("migrated_at_ms", String(Date.now()));
    upsertMeta.run("migrated_by", "scripts/migrate-ui-chat-from-webkit-ls.mjs");
    commit.run();
  } finally {
    db.close();
  }
}

function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--force");
  const sources =
    args.length > 0
      ? args
      : [
          path.join(DEFAULT_LS, "localstorage.sqlite3.bak-before-quota-fix-1788767053"),
          path.join(DEFAULT_LS, "localstorage.sqlite3"),
        ].filter((p) => fs.existsSync(p));

  if (!sources.length) {
    console.error("No localStorage sqlite sources found.");
    process.exit(1);
  }

  let merged = {};
  for (const src of sources) {
    console.log("reading", src);
    const map = readChatMap(src);
    console.log("  scopes", Object.keys(map).length);
    merged = mergeByScope(merged, map);
  }

  const out = process.env.UI_CHAT_OUT || DEFAULT_OUT;
  console.log("writing", out, "scopes", Object.keys(merged).length);
  writeUiChat(out, merged);
  console.log("done (meta.migrated_localstorage_v2=1)");
}

main();
