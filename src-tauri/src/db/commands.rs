//! Tauri commands. The webview supplies a connection id and SQL; Rust reloads the saved connection.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tauri::{AppHandle, State};

use crate::ai_engineer::current_security_mode;
use crate::session::SessionManager;

use super::catalog::{
    catalog_from_value, rollback_save, DbCatalog, DbConnection, SaveDbConnection,
};
use super::secrets::{FileVault, KeyringSecretStore, DB_KEYCHAIN_SERVICE};
use super::driver::{self, database_name, explain_sql, status_sql};
use super::gate::{authorize, Authorized, SqlJob, SqlRows, MAX_ROW_LIMIT};
use super::lease::{register_db_lease, DbLease};

const STORE_FILE: &str = "db-connections.json";

#[derive(Debug, Deserialize)]
pub struct SaveDbRequest {
    pub id: Option<String>,
    pub name: String,
    pub engine: String,
    pub host: String,
    pub port: Option<u16>,
    pub database: String,
    pub user: String,
    pub tls: String,
    pub ssh_session_id: Option<String>,
    pub password: Option<String>,
    #[serde(default)]
    pub auth_database: String,
    #[serde(default)]
    pub clear_secret: bool,
}

#[derive(Debug, Serialize)]
pub struct DbQueryResponse {
    pub kind: String,
    pub columns: Vec<String>,
    pub rows: Vec<Vec<Value>>,
    pub truncated: bool,
    pub risk: String,
    pub connection_id: String,
    pub revision: u64,
    pub operation: String,
    pub sql: String,
}

fn secret_store(app: &AppHandle) -> Result<FileVault, String> {
    FileVault::open(&crate::durable::app_roots(app).primary, DB_KEYCHAIN_SERVICE)
}

fn load_catalog(app: &AppHandle) -> Result<DbCatalog, String> {
    let roots = crate::durable::app_roots(app);
    let document = crate::durable::load_value(&roots, STORE_FILE)?;
    let Some(value) = document.get("catalog").cloned() else {
        return Ok(DbCatalog::default());
    };
    let secrets = secret_store(app)?;
    let (catalog, migrated) = catalog_from_value(value, &secrets)?;
    let ids = catalog
        .list()
        .into_iter()
        .map(|item| item.secret_id)
        .filter(|id| !id.is_empty())
        .collect::<Vec<_>>();
    FileVault::import_legacy_once(
        &crate::durable::app_roots(app).primary,
        DB_KEYCHAIN_SERVICE,
        &ids,
        &KeyringSecretStore::db(),
    )?;
    if migrated {
        store_catalog(app, &catalog, crate::durable::WriteMode::KeepRecords)?;
    }
    Ok(catalog)
}

fn store_catalog(
    app: &AppHandle,
    catalog: &DbCatalog,
    mode: crate::durable::WriteMode,
) -> Result<(), String> {
    let value = serde_json::json!({
        "catalog": serde_json::to_value(catalog.export()).map_err(|err| err.to_string())?,
    });
    crate::durable::save_value(&crate::durable::app_roots(app), STORE_FILE, &value, mode)
}

fn response_rows(
    connection: &DbConnection,
    operation: &str,
    sql: &str,
    rows: SqlRows,
) -> DbQueryResponse {
    DbQueryResponse {
        kind: "rows".into(),
        columns: rows.columns,
        rows: rows.rows,
        truncated: rows.truncated,
        risk: String::new(),
        connection_id: connection.id.clone(),
        revision: connection.revision,
        operation: operation.into(),
        sql: sql.into(),
    }
}

fn response_approval(
    risk: String,
    connection_id: String,
    revision: u64,
    operation: String,
    sql: String,
) -> DbQueryResponse {
    DbQueryResponse {
        kind: "needs_approval".into(),
        columns: Vec::new(),
        rows: Vec::new(),
        truncated: false,
        risk,
        connection_id,
        revision,
        operation,
        sql,
    }
}

async fn run_authorized(
    app: &AppHandle,
    sessions: &SessionManager,
    connection_id: &str,
    operation: &str,
    sql: &str,
    row_limit: u32,
    lease_id: Option<String>,
    pattern: Option<&str>,
    database: Option<&str>,
    operation_id: Option<&str>,
) -> Result<DbQueryResponse, String> {
    let catalog = load_catalog(app)?;
    let mut connection = catalog
        .get(connection_id)
        .cloned()
        .ok_or_else(|| "connection not found".to_string())?;
    if let Some(name) = database {
        if connection.engine != "sqlite" {
            connection.database = database_name(name)?.to_string();
        }
    }
    let mode = current_security_mode(app).map_err(|err| err.to_string())?;
    let password = catalog.password(connection_id, &secret_store(app)?)?;
    match authorize(
        &connection,
        &mode,
        operation,
        sql,
        row_limit,
        lease_id.as_deref(),
    )? {
        Authorized::NeedsApproval {
            risk,
            connection_id,
            revision,
            operation,
            sql,
        } => Ok(response_approval(risk, connection_id, revision, operation, sql)),
        Authorized::Ready(job) => {
            let rows = driver::execute(sessions, &connection, &password, &job, pattern, operation_id).await?;
            Ok(response_rows(&connection, operation, &job.sql, rows))
        }
    }
}

#[tauri::command]
pub async fn db_list_connections(app: AppHandle) -> Result<Vec<DbConnection>, String> {
    Ok(load_catalog(&app)?.list())
}

#[tauri::command]
pub async fn db_save_connection(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    request: SaveDbRequest,
) -> Result<DbConnection, String> {
    if let Some(session_id) = request
        .ssh_session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        sessions
            .ssh_handle(session_id)
            .await
            .map_err(|_| "ssh session is not connected".to_string())?;
    }
    let mut catalog = load_catalog(&app)?;
    let secrets = secret_store(&app)?;
    let saved = catalog.save(
        SaveDbConnection {
            id: request.id,
            name: request.name,
            engine: request.engine,
            host: request.host,
            port: request.port,
            database: request.database,
            user: request.user,
            tls: request.tls,
            ssh_session_id: request.ssh_session_id,
            password: request.password,
            auth_database: request.auth_database,
            clear_secret: request.clear_secret,
        },
        &secrets,
    )?;
    let password = catalog.password(&saved.connection.id, &secrets)?;
    let probe = SqlJob {
        sql: driver::probe_command(&saved.connection.engine).into(),
        read_only: true,
        row_limit: 1,
    };
    if let Err(err) = driver::execute(&sessions, &saved.connection, &password, &probe, None, None).await {
        let _ = rollback_save(&saved, &secrets);
        return Err(err);
    }
    if let Err(err) = store_catalog(&app, &catalog, crate::durable::WriteMode::KeepRecords) {
        let _ = rollback_save(&saved, &secrets);
        return Err(err);
    }
    Ok(saved.connection)
}

/// Probe the form fields without writing the catalog or the keychain.
#[tauri::command]
pub async fn db_test_connection(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    request: SaveDbRequest,
) -> Result<String, String> {
    if let Some(session_id) = request
        .ssh_session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        sessions
            .ssh_handle(session_id)
            .await
            .map_err(|_| "ssh session is not connected".to_string())?;
    }
    let engine = super::catalog::normalize_engine(&request.engine)?;
    let spec = super::catalog::engine_spec(&engine).ok_or("engine is not available")?;
    let typed_password = request
        .password
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let password = if request.clear_secret {
        String::new()
    } else if let Some(value) = typed_password {
        value
    } else if let Some(id) = request.id.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        load_catalog(&app)?
            .password(id, &secret_store(&app)?)
            .unwrap_or_default()
    } else {
        String::new()
    };
    if !spec.file && engine != "redis" && password.is_empty() {
        return Err("password is required".into());
    }
    let mut user = request.user.trim().to_string();
    let mut host = request.host.trim().to_string();
    let mut port = request.port.unwrap_or(spec.port);
    if spec.file {
        host.clear();
        user.clear();
        port = 0;
    } else if user.is_empty() && engine == "redis" {
        user = "default".into();
    }
    let auth_database = if engine == "mongodb" {
        let trimmed = request.auth_database.trim();
        if trimmed.is_empty() {
            "admin".into()
        } else {
            trimmed.into()
        }
    } else {
        String::new()
    };
    let connection = DbConnection {
        id: "probe".into(),
        name: request.name,
        engine,
        host,
        port,
        database: request.database.trim().to_string(),
        user,
        auth_database,
        tls: request.tls,
        ssh_session_id: request.ssh_session_id,
        revision: 0,
        secret_id: String::new(),
    };
    let probe = SqlJob {
        sql: driver::probe_command(&connection.engine).into(),
        read_only: true,
        row_limit: 1,
    };
    driver::execute(&sessions, &connection, &password, &probe, None, None).await?;
    Ok("ok".into())
}

#[tauri::command]
pub async fn db_delete_connection(app: AppHandle, connection_id: String) -> Result<(), String> {
    let mut catalog = load_catalog(&app)?;
    let secrets = secret_store(&app)?;
    catalog.delete(&connection_id, &secrets)?;
    store_catalog(&app, &catalog, crate::durable::WriteMode::AllowEmpty)
}

#[tauri::command]
pub async fn db_query(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    connection_id: String,
    sql: String,
    row_limit: Option<u32>,
    lease_id: Option<String>,
    database: Option<String>,
    operation_id: Option<String>,
) -> Result<DbQueryResponse, String> {
    run_authorized(
        &app,
        &sessions,
        &connection_id,
        "query",
        &sql,
        row_limit.unwrap_or(MAX_ROW_LIMIT),
        lease_id,
        None,
        database.as_deref(),
        operation_id.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn db_explain(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    connection_id: String,
    sql: String,
    lease_id: Option<String>,
    database: Option<String>,
    operation_id: Option<String>,
) -> Result<DbQueryResponse, String> {
    let statement = sql.trim();
    if statement.is_empty() {
        return Err("sql is required".into());
    }
    run_authorized(
        &app,
        &sessions,
        &connection_id,
        "explain",
        &explain_sql(statement),
        MAX_ROW_LIMIT,
        lease_id,
        None,
        database.as_deref(),
        operation_id.as_deref(),
    )
    .await
}

#[tauri::command]
pub async fn db_list_databases(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    connection_id: String,
) -> Result<DbQueryResponse, String> {
    let catalog = load_catalog(&app)?;
    let connection = catalog
        .get(&connection_id)
        .cloned()
        .ok_or_else(|| "connection not found".to_string())?;
    run_authorized(
        &app,
        &sessions,
        &connection_id,
        "search",
        driver::list_command(&connection.engine),
        MAX_ROW_LIMIT,
        None,
        None,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub async fn db_search_objects(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    connection_id: String,
    query: Option<String>,
    database: Option<String>,
) -> Result<DbQueryResponse, String> {
    let catalog = load_catalog(&app)?;
    let connection = catalog
        .get(&connection_id)
        .cloned()
        .ok_or_else(|| "connection not found".to_string())?;
    let pattern = match query.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        Some(term) => format!("%{term}%"),
        None => "%%".into(),
    };
    run_authorized(
        &app,
        &sessions,
        &connection_id,
        "search",
        driver::search_command(&connection.engine),
        MAX_ROW_LIMIT,
        None,
        Some(&pattern),
        database.as_deref(),
        None,
    )
    .await
}

#[tauri::command]
pub async fn db_search_structure(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    connection_id: String,
    query: Option<String>,
    database: Option<String>,
) -> Result<DbQueryResponse, String> {
    let catalog = load_catalog(&app)?;
    let connection = catalog
        .get(&connection_id)
        .cloned()
        .ok_or_else(|| "connection not found".to_string())?;
    let sql = driver::structure_sql(&connection.engine).ok_or_else(|| "engine is not available".to_string())?;
    let pattern = match query.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
        Some(term) => format!("%{term}%"),
        None => "%%".into(),
    };
    run_authorized(
        &app,
        &sessions,
        &connection_id,
        "search",
        sql,
        MAX_ROW_LIMIT,
        None,
        Some(&pattern),
        database.as_deref(),
        None,
    )
    .await
}

#[tauri::command]
pub async fn db_status(
    app: AppHandle,
    sessions: State<'_, SessionManager>,
    connection_id: String,
    page: String,
) -> Result<DbQueryResponse, String> {
    let catalog = load_catalog(&app)?;
    let connection = catalog
        .get(&connection_id)
        .cloned()
        .ok_or_else(|| "connection not found".to_string())?;
    let sql = status_sql(&connection.engine, page.trim())?;
    run_authorized(
        &app,
        &sessions,
        &connection_id,
        "status",
        sql,
        MAX_ROW_LIMIT,
        None,
        None,
        None,
        None,
    )
    .await
}

#[tauri::command]
pub fn db_register_lease(
    connection_id: String,
    revision: u64,
    operation: String,
    sql: String,
) -> Result<String, String> {
    let lease_id = uuid::Uuid::new_v4().to_string();
    register_db_lease(DbLease {
        lease_id: lease_id.clone(),
        connection_id,
        revision,
        operation,
        sql,
        expires_at_epoch_s: std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs_f64() + 120.0)
            .unwrap_or(0.0),
        max_executions: 1,
        executions: 0,
        grant_kind: "approval".into(),
    })?;
    Ok(lease_id)
}

const QUERIES_FILE: &str = "db-queries.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SavedQueryRecord {
    #[serde(default)]
    pub connection_id: String,
    pub id: String,
    pub name: String,
    pub sql: String,
}

pub fn read_saved_queries(roots: &crate::durable::CatalogRoots, connection_id: &str) -> Result<Vec<SavedQueryRecord>, String> {
    let value = crate::durable::load_value(roots, QUERIES_FILE)?;
    Ok(query_records(&value)
        .into_iter()
        .filter(|item| item.connection_id == connection_id)
        .collect())
}

pub fn write_saved_queries(
    roots: &crate::durable::CatalogRoots,
    connection_id: &str,
    queries: &[SavedQueryRecord],
) -> Result<(), String> {
    let value = crate::durable::load_value(roots, QUERIES_FILE).unwrap_or(Value::Object(Default::default()));
    let mut records = query_records(&value);
    records.retain(|item| item.connection_id != connection_id);
    records.extend(queries.iter().filter(|item| item.connection_id == connection_id).cloned());
    let stored = serde_json::json!({ "entries": records });
    crate::durable::save_value(roots, QUERIES_FILE, &stored, crate::durable::WriteMode::AllowEmpty)
}

fn query_records(value: &Value) -> Vec<SavedQueryRecord> {
    value
        .get("entries")
        .and_then(|item| item.as_array())
        .map(|items| {
            items
                .iter()
                .filter_map(|item| serde_json::from_value::<SavedQueryRecord>(item.clone()).ok())
                .filter(|item| !item.id.is_empty() && !item.name.is_empty())
                .collect()
        })
        .unwrap_or_default()
}

#[tauri::command]
pub fn db_cancel_query(operation_id: String) {
    super::live::cancel_operation(operation_id.trim());
}

#[tauri::command]
pub fn db_list_saved_queries(app: AppHandle, connection_id: String) -> Result<Vec<SavedQueryRecord>, String> {
    read_saved_queries(&crate::durable::app_roots(&app), connection_id.trim())
}

#[tauri::command]
pub fn db_write_saved_queries(
    app: AppHandle,
    connection_id: String,
    queries: Vec<SavedQueryRecord>,
) -> Result<(), String> {
    let connection_id = connection_id.trim().to_string();
    let queries: Vec<SavedQueryRecord> = queries
        .into_iter()
        .map(|item| SavedQueryRecord {
            connection_id: connection_id.clone(),
            id: item.id,
            name: item.name,
            sql: item.sql,
        })
        .filter(|item| !item.id.is_empty() && !item.name.is_empty())
        .collect();
    write_saved_queries(&crate::durable::app_roots(&app), &connection_id, &queries)
}

#[cfg(test)]
mod saved_query_tests {
    use super::*;

    #[test]
    fn saved_queries_round_trip_and_delete_without_touching_another_connection() {
        let dir = std::env::temp_dir().join(format!("tw-queries-{}", uuid::Uuid::new_v4()));
        let roots = crate::durable::CatalogRoots {
            primary: dir.join("primary"),
            mirror: dir.join("mirror"),
        };
        let first = SavedQueryRecord {
            connection_id: "a".into(),
            id: "saved-1".into(),
            name: "open".into(),
            sql: "SELECT 1".into(),
        };
        write_saved_queries(&roots, "a", &[first.clone()]).unwrap();
        write_saved_queries(
            &roots,
            "b",
            &[SavedQueryRecord {
                connection_id: "b".into(),
                id: "saved-2".into(),
                name: "other".into(),
                sql: "SELECT 2".into(),
            }],
        )
        .unwrap();
        assert_eq!(read_saved_queries(&roots, "a").unwrap(), vec![first]);
        write_saved_queries(&roots, "a", &[]).unwrap();
        assert!(read_saved_queries(&roots, "a").unwrap().is_empty());
        assert_eq!(read_saved_queries(&roots, "b").unwrap().len(), 1);
        let _ = std::fs::remove_dir_all(dir);
    }
}
