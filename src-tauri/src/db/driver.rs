//! Postgres and MySQL execution. Read jobs stay inside a driver-managed read-only transaction.
//! Results are streamed. A timeout or SSH disconnect cancels the backend statement.

use std::time::Duration;

use base64::Engine;
use futures::StreamExt;
use serde_json::{json, Value};
use sqlparser::ast::Statement;
use sqlparser::dialect::{MySqlDialect, PostgreSqlDialect};
use sqlparser::parser::Parser;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;
use tokio::time::timeout;

use crate::session::SessionManager;
use crate::ssh::socks::SocksBridge;
use crate::ssh::tunnel::TcpTunnel;

use super::catalog::DbConnection;
use super::gate::{SqlJob, SqlRows, QUERY_TIMEOUT_SECS};
use super::live::QueryWatch;
use super::route::dial_plan;

pub(crate) const BYTE_CAP: usize = 1_048_576;
/// Catalog search can return tens of thousands of column rows.
pub(crate) const CATALOG_BYTE_CAP: usize = 16 * 1_048_576;

fn byte_cap_for_limit(row_limit: u32) -> usize {
    // Data queries stay on the 500 soft cap; catalog uses CATALOG_ROW_LIMIT.
    if row_limit > 500 {
        CATALOG_BYTE_CAP
    } else {
        BYTE_CAP
    }
}

struct Forward {
    _socks: SocksBridge,
    _tunnel: TcpTunnel,
    local_port: u16,
}

struct ConnTask(tokio::task::JoinHandle<()>);

impl Drop for ConnTask {
    fn drop(&mut self) {
        self.0.abort();
    }
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum RowTake {
    Keep,
    Extra,
    OverBudget,
}

pub(crate) fn query_timeout() -> Duration {
    std::env::var("TW_DB_QUERY_TIMEOUT_SECS")
        .ok()
        .and_then(|value| value.parse::<u64>().ok())
        .filter(|value| *value > 0)
        .map(Duration::from_secs)
        .unwrap_or_else(|| Duration::from_secs(QUERY_TIMEOUT_SECS))
}

pub(crate) fn consider_row(accepted: u32, limit: u32, bytes: usize, row_bytes: usize, cap: usize) -> RowTake {
    if accepted >= limit {
        return RowTake::Extra;
    }
    if row_bytes > cap || bytes.saturating_add(row_bytes) > cap {
        return RowTake::OverBudget;
    }
    RowTake::Keep
}

pub fn postgres_ssl_mode(tls: &str) -> tokio_postgres::config::SslMode {
    if tls == "verify-full" {
        tokio_postgres::config::SslMode::Require
    } else {
        tokio_postgres::config::SslMode::Disable
    }
}

pub async fn execute(
    sessions: &SessionManager,
    connection: &DbConnection,
    password: &str,
    job: &SqlJob,
    pattern: Option<&str>,
    operation_id: Option<&str>,
) -> Result<SqlRows, String> {
    let plan = dial_plan(connection);
    let watch = super::live::begin(operation_id, plan.tunnel_session_id.as_deref());
    let rows = execute_dial(sessions, connection, password, job, pattern, watch.as_ref()).await;
    rows.map_err(|err| redact(&err, password))
}

async fn execute_dial(
    sessions: &SessionManager,
    connection: &DbConnection,
    password: &str,
    job: &SqlJob,
    pattern: Option<&str>,
    watch: Option<&QueryWatch>,
) -> Result<SqlRows, String> {
    if let Some(watch) = watch {
        let halt = watch.halt();
        if halt != super::live::Halt::None {
            return Err(super::live::halt_error(halt));
        }
    }
    if connection.engine == "sqlite" {
        return super::engines::sqlite_query(connection, job, pattern, watch).await;
    }
    let plan = dial_plan(connection);
    let forward = match plan.tunnel_session_id.as_deref() {
        Some(session_id) => {
            Some(open_forward(sessions, session_id, &plan.host, plan.port).await?)
        }
        None => None,
    };
    let tcp_host = forward
        .as_ref()
        .map(|_| "127.0.0.1".to_string())
        .unwrap_or_else(|| plan.host.clone());
    let tcp_port = forward.as_ref().map(|item| item.local_port).unwrap_or(plan.port);
    match connection.engine.as_str() {
        "mysql" | "mariadb" => {
            mysql_query(
                &tcp_host,
                tcp_port,
                &plan.tls_server_name,
                connection,
                password,
                job,
                pattern,
                watch,
            )
            .await
        }
        "postgres" => {
            postgres_query(
                &tcp_host,
                tcp_port,
                &plan.tls_server_name,
                connection,
                password,
                job,
                pattern,
                watch,
            )
            .await
        }
        "sqlserver" => {
            super::sqlserver::query(&tcp_host, tcp_port, connection, password, job, pattern, watch).await
        }
        "oracle" => super::oracle::query(&tcp_host, tcp_port, connection, password, job, pattern, watch).await,
        "redis" => super::engines::redis_query(&tcp_host, tcp_port, connection, password, job, pattern, watch).await,
        "mongodb" => {
            super::engines::mongodb_query(&tcp_host, tcp_port, connection, password, job, watch).await
        }
        _ => Err("engine is not available".into()),
    }
}

async fn open_forward(
    sessions: &SessionManager,
    session_id: &str,
    host: &str,
    port: u16,
) -> Result<Forward, String> {
    let handle = sessions
        .ssh_handle(session_id)
        .await
        .map_err(|err| err.to_string())?;
    let socks = SocksBridge::start(handle)
        .await
        .map_err(|err| err.to_string())?;
    let tunnel = TcpTunnel::start_via_socks(socks.port, host.to_string(), port)
        .await
        .map_err(|err| err.to_string())?;
    let local_port = tunnel.local_port;
    Ok(Forward {
        _socks: socks,
        _tunnel: tunnel,
        local_port,
    })
}

fn redact(err: &str, password: &str) -> String {
    if password.is_empty() {
        return err.to_string();
    }
    err.replace(password, "***")
}

/// tokio-postgres `Display` for database faults is only `"db error"`; the useful
/// text lives on `source()` (`FATAL: …`). Walk the chain so the UI is not opaque.
fn format_error(err: &dyn std::error::Error) -> String {
    let mut message = err.to_string();
    let mut current = err.source();
    while let Some(source) = current {
        let next = source.to_string();
        if !next.is_empty() && !message.contains(&next) {
            message = format!("{message}: {next}");
        }
        current = source.source();
    }
    message
}

pub(crate) async fn until_watch(watch: Option<&QueryWatch>) -> super::live::Halt {
    match watch {
        Some(watch) => watch.until_halt().await,
        None => std::future::pending().await,
    }
}

async fn postgres_query(
    tcp_host: &str,
    tcp_port: u16,
    tls_name: &str,
    connection: &DbConnection,
    password: &str,
    job: &SqlJob,
    pattern: Option<&str>,
    watch: Option<&QueryWatch>,
) -> Result<SqlRows, String> {
    let connected = timeout(
        query_timeout(),
        connect_postgres(tcp_host, tcp_port, tls_name, connection, password),
    )
    .await;
    let (client, task) = match connected {
        Ok(result) => result?,
        Err(_) => return Err("query timed out".into()),
    };
    let _guard = ConnTask(task);
    let cancel = client.cancel_token();
    let work = run_postgres(&client, connection, job, pattern);
    tokio::pin!(work);
    let outcome = tokio::select! {
        result = &mut work => result,
        _ = tokio::time::sleep(query_timeout()) => {
            cancel_postgres(&cancel, tcp_host, tcp_port, tls_name, connection).await;
            Err("query timed out".into())
        }
        halt = until_watch(watch) => {
            cancel_postgres(&cancel, tcp_host, tcp_port, tls_name, connection).await;
            Err(super::live::halt_error(halt))
        }
    };
    outcome
}

async fn connect_postgres(
    tcp_host: &str,
    tcp_port: u16,
    tls_name: &str,
    connection: &DbConnection,
    password: &str,
) -> Result<(tokio_postgres::Client, tokio::task::JoinHandle<()>), String> {
    let stream = TcpStream::connect((tcp_host, tcp_port))
        .await
        .map_err(|err| err.to_string())?;
    let mut config = tokio_postgres::Config::new();
    config.user(&connection.user);
    config.password(password);
    config.dbname(&connection.database);
    config.host(tcp_host);
    config.port(tcp_port);
    config.ssl_mode(postgres_ssl_mode(&connection.tls));
    if connection.tls == "verify-full" {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
        let (connector, _errors) = tokio_postgres_rustls::MakeRustlsConnect::with_native_certs()
            .map_err(|_| "could not load native certificate roots".to_string())?;
        let mut connector = connector;
        use tokio_postgres::tls::MakeTlsConnect;
        let tls = MakeTlsConnect::<TcpStream>::make_tls_connect(&mut connector, tls_name)
            .map_err(|err| err.to_string())?;
        let (client, conn) = config
            .connect_raw(stream, tls)
            .await
            .map_err(|err| format_error(&err))?;
        let task = tokio::spawn(async move {
            let _ = conn.await;
        });
        Ok((client, task))
    } else {
        let (client, conn) = config
            .connect_raw(stream, tokio_postgres::NoTls)
            .await
            .map_err(|err| format_error(&err))?;
        let task = tokio::spawn(async move {
            let _ = conn.await;
        });
        Ok((client, task))
    }
}

async fn cancel_postgres(
    cancel: &tokio_postgres::CancelToken,
    tcp_host: &str,
    tcp_port: u16,
    tls_name: &str,
    connection: &DbConnection,
) {
    let Ok(stream) = TcpStream::connect((tcp_host, tcp_port)).await else {
        return;
    };
    if connection.tls == "verify-full" {
        let _ = rustls::crypto::aws_lc_rs::default_provider().install_default();
        let Ok((connector, _errors)) = tokio_postgres_rustls::MakeRustlsConnect::with_native_certs()
        else {
            return;
        };
        let mut connector = connector;
        use tokio_postgres::tls::MakeTlsConnect;
        let Ok(tls) = MakeTlsConnect::<TcpStream>::make_tls_connect(&mut connector, tls_name) else {
            return;
        };
        let _ = cancel.cancel_query_raw(stream, tls).await;
    } else {
        let _ = cancel.cancel_query_raw(stream, tokio_postgres::NoTls).await;
    }
}

async fn run_postgres(
    client: &tokio_postgres::Client,
    connection: &DbConnection,
    job: &SqlJob,
    pattern: Option<&str>,
) -> Result<SqlRows, String> {
    if job.read_only {
        client
            .batch_execute("BEGIN READ ONLY")
            .await
            .map_err(|err| format!("read-only transaction failed: {}", format_error(&err)))?;
        let rows = match fetch_postgres(client, &job.sql, job.row_limit, pattern, &connection.engine).await
        {
            Ok(rows) => rows,
            Err(err) => {
                let _ = client.batch_execute("ROLLBACK").await;
                return Err(err);
            }
        };
        let _ = client.batch_execute("ROLLBACK").await;
        Ok(rows)
    } else {
        fetch_postgres(client, &job.sql, job.row_limit, pattern, &connection.engine).await
    }
}

pub(crate) fn rows_statement(sql: &str, engine: &str) -> bool {
    let dialect: Box<dyn sqlparser::dialect::Dialect> = match engine {
        "mysql" | "mariadb" => Box::new(MySqlDialect {}),
        "sqlite" => Box::new(sqlparser::dialect::SQLiteDialect {}),
        "sqlserver" => Box::new(sqlparser::dialect::MsSqlDialect {}),
        "oracle" => Box::new(sqlparser::dialect::GenericDialect {}),
        _ => Box::new(PostgreSqlDialect {}),
    };
    let Ok(statements) = Parser::parse_sql(dialect.as_ref(), sql) else {
        return false;
    };
    let [statement] = statements.as_slice() else {
        return false;
    };
    match statement {
        Statement::Query(_) => true,
        Statement::Explain { statement, .. } => matches!(statement.as_ref(), Statement::Query(_)),
        _ => false,
    }
}

fn streams_as_query(sql: &str, engine: &str) -> bool {
    let dialect: Box<dyn sqlparser::dialect::Dialect> = if engine == "mysql" {
        Box::new(MySqlDialect {})
    } else {
        Box::new(PostgreSqlDialect {})
    };
    let Ok(statements) = Parser::parse_sql(dialect.as_ref(), sql) else {
        return false;
    };
    let [statement] = statements.as_slice() else {
        return false;
    };
    match statement {
        Statement::Query(_) | Statement::Insert(_) | Statement::Update { .. } | Statement::Delete(_) => {
            true
        }
        Statement::Explain { statement, .. } => matches!(
            statement.as_ref(),
            Statement::Query(_) | Statement::Insert(_) | Statement::Update { .. } | Statement::Delete(_)
        ),
        _ => false,
    }
}

async fn fetch_postgres(
    client: &tokio_postgres::Client,
    sql: &str,
    row_limit: u32,
    pattern: Option<&str>,
    engine: &str,
) -> Result<SqlRows, String> {
    if streams_as_query(sql, engine) {
        let statement = client.prepare(sql).await.map_err(|err| format_error(&err))?;
        if let Some(pattern) = pattern {
            let stream = client
                .query_raw(
                    &statement,
                    std::iter::once(&pattern as &(dyn tokio_postgres::types::ToSql + Sync)),
                )
                .await
                .map_err(|err| format_error(&err))?;
            return drain_postgres(stream, row_limit).await;
        }
        let stream = client
            .query_raw(
                &statement,
                std::iter::empty::<&(dyn tokio_postgres::types::ToSql + Sync)>(),
            )
            .await
            .map_err(|err| format_error(&err))?;
        return drain_postgres(stream, row_limit).await;
    }
    let messages = client.simple_query(sql).await.map_err(|err| format_error(&err))?;
    messages_to_rows(messages, row_limit)
}

async fn drain_postgres(
    stream: impl futures::Stream<Item = Result<tokio_postgres::Row, tokio_postgres::Error>>,
    row_limit: u32,
) -> Result<SqlRows, String> {
    tokio::pin!(stream);
    let mut columns = Vec::new();
    let mut rows = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;
    while let Some(item) = stream.next().await {
        let row = item.map_err(|err| format_error(&err))?;
        if columns.is_empty() {
            columns = row
                .columns()
                .iter()
                .map(|column| column.name().to_string())
                .collect();
        }
        let cells: Vec<Value> = (0..row.len()).map(|index| pg_cell(&row, index)).collect();
        let size = cells.iter().map(|cell| cell.to_string().len()).sum();
        match consider_row(rows.len() as u32, row_limit, bytes, size, byte_cap_for_limit(row_limit)) {
            RowTake::Keep => {
                bytes = bytes.saturating_add(size);
                rows.push(cells);
            }
            RowTake::Extra | RowTake::OverBudget => {
                truncated = true;
                break;
            }
        }
    }
    Ok(SqlRows {
        columns,
        rows,
        truncated,
    })
}

struct AnyNull;

impl<'a> tokio_postgres::types::FromSql<'a> for AnyNull {
    fn from_sql(
        _ty: &tokio_postgres::types::Type,
        _raw: &'a [u8],
    ) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        Ok(AnyNull)
    }

    fn accepts(_ty: &tokio_postgres::types::Type) -> bool {
        true
    }
}

struct PgNumeric(String);

impl<'a> tokio_postgres::types::FromSql<'a> for PgNumeric {
    fn from_sql(
        _ty: &tokio_postgres::types::Type,
        raw: &'a [u8],
    ) -> Result<Self, Box<dyn std::error::Error + Sync + Send>> {
        decode_pg_numeric(raw)
            .map(PgNumeric)
            .map_err(|err| std::io::Error::new(std::io::ErrorKind::InvalidData, err).into())
    }

    fn accepts(ty: &tokio_postgres::types::Type) -> bool {
        ty.name() == "numeric"
    }
}

fn decode_pg_numeric(raw: &[u8]) -> Result<String, String> {
    if raw.len() < 8 {
        return Err("short numeric".into());
    }
    let ndigits = i16::from_be_bytes([raw[0], raw[1]]) as i32;
    let weight = i16::from_be_bytes([raw[2], raw[3]]) as i32;
    let sign = u16::from_be_bytes([raw[4], raw[5]]);
    let dscale = i16::from_be_bytes([raw[6], raw[7]]) as usize;
    if sign == 0xC000 {
        return Ok("NaN".into());
    }
    if ndigits < 0 {
        return Err("bad numeric".into());
    }
    let mut digits = Vec::with_capacity(ndigits as usize);
    let mut offset = 8;
    for _ in 0..ndigits {
        if offset + 2 > raw.len() {
            return Err("short numeric".into());
        }
        digits.push(u16::from_be_bytes([raw[offset], raw[offset + 1]]));
        offset += 2;
    }
    if ndigits == 0 {
        return Ok("0".into());
    }
    let mut result = String::new();
    if sign == 0x4000 {
        result.push('-');
    }
    let mut index = 0i32;
    if weight >= 0 {
        result.push_str(&digits[0].to_string());
        index = 1;
        for _ in 0..weight {
            let digit = if index < ndigits {
                digits[index as usize]
            } else {
                0
            };
            result.push_str(&format!("{digit:04}"));
            index += 1;
        }
    } else {
        result.push('0');
    }
    if dscale > 0 {
        result.push('.');
        let mut frac = String::new();
        if weight < 0 {
            for _ in 0..(-weight - 1) {
                frac.push_str("0000");
            }
        }
        while index < ndigits {
            frac.push_str(&format!("{:04}", digits[index as usize]));
            index += 1;
        }
        if frac.len() < dscale {
            frac.push_str(&"0".repeat(dscale - frac.len()));
        }
        frac.truncate(dscale);
        result.push_str(&frac);
    }
    Ok(result)
}

fn pg_cell(row: &tokio_postgres::Row, index: usize) -> Value {
    if matches!(row.try_get::<_, Option<AnyNull>>(index), Ok(None)) {
        return Value::Null;
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<bool>>(index) {
        return Value::Bool(value);
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<i16>>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<i32>>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<i64>>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<f32>>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<f64>>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(PgNumeric(text))) = row.try_get::<_, Option<PgNumeric>>(index) {
        return Value::String(text);
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<chrono::NaiveDateTime>>(index) {
        return Value::String(value.format("%Y-%m-%d %H:%M:%S%.6f").to_string());
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<chrono::DateTime<chrono::Utc>>>(index) {
        return Value::String(value.to_rfc3339());
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<chrono::NaiveDate>>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<chrono::NaiveTime>>(index) {
        return Value::String(value.format("%H:%M:%S%.6f").to_string());
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<uuid::Uuid>>(index) {
        return Value::String(value.to_string());
    }
    if let Ok(Some(value)) = row.try_get::<_, Option<serde_json::Value>>(index) {
        return value;
    }
    if let Ok(Some(bytes)) = row.try_get::<_, Option<Vec<u8>>>(index) {
        return json!({ "base64": base64::engine::general_purpose::STANDARD.encode(bytes) });
    }
    if let Ok(Some(text)) = row.try_get::<_, Option<String>>(index) {
        return Value::String(text);
    }
    let name = row
        .columns()
        .get(index)
        .map(|column| column.type_().name())
        .unwrap_or("unknown");
    Value::String(format!("unsupported:{name}"))
}

fn messages_to_rows(
    messages: Vec<tokio_postgres::SimpleQueryMessage>,
    row_limit: u32,
) -> Result<SqlRows, String> {
    let mut columns = Vec::new();
    let mut rows = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;
    for message in messages {
        match message {
            tokio_postgres::SimpleQueryMessage::RowDescription(desc) => {
                columns = desc.iter().map(|column| column.name().to_string()).collect();
            }
            tokio_postgres::SimpleQueryMessage::Row(row) => {
                let mut cells = Vec::new();
                for index in 0..row.len() {
                    let cell = match row.get(index) {
                        Some(text) => Value::String(text.to_string()),
                        None => Value::Null,
                    };
                    cells.push(cell);
                }
                let size = cells.iter().map(|cell| cell.to_string().len()).sum();
                match consider_row(
                    rows.len() as u32,
                    row_limit,
                    bytes,
                    size,
                    byte_cap_for_limit(row_limit),
                ) {
                    RowTake::Keep => {
                        bytes = bytes.saturating_add(size);
                        rows.push(cells);
                    }
                    RowTake::Extra | RowTake::OverBudget => {
                        truncated = true;
                        break;
                    }
                }
            }
            tokio_postgres::SimpleQueryMessage::CommandComplete(_) => {}
            _ => {}
        }
    }
    Ok(SqlRows {
        columns,
        rows,
        truncated,
    })
}

async fn mysql_query(
    tcp_host: &str,
    tcp_port: u16,
    tls_name: &str,
    connection: &DbConnection,
    password: &str,
    job: &SqlJob,
    pattern: Option<&str>,
    watch: Option<&QueryWatch>,
) -> Result<SqlRows, String> {
    let mut builder = mysql_async::OptsBuilder::default()
        .ip_or_hostname(tcp_host)
        .tcp_port(tcp_port)
        .user(Some(connection.user.as_str()))
        .pass(Some(password))
        .db_name(Some(connection.database.as_str()));
    if connection.tls == "verify-full" {
        let ssl = mysql_async::SslOpts::default()
            .with_danger_tls_hostname_override(Some(tls_name.to_string()));
        builder = builder.ssl_opts(Some(ssl));
    }
    use mysql_async::prelude::Queryable;
    let connected = timeout(query_timeout(), mysql_async::Conn::new(builder)).await;
    let mut conn = match connected {
        Ok(result) => result.map_err(|err| err.to_string())?,
        Err(_) => return Err("query timed out".into()),
    };
    let connection_id: Option<u64> = conn.query_first("SELECT CONNECTION_ID()").await.ok().flatten();
    let work = async {
        if job.read_only {
            conn.query_drop("START TRANSACTION READ ONLY")
                .await
                .map_err(|err| format!("read-only transaction failed: {err}"))?;
            let rows = match collect_mysql(&mut conn, &job.sql, job.row_limit, pattern).await {
                Ok(rows) => rows,
                Err(err) => {
                    let _ = conn.query_drop("ROLLBACK").await;
                    return Err(err);
                }
            };
            let _ = conn.query_drop("ROLLBACK").await;
            Ok(rows)
        } else {
            collect_mysql(&mut conn, &job.sql, job.row_limit, pattern).await
        }
    };
    tokio::pin!(work);
    let outcome = tokio::select! {
        result = &mut work => result,
        _ = tokio::time::sleep(query_timeout()) => Err("query timed out".into()),
        halt = until_watch(watch) => {
            if let Some(connection_id) = connection_id {
                kill_mysql_query(tcp_host, tcp_port, tls_name, connection, password, connection_id).await;
            }
            Err(super::live::halt_error(halt))
        }
    };
    outcome
}

async fn kill_mysql_query(
    tcp_host: &str,
    tcp_port: u16,
    tls_name: &str,
    connection: &DbConnection,
    password: &str,
    connection_id: u64,
) {
    use mysql_async::prelude::Queryable;
    let mut builder = mysql_async::OptsBuilder::default()
        .ip_or_hostname(tcp_host)
        .tcp_port(tcp_port)
        .user(Some(connection.user.as_str()))
        .pass(Some(password))
        .db_name(Some(connection.database.as_str()));
    if connection.tls == "verify-full" {
        let ssl = mysql_async::SslOpts::default().with_danger_tls_hostname_override(Some(tls_name.to_string()));
        builder = builder.ssl_opts(Some(ssl));
    }
    let Ok(Ok(mut conn)) = timeout(query_timeout(), mysql_async::Conn::new(builder)).await else {
        return;
    };
    let _ = conn.query_drop(format!("KILL QUERY {connection_id}")).await;
}

async fn collect_mysql(
    conn: &mut mysql_async::Conn,
    sql: &str,
    row_limit: u32,
    pattern: Option<&str>,
) -> Result<SqlRows, String> {
    use mysql_async::prelude::Queryable;
    if let Some(pattern) = pattern {
        let slots = sql.bytes().filter(|byte| *byte == b'?').count().max(1);
        let params = vec![mysql_async::Value::from(pattern); slots];
        let result = conn
            .exec_iter(sql, params)
            .await
            .map_err(|err| err.to_string())?;
        return drain_mysql(result, row_limit).await;
    }
    let result = conn.query_iter(sql).await.map_err(|err| err.to_string())?;
    drain_mysql(result, row_limit).await
}

async fn drain_mysql<P>(
    mut result: mysql_async::QueryResult<'_, '_, P>,
    row_limit: u32,
) -> Result<SqlRows, String>
where
    P: mysql_async::prelude::Protocol,
{
    let columns: Vec<String> = result
        .columns()
        .map(|columns| {
            columns
                .iter()
                .map(|column| column.name_str().to_string())
                .collect()
        })
        .unwrap_or_default();
    let mut rows = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;
    loop {
        match result.next().await.map_err(|err| err.to_string())? {
            Some(row) => {
                let mut cells = Vec::new();
                for index in 0..columns.len() {
                    cells.push(mysql_cell(&row, index));
                }
                let size = cells.iter().map(|cell| cell.to_string().len()).sum();
                match consider_row(
                    rows.len() as u32,
                    row_limit,
                    bytes,
                    size,
                    byte_cap_for_limit(row_limit),
                ) {
                    RowTake::Keep => {
                        bytes = bytes.saturating_add(size);
                        rows.push(cells);
                    }
                    RowTake::Extra | RowTake::OverBudget => {
                        truncated = true;
                        break;
                    }
                }
            }
            None => break,
        }
    }
    drop(result);
    Ok(SqlRows {
        columns,
        rows,
        truncated,
    })
}

fn mysql_cell(row: &mysql_async::Row, index: usize) -> Value {
    let Some(value) = row.as_ref(index) else {
        return Value::String("unsupported:missing".into());
    };
    match value {
        mysql_async::Value::NULL => Value::Null,
        mysql_async::Value::Bytes(bytes) => match std::str::from_utf8(bytes) {
            Ok(text) => Value::String(text.to_string()),
            Err(_) => json!({
                "base64": base64::engine::general_purpose::STANDARD.encode(bytes)
            }),
        },
        mysql_async::Value::Int(number) => Value::String(number.to_string()),
        mysql_async::Value::UInt(number) => Value::String(number.to_string()),
        mysql_async::Value::Float(number) => Value::String(number.to_string()),
        mysql_async::Value::Double(number) => Value::String(number.to_string()),
        mysql_async::Value::Date(year, month, day, hour, minute, second, micros) => Value::String(
            format!("{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}.{micros:06}"),
        ),
        mysql_async::Value::Time(negative, days, hours, minutes, seconds, micros) => {
            let sign = if *negative { "-" } else { "" };
            Value::String(format!(
                "{sign}{days} {hours:02}:{minutes:02}:{seconds:02}.{micros:06}"
            ))
        }
    }
}

pub fn databases_sql(engine: &str) -> &'static str {
    match engine {
        "mysql" | "mariadb" => {
            "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('information_schema', 'mysql', 'performance_schema', 'sys') ORDER BY 1"
        }
        "sqlite" => "SELECT 'main'",
        "sqlserver" => "SELECT name FROM sys.databases WHERE database_id > 4 OR name = DB_NAME() ORDER BY 1",
        "oracle" => "SELECT SYS_CONTEXT('USERENV', 'SERVICE_NAME') FROM dual",
        _ => "SELECT datname FROM pg_database WHERE datistemplate = false AND datallowconn ORDER BY 1",
    }
}

/// Connectivity check before a connection is stored. Not a user query.
pub fn probe_command(engine: &str) -> &'static str {
    match engine {
        "redis" => "PING",
        "mongodb" => "listDatabases",
        _ => "SELECT 1",
    }
}

pub fn list_command(engine: &str) -> &'static str {
    match engine {
        "redis" => "INFO keyspace",
        "mongodb" => "listDatabases",
        other => databases_sql(other),
    }
}

pub fn search_command(engine: &str) -> &'static str {
    match engine {
        "redis" => "SCAN 0 COUNT 500",
        "mongodb" => "listCollections",
        other => search_sql(other),
    }
}

/// Connection parameter only. Never interpolated into SQL.
pub fn database_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 128 || name.chars().any(|ch| ch.is_control()) {
        return Err("invalid database name".into());
    }
    Ok(name)
}

pub fn search_sql(engine: &str) -> &'static str {
    match engine {
        "mysql" | "mariadb" => {
            "SELECT c.table_schema, c.table_name, c.column_name, c.data_type, t.table_type, CASE WHEN c.column_key = 'PRI' THEN 'PRI' ELSE '' END FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name WHERE c.table_schema = DATABASE() AND (c.table_name LIKE ? OR c.column_name LIKE ? OR ? = '%%') UNION ALL SELECT routine_schema, routine_name, '', routine_type, 'ROUTINE', '' FROM information_schema.routines WHERE routine_schema = DATABASE() AND (routine_name LIKE ? OR routine_schema LIKE ? OR ? = '%%') UNION ALL SELECT event_schema, event_name, '', '', 'EVENT', '' FROM information_schema.events WHERE event_schema = DATABASE() AND (event_name LIKE ? OR event_schema LIKE ? OR ? = '%%') ORDER BY 1, 2, 3"
        }
        "sqlite" => {
            "SELECT 'main', name, '', '', CASE type WHEN 'view' THEN 'VIEW' ELSE 'BASE TABLE' END FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' AND (name LIKE ? OR ? = '%%')"
        }
        "sqlserver" => {
            "SELECT c.TABLE_SCHEMA, c.TABLE_NAME, c.COLUMN_NAME, c.DATA_TYPE, CASE t.TABLE_TYPE WHEN 'VIEW' THEN 'VIEW' ELSE 'BASE TABLE' END, CASE WHEN EXISTS (SELECT 1 FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE k ON k.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA AND k.CONSTRAINT_NAME = tc.CONSTRAINT_NAME AND k.TABLE_SCHEMA = tc.TABLE_SCHEMA AND k.TABLE_NAME = tc.TABLE_NAME WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY' AND k.TABLE_SCHEMA = c.TABLE_SCHEMA AND k.TABLE_NAME = c.TABLE_NAME AND k.COLUMN_NAME = c.COLUMN_NAME) THEN 'PRI' ELSE '' END FROM INFORMATION_SCHEMA.COLUMNS c JOIN INFORMATION_SCHEMA.TABLES t ON t.TABLE_SCHEMA = c.TABLE_SCHEMA AND t.TABLE_NAME = c.TABLE_NAME WHERE c.TABLE_SCHEMA NOT IN ('INFORMATION_SCHEMA', 'sys') AND (c.TABLE_SCHEMA LIKE @P1 OR c.TABLE_NAME LIKE @P1 OR c.COLUMN_NAME LIKE @P1 OR @P1 = '%%') UNION ALL SELECT ROUTINE_SCHEMA, ROUTINE_NAME, '', ROUTINE_TYPE, 'ROUTINE', '' FROM INFORMATION_SCHEMA.ROUTINES WHERE ROUTINE_SCHEMA NOT IN ('INFORMATION_SCHEMA', 'sys') AND (ROUTINE_SCHEMA LIKE @P1 OR ROUTINE_NAME LIKE @P1 OR @P1 = '%%') ORDER BY 1, 2, 3"
        }
        "oracle" => {
            "SELECT c.owner, c.table_name, c.column_name, c.data_type, CASE o.object_type WHEN 'VIEW' THEN 'VIEW' ELSE 'BASE TABLE' END, CASE WHEN pk.column_name IS NOT NULL THEN 'PRI' ELSE '' END FROM all_tab_columns c JOIN all_objects o ON o.owner = c.owner AND o.object_name = c.table_name AND o.object_type IN ('TABLE', 'VIEW') LEFT JOIN (SELECT acc.owner, acc.table_name, acc.column_name FROM all_constraints ac JOIN all_cons_columns acc ON acc.owner = ac.owner AND acc.constraint_name = ac.constraint_name WHERE ac.constraint_type = 'P') pk ON pk.owner = c.owner AND pk.table_name = c.table_name AND pk.column_name = c.column_name WHERE c.owner NOT IN ('SYS', 'SYSTEM') AND (c.owner LIKE :1 OR c.table_name LIKE :1 OR c.column_name LIKE :1 OR :1 = '%%') ORDER BY 1, 2, 3"
        }
        _ => {
            "SELECT c.table_schema, c.table_name, c.column_name, c.data_type, t.table_type, CASE WHEN EXISTS (SELECT 1 FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage k ON k.constraint_schema = tc.constraint_schema AND k.constraint_name = tc.constraint_name AND k.table_schema = tc.table_schema AND k.table_name = tc.table_name WHERE tc.constraint_type = 'PRIMARY KEY' AND k.table_schema = c.table_schema AND k.table_name = c.table_name AND k.column_name = c.column_name) THEN 'PRI' ELSE '' END FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema') AND (c.table_schema ILIKE $1 OR c.table_name ILIKE $1 OR c.column_name ILIKE $1 OR $1 = '%%') UNION ALL SELECT routine_schema, routine_name, '', routine_type, 'ROUTINE', '' FROM information_schema.routines WHERE routine_schema NOT IN ('pg_catalog', 'information_schema') AND (routine_schema ILIKE $1 OR routine_name ILIKE $1 OR $1 = '%%') UNION ALL SELECT n.nspname, c.relname, a.attname, t.typname, 'MATERIALIZED VIEW', '' FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped JOIN pg_type t ON t.oid = a.atttypid WHERE c.relkind = 'm' AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND (n.nspname ILIKE $1 OR c.relname ILIKE $1 OR a.attname ILIKE $1 OR $1 = '%%') ORDER BY 1, 2, 3"
        }
    }
}

/// Indexes, keys, checks, rules, and triggers for one database. One read.
pub fn structure_sql(engine: &str) -> Option<&'static str> {
    match engine {
        "mysql" | "mariadb" => Some(
            "SELECT DISTINCT table_schema, table_name, index_name, '', 'INDEX' FROM information_schema.statistics WHERE table_schema = DATABASE() AND (table_name LIKE ? OR index_name LIKE ? OR ? = '%%') UNION ALL SELECT DISTINCT k.table_schema, k.table_name, k.constraint_name, '', 'FOREIGN KEY' FROM information_schema.key_column_usage k JOIN information_schema.referential_constraints r ON r.constraint_schema = k.constraint_schema AND r.constraint_name = k.constraint_name WHERE k.table_schema = DATABASE() AND (k.table_name LIKE ? OR k.constraint_name LIKE ? OR ? = '%%') UNION ALL SELECT tc.table_schema, tc.table_name, tc.constraint_name, '', 'CHECK' FROM information_schema.table_constraints tc JOIN information_schema.check_constraints cc ON cc.constraint_schema = tc.table_schema AND cc.constraint_name = tc.constraint_name WHERE tc.table_schema = DATABASE() AND tc.constraint_type = 'CHECK' AND (tc.table_name LIKE ? OR tc.constraint_name LIKE ? OR ? = '%%') UNION ALL SELECT event_object_schema, event_object_table, trigger_name, '', 'TRIGGER' FROM information_schema.triggers WHERE event_object_schema = DATABASE() AND (event_object_table LIKE ? OR trigger_name LIKE ? OR ? = '%%') ORDER BY 1, 2, 5, 3",
        ),
        "postgres" => Some(
            "SELECT n.nspname, rel.relname, ic.relname, '', 'INDEX' FROM pg_index i JOIN pg_class rel ON rel.oid = i.indrelid JOIN pg_class ic ON ic.oid = i.indexrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE NOT i.indisprimary AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND (n.nspname ILIKE $1 OR rel.relname ILIKE $1 OR ic.relname ILIKE $1 OR $1 = '%%') UNION ALL SELECT n.nspname, rel.relname, con.conname, '', CASE con.contype WHEN 'f' THEN 'FOREIGN KEY' WHEN 'u' THEN 'UNIQUE' WHEN 'c' THEN 'CHECK' ELSE 'EXCLUSION' END FROM pg_constraint con JOIN pg_class rel ON rel.oid = con.conrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE con.contype IN ('f', 'u', 'c', 'x') AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND (n.nspname ILIKE $1 OR rel.relname ILIKE $1 OR con.conname ILIKE $1 OR $1 = '%%') UNION ALL SELECT n.nspname, rel.relname, r.rulename, '', 'RULE' FROM pg_rewrite r JOIN pg_class rel ON rel.oid = r.ev_class JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE r.rulename <> '_RETURN' AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND (n.nspname ILIKE $1 OR rel.relname ILIKE $1 OR r.rulename ILIKE $1 OR $1 = '%%') UNION ALL SELECT n.nspname, rel.relname, t.tgname, '', 'TRIGGER' FROM pg_trigger t JOIN pg_class rel ON rel.oid = t.tgrelid JOIN pg_namespace n ON n.oid = rel.relnamespace WHERE NOT t.tgisinternal AND n.nspname NOT IN ('pg_catalog', 'information_schema') AND (n.nspname ILIKE $1 OR rel.relname ILIKE $1 OR t.tgname ILIKE $1 OR $1 = '%%') ORDER BY 1, 2, 5, 3",
        ),
        _ => None,
    }
}

pub fn status_sql(engine: &str, page: &str) -> Result<&'static str, String> {
    match (engine, page) {
        ("postgres", "sessions") => Ok(
            "SELECT pid, usename, state, wait_event_type, wait_event, left(query, 200) AS query FROM pg_stat_activity WHERE datname = current_database()",
        ),
        ("postgres", "locks") => Ok("SELECT locktype, mode, granted, pid FROM pg_locks"),
        ("postgres", "sizes") => Ok(
            "SELECT datname, pg_database_size(datname) AS bytes FROM pg_database WHERE datistemplate = false",
        ),
        ("mysql" | "mariadb", "sessions") => Ok(
            "SELECT id, user, command, state, left(info, 200) AS info FROM information_schema.processlist",
        ),
        ("mysql" | "mariadb", "locks") => Ok(
            "SELECT object_schema, object_name, lock_type, lock_status FROM performance_schema.data_locks",
        ),
        ("mysql" | "mariadb", "sizes") => Ok(
            "SELECT table_schema, SUM(data_length + index_length) AS bytes FROM information_schema.tables GROUP BY table_schema",
        ),
        _ => Err("unknown status page".into()),
    }
}

pub fn explain_sql(sql: &str) -> String {
    format!("EXPLAIN {sql}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn format_error_includes_source_chain_not_just_db_error_label() {
        #[derive(Debug)]
        struct Inner;
        #[derive(Debug)]
        struct Outer {
            inner: Inner,
        }
        impl std::fmt::Display for Outer {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("db error")
            }
        }
        impl std::fmt::Display for Inner {
            fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                f.write_str("FATAL: password authentication failed")
            }
        }
        impl std::error::Error for Inner {}
        impl std::error::Error for Outer {
            fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
                Some(&self.inner)
            }
        }
        let message = format_error(&Outer { inner: Inner });
        assert!(message.contains("db error"));
        assert!(message.contains("password authentication failed"));
        assert_ne!(message, "db error");
    }

    #[test]
    fn database_list_sql_skips_templates_and_system_schemas() {
        let postgres = databases_sql("postgres");
        let mysql = databases_sql("mysql");
        assert!(postgres.contains("datistemplate = false"));
        assert!(postgres.contains("datallowconn"));
        assert!(!postgres.contains('$'));
        assert!(mysql.contains("'information_schema'"));
        assert!(mysql.contains("'performance_schema'"));
        assert!(mysql.contains("'mysql'"));
        assert!(mysql.contains("'sys'"));
        assert!(!mysql.contains('?'));
        assert_eq!(crate::db::statement_count(postgres, "postgres"), Some(1));
        assert_eq!(crate::db::classify_sql(postgres, "postgres"), "read");
        assert_eq!(crate::db::statement_count(mysql, "mysql"), Some(1));
        assert_eq!(crate::db::classify_sql(mysql, "mysql"), "read");
        assert_eq!(database_name(" twreview ").unwrap(), "twreview");
        assert!(database_name("").is_err());
        assert!(database_name("bad\nname").is_err());
    }

    #[test]
    fn command_engines_probe_with_their_own_read() {
        let redis = probe_command("redis");
        let mongo = probe_command("mongodb");
        assert_eq!(redis, "PING");
        assert_eq!(mongo, "listDatabases");
        assert!(!redis.contains("SELECT"));
        assert!(!mongo.contains("SELECT"));
        assert_eq!(crate::db::classify_command("redis", redis), Some("read"));
        assert_eq!(crate::db::classify_command("mongodb", mongo), Some("read"));
        assert_eq!(probe_command("postgres"), "SELECT 1");
        assert_eq!(probe_command("sqlite"), "SELECT 1");
    }

    #[test]
    fn postgres_catalog_includes_materialized_views_as_one_read() {
        let sql = search_sql("postgres");
        assert!(sql.contains("'MATERIALIZED VIEW'"));
        assert!(sql.contains("relkind = 'm'"));
        assert_eq!(crate::db::statement_count(sql, "postgres"), Some(1));
        assert_eq!(crate::db::classify_sql(sql, "postgres"), "read");
        let sqlserver = search_sql("sqlserver");
        assert!(sqlserver.contains("INFORMATION_SCHEMA.COLUMNS"));
        assert!(sqlserver.contains("@P1"));
        assert_eq!(crate::db::statement_count(sqlserver, "sqlserver"), Some(1));
        assert_eq!(crate::db::classify_sql(sqlserver, "sqlserver"), "read");
        let oracle = search_sql("oracle");
        assert!(oracle.contains("all_tab_columns"));
        assert!(oracle.contains(":1"));
        assert_eq!(crate::db::statement_count(oracle, "oracle"), Some(1));
        assert_eq!(crate::db::classify_sql(oracle, "oracle"), "read");
        let sqlserver_list = databases_sql("sqlserver");
        let oracle_list = databases_sql("oracle");
        assert_eq!(crate::db::statement_count(sqlserver_list, "sqlserver"), Some(1));
        assert_eq!(crate::db::classify_sql(sqlserver_list, "sqlserver"), "read");
        assert_eq!(crate::db::statement_count(oracle_list, "oracle"), Some(1));
        assert_eq!(crate::db::classify_sql(oracle_list, "oracle"), "read");
        let mariadb = search_sql("mariadb");
        assert!(mariadb.contains("'EVENT'"));
        assert!(mariadb.contains("information_schema.events"));
        assert_eq!(crate::db::statement_count(mariadb, "mariadb"), Some(1));
        assert_eq!(crate::db::classify_sql(mariadb, "mariadb"), "read");
        assert_eq!(crate::db::classify_command("redis", "INFO keyspace"), Some("read"));
        assert_eq!(crate::db::classify_command("mongodb", "listCollections"), Some("read"));
        assert!(sql.contains("'PRI'"));
        assert!(sql.contains("PRIMARY KEY"));
        assert!(search_sql("mysql").contains("column_key"));
        let structure = structure_sql("postgres").unwrap();
        assert!(structure.contains("'EXCLUSION'"));
        assert!(structure.contains("'RULE'"));
        assert!(structure.contains("'UNIQUE'"));
        assert_eq!(crate::db::statement_count(structure, "postgres"), Some(1));
        assert_eq!(crate::db::classify_sql(structure, "postgres"), "read");
        let maria = structure_sql("mariadb").unwrap();
        assert!(maria.contains("information_schema.statistics"));
        assert!(maria.contains("check_constraints"));
        assert!(maria.contains("'TRIGGER'"));
        assert!(!maria.contains("EXCLUSION"));
        assert!(!maria.contains("'RULE'"));
        assert!(!maria.contains("'UNIQUE'"));
        assert_eq!(crate::db::statement_count(maria, "mariadb"), Some(1));
        assert_eq!(crate::db::classify_sql(maria, "mariadb"), "read");
        assert!(structure_sql("sqlite").is_none());
        assert!(structure_sql("redis").is_none());
    }

    #[test]
    fn ssl_mode_require_or_disable() {
        assert_eq!(
            postgres_ssl_mode("verify-full"),
            tokio_postgres::config::SslMode::Require
        );
        assert_eq!(
            postgres_ssl_mode("disabled"),
            tokio_postgres::config::SslMode::Disable
        );
    }

    #[test]
    fn catalog_queries_use_a_larger_byte_budget() {
        assert_eq!(byte_cap_for_limit(500), BYTE_CAP);
        assert_eq!(byte_cap_for_limit(50_000), CATALOG_BYTE_CAP);
        assert!(CATALOG_BYTE_CAP > BYTE_CAP);
    }

    #[test]
    fn exact_limit_is_not_truncated_until_another_row_exists() {
        assert_eq!(consider_row(499, 500, 0, 1, 100), RowTake::Keep);
        assert_eq!(consider_row(500, 500, 0, 1, 100), RowTake::Extra);
    }

    #[test]
    fn one_oversized_value_is_not_accepted() {
        assert_eq!(consider_row(0, 500, 0, BYTE_CAP + 1, BYTE_CAP), RowTake::OverBudget);
    }

    #[test]
    fn numeric_keeps_scale_and_large_integers() {
        let one_and_half = [
            0, 2, // ndigits
            0, 0, // weight
            0, 0, // sign
            0, 1, // dscale
            0, 1, // 1
            0x13, 0x88, // 5000
        ];
        assert_eq!(decode_pg_numeric(&one_and_half).unwrap(), "1.5");
        let huge = [
            0, 1, // ndigits
            0, 4, // weight
            0, 0, 0, 0, // sign, dscale
            0, 1,
        ];
        assert_eq!(decode_pg_numeric(&huge).unwrap(), "10000000000000000");
    }

    #[test]
    fn mysql_binary_is_not_lossy_text_and_integers_keep_digits() {
        let binary = mysql_cell_value(&mysql_async::Value::Bytes(vec![0, 255, 1]));
        let text = binary.to_string();
        assert!(!text.contains('\u{FFFD}'));
        assert!(text.contains("base64"));
        assert_eq!(
            mysql_cell_value(&mysql_async::Value::Int(i64::MAX)),
            Value::String(i64::MAX.to_string())
        );
        assert_eq!(mysql_cell_value(&mysql_async::Value::NULL), Value::Null);
    }

    fn mysql_cell_value(value: &mysql_async::Value) -> Value {
        match value {
            mysql_async::Value::NULL => Value::Null,
            mysql_async::Value::Bytes(bytes) => match std::str::from_utf8(bytes) {
                Ok(text) => Value::String(text.to_string()),
                Err(_) => json!({
                    "base64": base64::engine::general_purpose::STANDARD.encode(bytes)
                }),
            },
            mysql_async::Value::Int(number) => Value::String(number.to_string()),
            mysql_async::Value::UInt(number) => Value::String(number.to_string()),
            mysql_async::Value::Float(number) => Value::String(number.to_string()),
            mysql_async::Value::Double(number) => Value::String(number.to_string()),
            mysql_async::Value::Date(year, month, day, hour, minute, second, micros) => {
                Value::String(format!(
                    "{year:04}-{month:02}-{day:02} {hour:02}:{minute:02}:{second:02}.{micros:06}"
                ))
            }
            mysql_async::Value::Time(negative, days, hours, minutes, seconds, micros) => {
                let sign = if *negative { "-" } else { "" };
                Value::String(format!(
                    "{sign}{days} {hours:02}:{minutes:02}:{seconds:02}.{micros:06}"
                ))
            }
        }
    }

    #[tokio::test]
    async fn verify_full_rejects_a_server_that_refuses_tls() {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let port = listener.local_addr().unwrap().port();
        let serve = tokio::spawn(async move {
            let Ok((mut socket, _)) = listener.accept().await else {
                return;
            };
            let mut buf = [0u8; 8];
            let _ = socket.read_exact(&mut buf).await;
            let _ = socket.write_all(b"N").await;
            tokio::time::sleep(Duration::from_millis(300)).await;
        });
        let connection = DbConnection {
            id: "db-1".into(),
            name: "app".into(),
            engine: "postgres".into(),
            host: "db.example".into(),
            port,
            database: "app".into(),
            user: "app".into(),
            auth_database: String::new(),
            tls: "verify-full".into(),
            ssh_session_id: None,
            revision: 1,
            secret_id: "secret-db-1".into(),
        };
        let job = SqlJob {
            sql: "SELECT 1".into(),
            read_only: true,
            row_limit: 10,
        };
        let err = postgres_query(
            "127.0.0.1",
            port,
            "db.example",
            &connection,
            "secret",
            &job,
            None,
            None,
        )
        .await
        .unwrap_err();
        let lower = err.to_lowercase();
        assert!(
            lower.contains("tls") || lower.contains("ssl"),
            "verify-full fell through: {err}"
        );
        serve.abort();
    }

    fn live_connection(engine: &str, tls: &str) -> Option<(DbConnection, String)> {
        let host = std::env::var(if engine == "mysql" { "TW_DB_MY_HOST" } else { "TW_DB_PG_HOST" }).ok()?;
        let port = std::env::var(if engine == "mysql" { "TW_DB_MY_PORT" } else { "TW_DB_PG_PORT" })
            .ok()
            .and_then(|value| value.parse().ok())?;
        let user = std::env::var("TW_DB_USER").ok()?;
        let database = std::env::var("TW_DB_NAME").ok()?;
        let password = std::env::var("TW_DB_PASSWORD").ok()?;
        Some((
            DbConnection {
                id: format!("live-{engine}"),
                name: "live".into(),
                engine: engine.into(),
                host,
                port,
                database,
                user,
                auth_database: String::new(),
                tls: tls.into(),
                ssh_session_id: None,
                revision: 1,
                secret_id: "live".into(),
            },
            password,
        ))
    }

    fn hide(err: &str, password: &str) -> String {
        err.replace(password, "***")
    }

    #[tokio::test]
    #[ignore = "needs TW_DB_PG_* and TW_DB_MY_*"]
    async fn live_postgres_and_mysql_match_the_security_contract() {
        let Some((plain, password)) = live_connection("postgres", "disabled") else {
            panic!("live database env is missing");
        };
        let (strict, _) = live_connection("postgres", "verify-full").unwrap();
        std::env::set_var("TW_DB_QUERY_TIMEOUT_SECS", "2");

        let refused = postgres_query(
            &strict.host,
            strict.port,
            &strict.host,
            &strict,
            &password,
            &SqlJob { sql: "SELECT 1".into(), read_only: true, row_limit: 10 },
            None,
            None,
        )
        .await
        .unwrap_err();
        let refused = hide(&refused, &password);
        assert!(
            refused.to_lowercase().contains("tls") || refused.to_lowercase().contains("ssl"),
            "{refused}"
        );

        let selected = postgres_query(
            &plain.host,
            plain.port,
            &plain.host,
            &plain,
            &password,
            &SqlJob { sql: "SELECT 1".into(), read_only: true, row_limit: 10 },
            None,
            None,
        )
        .await
        .unwrap_or_else(|err| panic!("{}", hide(&err, &password)));
        assert_eq!(selected.rows.len(), 1);

        let explained = postgres_query(
            &plain.host,
            plain.port,
            &plain.host,
            &plain,
            &password,
            &SqlJob { sql: "EXPLAIN SELECT 1".into(), read_only: true, row_limit: 10 },
            None,
            None,
        )
        .await
        .unwrap_or_else(|err| panic!("{}", hide(&err, &password)));
        assert!(!explained.rows.is_empty(), "EXPLAIN returned no rows");

        let exact = postgres_query(
            &plain.host,
            plain.port,
            &plain.host,
            &plain,
            &password,
            &SqlJob {
                sql: "SELECT generate_series(1, 500)".into(),
                read_only: true,
                row_limit: 500,
            },
            None,
            None,
        )
        .await
        .unwrap_or_else(|err| panic!("{}", hide(&err, &password)));
        assert_eq!(exact.rows.len(), 500);
        assert!(!exact.truncated);

        let extra = postgres_query(
            &plain.host,
            plain.port,
            &plain.host,
            &plain,
            &password,
            &SqlJob {
                sql: "SELECT generate_series(1, 501)".into(),
                read_only: true,
                row_limit: 500,
            },
            None,
            None,
        )
        .await
        .unwrap_or_else(|err| panic!("{}", hide(&err, &password)));
        assert_eq!(extra.rows.len(), 500);
        assert!(extra.truncated);

        let big = postgres_query(
            &plain.host,
            plain.port,
            &plain.host,
            &plain,
            &password,
            &SqlJob {
                sql: "SELECT 9223372036854775807::bigint AS n".into(),
                read_only: true,
                row_limit: 10,
            },
            None,
            None,
        )
        .await
        .unwrap_or_else(|err| panic!("{}", hide(&err, &password)));
        assert_eq!(big.rows[0][0], Value::String("9223372036854775807".into()));

        let binary = postgres_query(
            &plain.host,
            plain.port,
            &plain.host,
            &plain,
            &password,
            &SqlJob {
                sql: "SELECT decode('00ff','hex') AS b".into(),
                read_only: true,
                row_limit: 10,
            },
            None,
            None,
        )
        .await
        .unwrap_or_else(|err| panic!("{}", hide(&err, &password)));
        let rendered = binary.rows[0][0].to_string();
        assert!(!rendered.contains('\u{FFFD}'));
        assert!(rendered.contains("base64"));

        let slept = postgres_query(
            &plain.host,
            plain.port,
            &plain.host,
            &plain,
            &password,
            &SqlJob { sql: "SELECT pg_sleep(30)".into(), read_only: true, row_limit: 10 },
            None,
            None,
        )
        .await
        .unwrap_err();
        assert!(hide(&slept, &password).contains("timed out"));
        tokio::time::sleep(Duration::from_millis(500)).await;
        let activity = postgres_query(
            &plain.host,
            plain.port,
            &plain.host,
            &plain,
            &password,
            &SqlJob {
                sql: "SELECT count(*) FROM pg_stat_activity WHERE state = 'active' AND query LIKE 'SELECT pg_sleep(30)%'".into(),
                read_only: true,
                row_limit: 10,
            },
            None,
            None,
        )
        .await
        .unwrap_or_else(|err| panic!("{}", hide(&err, &password)));
        assert_eq!(activity.rows[0][0], Value::String("0".into()));

        let Some((mysql, mysql_password)) = live_connection("mysql", "disabled") else {
            panic!("live mysql env is missing");
        };
        let mysql_rows = mysql_query(
            &mysql.host,
            mysql.port,
            &mysql.host,
            &mysql,
            &mysql_password,
            &SqlJob { sql: "SELECT 9223372036854775807 AS n".into(), read_only: true, row_limit: 10 },
            None,
            None,
        )
        .await
        .unwrap_or_else(|err| panic!("{}", hide(&err, &mysql_password)));
        assert_eq!(mysql_rows.rows[0][0], Value::String("9223372036854775807".into()));
    }
}
