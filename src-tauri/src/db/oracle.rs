//! Oracle thin protocol. No Instant Client. SQL text is already authorized before these run.

use std::time::Duration;

use serde_json::Value;

use super::catalog::DbConnection;
use super::driver::{consider_row, query_timeout, rows_statement, until_watch, RowTake, BYTE_CAP};
use super::gate::{SqlJob, SqlRows};
use super::live::QueryWatch;

pub async fn query(
    host: &str,
    port: u16,
    connection: &DbConnection,
    password: &str,
    job: &SqlJob,
    pattern: Option<&str>,
    watch: Option<&QueryWatch>,
) -> Result<SqlRows, String> {
    let host = host.to_string();
    let user = connection.user.clone();
    let service = connection.database.clone();
    let password = password.to_string();
    let sql = job.sql.clone();
    let read_only = job.read_only;
    let row_limit = job.row_limit;
    let pattern = pattern.map(str::to_string);
    let limit = query_timeout();
    let (id_tx, id_rx) = tokio::sync::oneshot::channel();
    let work_host = host.clone();
    let work_user = user.clone();
    let work_password = password.clone();
    let work_service = service.clone();
    let work = tokio::task::spawn_blocking(move || {
        blocking(
            &work_host,
            port,
            &work_user,
            &work_password,
            &work_service,
            &sql,
            read_only,
            row_limit,
            pattern.as_deref(),
            limit,
            id_tx,
        )
    });
    let mut id_rx = id_rx;
    let mut ids: Option<(usize, usize)> = None;
    let mut ids_done = false;
    let timeout_sleep = tokio::time::sleep(limit);
    tokio::pin!(work);
    tokio::pin!(timeout_sleep);
    loop {
        tokio::select! {
            result = &mut work => {
                return result.map_err(|err| err.to_string())?;
            }
            got = &mut id_rx, if !ids_done => {
                ids = got.ok();
                ids_done = true;
            }
            _ = &mut timeout_sleep => {
                if let Some((sid, serial)) = ids {
                    end_session(&host, port, &user, &password, &service, sid, serial, limit).await;
                }
                return Err("query timed out".into());
            }
            halt = until_watch(watch) => {
                if let Some((sid, serial)) = ids {
                    end_session(&host, port, &user, &password, &service, sid, serial, limit).await;
                }
                return Err(super::live::halt_error(halt));
            }
        }
    }
}

fn blocking(
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    service: &str,
    sql: &str,
    read_only: bool,
    row_limit: u32,
    pattern: Option<&str>,
    limit: Duration,
    id_tx: tokio::sync::oneshot::Sender<(usize, usize)>,
) -> Result<SqlRows, String> {
    let conn = connect(host, port, user, password, service, limit)?;
    if let (Ok(sid), Ok(serial)) = (conn.session_id(), conn.serial_num()) {
        let _ = id_tx.send((sid, serial));
    }
    if read_only && !rows_statement(sql, "oracle") {
        return Err("read-only connection refused a changing statement".into());
    }
    if read_only {
        conn.execute("SET TRANSACTION READ ONLY", &[])
            .map_err(|err| err.to_string())?;
    }
    let rows = if rows_statement(sql, "oracle") {
        fetch(&conn, sql, row_limit, pattern)
    } else {
        conn.execute(sql, &[]).map_err(|err| err.to_string())?;
        Ok(SqlRows {
            columns: Vec::new(),
            rows: Vec::new(),
            truncated: false,
        })
    };
    if read_only {
        let _ = conn.rollback();
    }
    rows
}

fn connect(
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    service: &str,
    limit: Duration,
) -> Result<oracledb::Connection, String> {
    let target = format!("{host}:{port}/{service}");
    let config = oracledb::Config::default()
        .set_credentials(user, password)
        .set_connect_string(&target)
        .map_err(|err| err.to_string())?;
    let conn = oracledb::connect(config).map_err(|err| err.to_string())?;
    conn.set_call_timeout(Some(limit)).map_err(|err| err.to_string())?;
    Ok(conn)
}

async fn end_session(
    host: &str,
    port: u16,
    user: &str,
    password: &str,
    service: &str,
    sid: usize,
    serial: usize,
    limit: Duration,
) {
    let host = host.to_string();
    let user = user.to_string();
    let password = password.to_string();
    let service = service.to_string();
    let _ = tokio::task::spawn_blocking(move || {
        let Ok(conn) = connect(&host, port, &user, &password, &service, limit) else {
            return;
        };
        let _ = conn.execute(
            &format!("ALTER SYSTEM KILL SESSION '{sid},{serial}' IMMEDIATE"),
            &[],
        );
    })
    .await;
}

fn fetch(conn: &oracledb::Connection, sql: &str, row_limit: u32, pattern: Option<&str>) -> Result<SqlRows, String> {
    let pattern_owned = pattern.map(str::to_string);
    let cursor = if let Some(value) = pattern_owned.as_ref() {
        let slots = sql.matches(":1").count().max(1);
        let params: Vec<&dyn oracledb::ToDbValue> = (0..slots).map(|_| value as &dyn oracledb::ToDbValue).collect();
        conn.query(sql, &params)
    } else {
        conn.query(sql, &[])
    }
    .map_err(|err| err.to_string())?;
    let columns: Vec<String> = cursor.columns().iter().map(|column| column.name().to_string()).collect();
    let width = columns.len();
    let mut rows = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;
    for item in cursor {
        if truncated {
            break;
        }
        let row = item.map_err(|err| err.to_string())?;
        let cells: Vec<Value> = (0..width).map(|index| cell(&row, index)).collect();
        let size = cells.iter().map(|item| item.to_string().len()).sum();
        match consider_row(rows.len() as u32, row_limit, bytes, size, BYTE_CAP) {
            RowTake::Keep => {
                bytes = bytes.saturating_add(size);
                rows.push(cells);
            }
            RowTake::Extra | RowTake::OverBudget => truncated = true,
        }
    }
    Ok(SqlRows {
        columns,
        rows,
        truncated,
    })
}

fn cell(row: &oracledb::Row, index: usize) -> Value {
    match row.get::<Option<String>>(index) {
        Ok(Some(text)) => return Value::String(text),
        Ok(None) => return Value::Null,
        Err(_) => {}
    }
    match row.get::<Option<i64>>(index) {
        Ok(Some(number)) => return Value::String(number.to_string()),
        Ok(None) => return Value::Null,
        Err(_) => {}
    }
    match row.get::<Option<f64>>(index) {
        Ok(Some(number)) => return Value::String(number.to_string()),
        Ok(None) => return Value::Null,
        Err(_) => {}
    }
    Value::Null
}
