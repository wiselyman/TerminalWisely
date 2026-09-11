//! Durable AI Engineer UI chat history (SQLite on disk — no WebView quota).

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use once_cell::sync::OnceCell;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, Manager};

use crate::error::{AppError, AppResult};

const DB_NAME: &str = "ui-chat.sqlite3";
const META_MIGRATED: &str = "migrated_localstorage_v2";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatThreadRow {
    pub id: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    #[serde(default)]
    pub security_mode: String,
    #[serde(default)]
    pub interaction_mode: String,
    pub messages: Value,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub last_run_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScopeThreadBundle {
    pub active_thread_id: String,
    pub threads: Vec<ChatThreadRow>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ChatHistorySnapshot {
    pub by_scope: HashMap<String, ScopeThreadBundle>,
    pub migrated_from_localstorage: bool,
}

struct DbState {
    conn: Mutex<Connection>,
}

static DB: OnceCell<DbState> = OnceCell::new();

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn db_path(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::msg(e.to_string()))?
        .join("ai-engineer");
    std::fs::create_dir_all(&dir).map_err(AppError::from)?;
    Ok(dir.join(DB_NAME))
}

fn open_db(app: &AppHandle) -> AppResult<&'static DbState> {
    if let Some(s) = DB.get() {
        return Ok(s);
    }
    let path = db_path(app)?;
    let conn = Connection::open(&path).map_err(|e| AppError::msg(e.to_string()))?;
    conn.execute_batch(
        r#"
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
        "#,
    )
    .map_err(|e| AppError::msg(e.to_string()))?;
    // Best-effort schema upgrades for existing DBs.
    let _ = conn.execute("ALTER TABLE threads ADD COLUMN last_run_id TEXT", []);
    let _ = DB.set(DbState {
        conn: Mutex::new(conn),
    });
    DB.get()
        .ok_or_else(|| AppError::msg("chat history db init race"))
}

fn get_meta(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    conn.query_row(
        "SELECT value FROM meta WHERE key = ?1",
        params![key],
        |r| r.get::<_, String>(0),
    )
    .optional()
    .map_err(|e| AppError::msg(e.to_string()))
}

fn set_meta(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO meta(key, value) VALUES(?1, ?2)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        params![key, value],
    )
    .map_err(|e| AppError::msg(e.to_string()))?;
    Ok(())
}

fn thread_from_row(
    id: String,
    title: String,
    created_at: i64,
    updated_at: i64,
    security_mode: String,
    interaction_mode: String,
    messages_json: String,
    last_run_id: Option<String>,
) -> AppResult<ChatThreadRow> {
    let messages: Value =
        serde_json::from_str(&messages_json).unwrap_or_else(|_| Value::Array(vec![]));
    Ok(ChatThreadRow {
        id,
        title,
        created_at,
        updated_at,
        security_mode,
        interaction_mode,
        messages,
        last_run_id,
    })
}

fn load_scope_bundle(conn: &Connection, scope: &str) -> AppResult<Option<ScopeThreadBundle>> {
    let active: Option<String> = conn
        .query_row(
            "SELECT active_thread_id FROM scope_meta WHERE scope = ?1",
            params![scope],
            |r| r.get(0),
        )
        .optional()
        .map_err(|e| AppError::msg(e.to_string()))?;

    let mut stmt = conn
        .prepare(
            "SELECT id, title, created_at, updated_at, security_mode, interaction_mode, messages_json, last_run_id
             FROM threads WHERE scope = ?1 ORDER BY updated_at DESC",
        )
        .map_err(|e| AppError::msg(e.to_string()))?;
    let rows = stmt
        .query_map(params![scope], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, String>(4)?,
                r.get::<_, String>(5)?,
                r.get::<_, String>(6)?,
                r.get::<_, Option<String>>(7)?,
            ))
        })
        .map_err(|e| AppError::msg(e.to_string()))?;

    let mut threads = Vec::new();
    for row in rows {
        let (id, title, created_at, updated_at, security_mode, interaction_mode, messages_json, last_run_id) =
            row.map_err(|e| AppError::msg(e.to_string()))?;
        threads.push(thread_from_row(
            id,
            title,
            created_at,
            updated_at,
            security_mode,
            interaction_mode,
            messages_json,
            last_run_id,
        )?);
    }
    if threads.is_empty() && active.is_none() {
        return Ok(None);
    }
    let active_thread_id = active
        .filter(|id| threads.iter().any(|t| &t.id == id))
        .or_else(|| threads.first().map(|t| t.id.clone()))
        .unwrap_or_default();
    Ok(Some(ScopeThreadBundle {
        active_thread_id,
        threads,
    }))
}

pub fn load_chat_history(app: &AppHandle) -> AppResult<ChatHistorySnapshot> {
    let db = open_db(app)?;
    let conn = db.conn.lock().map_err(|e| AppError::msg(e.to_string()))?;
    let migrated = get_meta(&conn, META_MIGRATED)?.as_deref() == Some("1");

    let mut scopes: Vec<String> = conn
        .prepare("SELECT scope FROM scope_meta UNION SELECT DISTINCT scope FROM threads")
        .map_err(|e| AppError::msg(e.to_string()))?
        .query_map([], |r| r.get::<_, String>(0))
        .map_err(|e| AppError::msg(e.to_string()))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| AppError::msg(e.to_string()))?;
    scopes.sort();
    scopes.dedup();

    let mut by_scope = HashMap::new();
    for scope in scopes {
        if let Some(bundle) = load_scope_bundle(&conn, &scope)? {
            by_scope.insert(scope, bundle);
        }
    }
    Ok(ChatHistorySnapshot {
        by_scope,
        migrated_from_localstorage: migrated,
    })
}

fn upsert_thread(conn: &Connection, scope: &str, thread: &ChatThreadRow) -> AppResult<()> {
    let messages_json =
        serde_json::to_string(&thread.messages).map_err(|e| AppError::msg(e.to_string()))?;
    let security = if thread.security_mode.trim().is_empty() {
        "safe"
    } else {
        thread.security_mode.as_str()
    };
    let interaction = if thread.interaction_mode.trim().is_empty() {
        "agent"
    } else {
        thread.interaction_mode.as_str()
    };
    conn.execute(
        "INSERT INTO threads(
            id, scope, title, created_at, updated_at, security_mode, interaction_mode, messages_json, last_run_id
         ) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)
         ON CONFLICT(id) DO UPDATE SET
            scope = excluded.scope,
            title = excluded.title,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            security_mode = excluded.security_mode,
            interaction_mode = excluded.interaction_mode,
            messages_json = excluded.messages_json,
            last_run_id = excluded.last_run_id",
        params![
            thread.id,
            scope,
            thread.title,
            thread.created_at,
            thread.updated_at,
            security,
            interaction,
            messages_json,
            thread.last_run_id,
        ],
    )
    .map_err(|e| AppError::msg(e.to_string()))?;
    Ok(())
}

fn thread_has_messages(messages: &Value) -> bool {
    match messages {
        Value::Array(a) => !a.is_empty(),
        Value::String(s) => !s.trim().is_empty() && s.trim() != "[]",
        _ => false,
    }
}

/// Refuse empty placeholder bundles that would wipe real history on disk.
fn should_skip_empty_overwrite(
    incoming: &ScopeThreadBundle,
    existing: &Option<ScopeThreadBundle>,
) -> bool {
    let incoming_has_msgs = incoming
        .threads
        .iter()
        .any(|t| thread_has_messages(&t.messages));
    if incoming_has_msgs {
        return false;
    }
    existing
        .as_ref()
        .map(|e| e.threads.iter().any(|t| thread_has_messages(&t.messages)))
        .unwrap_or(false)
}

pub fn save_scope_bundle(
    app: &AppHandle,
    scope: String,
    bundle: ScopeThreadBundle,
) -> AppResult<()> {
    let db = open_db(app)?;
    let conn = db.conn.lock().map_err(|e| AppError::msg(e.to_string()))?;

    let existing = load_scope_bundle(&conn, &scope)?;
    if should_skip_empty_overwrite(&bundle, &existing) {
        // Never let an empty in-memory placeholder wipe real history.
        return Ok(());
    }

    let tx = conn
        .unchecked_transaction()
        .map_err(|e| AppError::msg(e.to_string()))?;

    tx.execute(
        "INSERT INTO scope_meta(scope, active_thread_id) VALUES(?1, ?2)
         ON CONFLICT(scope) DO UPDATE SET active_thread_id = excluded.active_thread_id",
        params![scope, bundle.active_thread_id],
    )
    .map_err(|e| AppError::msg(e.to_string()))?;

    // Replace threads for this scope exactly (deleted threads disappear).
    tx.execute("DELETE FROM threads WHERE scope = ?1", params![scope])
        .map_err(|e| AppError::msg(e.to_string()))?;
    for thread in &bundle.threads {
        upsert_thread(&tx, &scope, thread)?;
    }

    tx.commit().map_err(|e| AppError::msg(e.to_string()))?;
    Ok(())
}

/// Load one scope with full message bodies (for FE bind / open panel).
pub fn load_chat_scope(app: &AppHandle, scope: &str) -> AppResult<Option<ScopeThreadBundle>> {
    let db = open_db(app)?;
    let conn = db.conn.lock().map_err(|e| AppError::msg(e.to_string()))?;
    load_scope_bundle(&conn, scope)
}

/// Index load: all scopes/threads but messages stripped — avoids huge IPC payloads.
pub fn load_chat_history_index(app: &AppHandle) -> AppResult<ChatHistorySnapshot> {
    let mut snap = load_chat_history(app)?;
    for bundle in snap.by_scope.values_mut() {
        for thread in &mut bundle.threads {
            thread.messages = Value::Array(vec![]);
        }
    }
    Ok(snap)
}

pub fn save_all_scopes(
    app: &AppHandle,
    by_scope: HashMap<String, ScopeThreadBundle>,
) -> AppResult<()> {
    for (scope, bundle) in by_scope {
        save_scope_bundle(app, scope, bundle)?;
    }
    Ok(())
}

/// Import FE localStorage snapshot. Prefer newer updated_at on thread id conflict.
pub fn import_localstorage_snapshot(
    app: &AppHandle,
    by_scope: HashMap<String, ScopeThreadBundle>,
    force: bool,
) -> AppResult<ChatHistorySnapshot> {
    let db = open_db(app)?;
    {
        let conn = db.conn.lock().map_err(|e| AppError::msg(e.to_string()))?;
        if !force && get_meta(&conn, META_MIGRATED)?.as_deref() == Some("1") {
            drop(conn);
            return load_chat_history(app);
        }
    }

    let existing = load_chat_history(app)?;
    let mut merged = existing.by_scope;

    for (scope, incoming) in by_scope {
        let entry = merged.entry(scope.clone()).or_insert_with(|| ScopeThreadBundle {
            active_thread_id: incoming.active_thread_id.clone(),
            threads: vec![],
        });
        let mut by_id: HashMap<String, ChatThreadRow> = entry
            .threads
            .drain(..)
            .map(|t| (t.id.clone(), t))
            .collect();
        for t in incoming.threads {
            match by_id.get(&t.id) {
                Some(old) if old.updated_at >= t.updated_at => {}
                _ => {
                    by_id.insert(t.id.clone(), t);
                }
            }
        }
        let mut threads: Vec<_> = by_id.into_values().collect();
        threads.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
        if !incoming.active_thread_id.is_empty()
            && threads.iter().any(|t| t.id == incoming.active_thread_id)
        {
            entry.active_thread_id = incoming.active_thread_id;
        } else if entry.active_thread_id.is_empty() || !threads.iter().any(|t| t.id == entry.active_thread_id)
        {
            entry.active_thread_id = threads
                .first()
                .map(|t| t.id.clone())
                .unwrap_or_default();
        }
        entry.threads = threads;
    }

    save_all_scopes(app, merged)?;
    {
        let conn = db.conn.lock().map_err(|e| AppError::msg(e.to_string()))?;
        set_meta(&conn, META_MIGRATED, "1")?;
        set_meta(&conn, "migrated_at_ms", &now_ms().to_string())?;
    }
    load_chat_history(app)
}

pub fn mark_migrated(app: &AppHandle) -> AppResult<()> {
    let db = open_db(app)?;
    let conn = db.conn.lock().map_err(|e| AppError::msg(e.to_string()))?;
    set_meta(&conn, META_MIGRATED, "1")?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use serde_json::json;

    fn mem_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        conn.execute_batch(
            r#"
            CREATE TABLE meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
            CREATE TABLE scope_meta (scope TEXT PRIMARY KEY NOT NULL, active_thread_id TEXT NOT NULL);
            CREATE TABLE threads (
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
            "#,
        )
        .unwrap();
        conn
    }

    #[test]
    fn upsert_and_load_scope() {
        let conn = mem_db();
        let thread = ChatThreadRow {
            id: "t1".into(),
            title: "hello".into(),
            created_at: 1,
            updated_at: 2,
            security_mode: "safe".into(),
            interaction_mode: "agent".into(),
            messages: json!([{ "id": "m1", "kind": "user", "content": "hi" }]),
            last_run_id: Some("run-1".into()),
        };
        upsert_thread(&conn, "server:a@b:22", &thread).unwrap();
        conn.execute(
            "INSERT INTO scope_meta(scope, active_thread_id) VALUES(?1,?2)",
            params!["server:a@b:22", "t1"],
        )
        .unwrap();
        let bundle = load_scope_bundle(&conn, "server:a@b:22").unwrap().unwrap();
        assert_eq!(bundle.active_thread_id, "t1");
        assert_eq!(bundle.threads.len(), 1);
        assert_eq!(bundle.threads[0].title, "hello");
        assert_eq!(bundle.threads[0].last_run_id.as_deref(), Some("run-1"));
    }

    #[test]
    fn skip_empty_overwrite_when_disk_has_messages() {
        let existing = Some(ScopeThreadBundle {
            active_thread_id: "t1".into(),
            threads: vec![ChatThreadRow {
                id: "t1".into(),
                title: "old".into(),
                created_at: 1,
                updated_at: 2,
                security_mode: "safe".into(),
                interaction_mode: "agent".into(),
                messages: json!([{ "id": "m1" }]),
                last_run_id: None,
            }],
        });
        let empty = ScopeThreadBundle {
            active_thread_id: "t2".into(),
            threads: vec![ChatThreadRow {
                id: "t2".into(),
                title: "New chat".into(),
                created_at: 3,
                updated_at: 3,
                security_mode: "safe".into(),
                interaction_mode: "agent".into(),
                messages: json!([]),
                last_run_id: None,
            }],
        };
        assert!(should_skip_empty_overwrite(&empty, &existing));
        assert!(!should_skip_empty_overwrite(&empty, &None));
        let nonempty = ScopeThreadBundle {
            active_thread_id: "t2".into(),
            threads: vec![ChatThreadRow {
                id: "t2".into(),
                title: "n".into(),
                created_at: 3,
                updated_at: 3,
                security_mode: "safe".into(),
                interaction_mode: "agent".into(),
                messages: json!([{ "id": "m2" }]),
                last_run_id: None,
            }],
        };
        assert!(!should_skip_empty_overwrite(&nonempty, &existing));
    }
}
