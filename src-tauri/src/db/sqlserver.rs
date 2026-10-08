//! SQL Server over TDS. SQL text is already authorized before these run.

use futures::TryStreamExt;
use serde_json::Value;
use tokio_util::compat::TokioAsyncWriteCompatExt;

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
    let mut client = connect(host, port, connection, password).await?;
    let spid = session_id(&mut client).await;
    let work = async {
        if job.read_only && !rows_statement(&job.sql, "sqlserver") {
            return Err("read-only connection refused a changing statement".into());
        }
        if rows_statement(&job.sql, "sqlserver") {
            collect(&mut client, &job.sql, job.row_limit, pattern).await
        } else {
            client
                .execute(&job.sql, &[])
                .await
                .map_err(|err| err.to_string())?;
            Ok(SqlRows {
                columns: Vec::new(),
                rows: Vec::new(),
                truncated: false,
            })
        }
    };
    tokio::pin!(work);
    tokio::select! {
        result = &mut work => result,
        _ = tokio::time::sleep(query_timeout()) => {
            if let Some(spid) = spid {
                kill(host, port, connection, password, spid).await;
            }
            Err("query timed out".into())
        }
        halt = until_watch(watch) => {
            if let Some(spid) = spid {
                kill(host, port, connection, password, spid).await;
            }
            Err(super::live::halt_error(halt))
        }
    }
}

async fn connect(
    host: &str,
    port: u16,
    connection: &DbConnection,
    password: &str,
) -> Result<tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>, String> {
    let mut config = tiberius::Config::new();
    config.host(host);
    config.port(port);
    config.database(&connection.database);
    config.authentication(tiberius::AuthMethod::sql_server(&connection.user, password));
    if connection.tls == "verify-full" {
        config.encryption(tiberius::EncryptionLevel::Required);
    } else {
        config.encryption(tiberius::EncryptionLevel::NotSupported);
    }
    let tcp = tokio::time::timeout(query_timeout(), tokio::net::TcpStream::connect((host, port)))
        .await
        .map_err(|_| "query timed out".to_string())?
        .map_err(|err| err.to_string())?;
    tcp.set_nodelay(true).map_err(|err| err.to_string())?;
    tiberius::Client::connect(config, tcp.compat_write())
        .await
        .map_err(|err| err.to_string())
}

async fn session_id(client: &mut tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>) -> Option<i32> {
    let stream = client.query("SELECT @@SPID", &[]).await.ok()?;
    tokio::pin!(stream);
    while let Ok(Some(item)) = stream.try_next().await {
        if let tiberius::QueryItem::Row(row) = item {
            if let Ok(Some(value)) = row.try_get::<i16, _>(0) {
                return Some(i32::from(value));
            }
            if let Ok(Some(value)) = row.try_get::<i32, _>(0) {
                return Some(value);
            }
        }
    }
    None
}

async fn kill(host: &str, port: u16, connection: &DbConnection, password: &str, spid: i32) {
    let Ok(mut client) = connect(host, port, connection, password).await else {
        return;
    };
    let _ = client.execute(format!("KILL {spid}"), &[]).await;
}

async fn collect(
    client: &mut tiberius::Client<tokio_util::compat::Compat<tokio::net::TcpStream>>,
    sql: &str,
    row_limit: u32,
    pattern: Option<&str>,
) -> Result<SqlRows, String> {
    let pattern_owned = pattern.map(str::to_string);
    let stream = match pattern_owned.as_deref() {
        Some(value) => client.query(sql, &[&value]).await,
        None => client.query(sql, &[]).await,
    }
    .map_err(|err| err.to_string())?;
    tokio::pin!(stream);
    let mut columns = Vec::new();
    let mut rows = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;
    while let Some(item) = stream.try_next().await.map_err(|err| err.to_string())? {
        match item {
            tiberius::QueryItem::Metadata(meta) => {
                if columns.is_empty() {
                    columns = meta.columns().iter().map(|column| column.name().to_string()).collect();
                }
            }
            tiberius::QueryItem::Row(row) => {
                if truncated {
                    break;
                }
                let width = if columns.is_empty() { row.len() } else { columns.len() };
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
        }
    }
    Ok(SqlRows {
        columns,
        rows,
        truncated,
    })
}

fn cell(row: &tiberius::Row, index: usize) -> Value {
    macro_rules! text {
        ($ty:ty) => {
            match row.try_get::<$ty, _>(index) {
                Ok(Some(value)) => return Value::String(value.to_string()),
                Ok(None) => return Value::Null,
                Err(_) => {}
            }
        };
    }
    text!(&str);
    text!(i16);
    text!(i32);
    text!(i64);
    text!(f32);
    text!(f64);
    text!(bool);
    text!(chrono::NaiveDateTime);
    text!(chrono::NaiveDate);
    text!(chrono::NaiveTime);
    Value::Null
}
