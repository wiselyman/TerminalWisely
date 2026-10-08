//! File and command engines. SQL text is already authorized before these run.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use base64::Engine;
use serde_json::{json, Value};

use super::catalog::DbConnection;
use super::driver::{consider_row, query_timeout, until_watch, RowTake, BYTE_CAP};
use super::gate::{SqlJob, SqlRows};
use super::live::QueryWatch;

fn push_row(rows: &mut Vec<Vec<Value>>, truncated: &mut bool, bytes: &mut usize, limit: u32, cells: Vec<Value>) {
    let size = cells.iter().map(|cell| cell.to_string().len()).sum();
    match consider_row(rows.len() as u32, limit, *bytes, size, BYTE_CAP) {
        RowTake::Keep => {
            *bytes = bytes.saturating_add(size);
            rows.push(cells);
        }
        RowTake::Extra | RowTake::OverBudget => *truncated = true,
    }
}

pub async fn sqlite_query(
    connection: &DbConnection,
    job: &SqlJob,
    pattern: Option<&str>,
    watch: Option<&QueryWatch>,
) -> Result<SqlRows, String> {
    let path = connection.database.clone();
    let sql = job.sql.clone();
    let read_only = job.read_only;
    let row_limit = job.row_limit;
    let pattern = pattern.map(str::to_string);
    let stop = Arc::new(AtomicBool::new(false));
    let flagged = stop.clone();
    let mut halt_rx = watch.map(QueryWatch::receiver);
    let watcher = tokio::spawn(async move {
        let halt = match halt_rx.as_mut() {
            Some(rx) => loop {
                let current = *rx.borrow();
                if current != super::live::Halt::None {
                    break current;
                }
                if rx.changed().await.is_err() {
                    break super::live::Halt::SessionClosed;
                }
            },
            None => std::future::pending::<super::live::Halt>().await,
        };
        if halt != super::live::Halt::None {
            flagged.store(true, Ordering::SeqCst);
        }
    });
    let result = tokio::task::spawn_blocking(move || sqlite_blocking(&path, &sql, read_only, row_limit, pattern.as_deref(), stop))
        .await
        .map_err(|err| err.to_string())?;
    watcher.abort();
    result
}

fn sqlite_blocking(
    path: &str,
    sql: &str,
    read_only: bool,
    row_limit: u32,
    pattern: Option<&str>,
    stop: Arc<AtomicBool>,
) -> Result<SqlRows, String> {
    let flags = if read_only {
        rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY | rusqlite::OpenFlags::SQLITE_OPEN_URI
    } else {
        rusqlite::OpenFlags::SQLITE_OPEN_READ_WRITE
            | rusqlite::OpenFlags::SQLITE_OPEN_CREATE
            | rusqlite::OpenFlags::SQLITE_OPEN_URI
    };
    let conn = rusqlite::Connection::open_with_flags(path, flags).map_err(|err| err.to_string())?;
    let flag = Arc::clone(&stop);
    conn.progress_handler(1, Some(move || flag.load(Ordering::SeqCst)))
        .map_err(|err| err.to_string())?;
    let mut rows = sqlite_stopped(sqlite_collect(&conn, sql, row_limit, pattern), &stop)?;
    if pattern.is_some() {
        rows = sqlite_stopped(sqlite_columns(&conn, rows), &stop)?;
    }
    Ok(rows)
}

fn sqlite_stopped(outcome: Result<SqlRows, String>, stop: &AtomicBool) -> Result<SqlRows, String> {
    match outcome {
        Err(err) if stop.load(Ordering::SeqCst) || err.to_ascii_lowercase().contains("interrupt") => {
            Err("query cancelled".into())
        }
        other => other,
    }
}

fn sqlite_collect(conn: &rusqlite::Connection, sql: &str, row_limit: u32, pattern: Option<&str>) -> Result<SqlRows, String> {
    let head = sql
        .trim_start()
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_matches('(')
        .to_ascii_uppercase();
    if !matches!(head.as_str(), "SELECT" | "WITH" | "VALUES" | "PRAGMA" | "EXPLAIN") {
        conn.execute_batch(sql).map_err(|err| err.to_string())?;
        return Ok(SqlRows {
            columns: Vec::new(),
            rows: Vec::new(),
            truncated: false,
        });
    }
    let mut statement = conn.prepare(sql).map_err(|err| err.to_string())?;
    let columns: Vec<String> = statement
        .column_names()
        .into_iter()
        .map(str::to_string)
        .collect();
    let mut rows = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;
    let mut query = match pattern {
        Some(pattern) => {
            let slots = sql.bytes().filter(|byte| *byte == b'?').count();
            let params = vec![pattern; slots];
            statement
                .query(rusqlite::params_from_iter(params))
                .map_err(|err| err.to_string())?
        }
        None => statement.query([]).map_err(|err| err.to_string())?,
    };
    while let Some(row) = query.next().map_err(|err| err.to_string())? {
        if truncated {
            break;
        }
        let cells: Vec<Value> = (0..columns.len()).map(|index| sqlite_cell(row, index)).collect();
        push_row(&mut rows, &mut truncated, &mut bytes, row_limit, cells);
    }
    Ok(SqlRows {
        columns,
        rows,
        truncated,
    })
}

fn sqlite_cell(row: &rusqlite::Row<'_>, index: usize) -> Value {
    match row.get_ref(index) {
        Ok(rusqlite::types::ValueRef::Null) => Value::Null,
        Ok(rusqlite::types::ValueRef::Integer(number)) => Value::String(number.to_string()),
        Ok(rusqlite::types::ValueRef::Real(number)) => Value::String(number.to_string()),
        Ok(rusqlite::types::ValueRef::Text(bytes)) => String::from_utf8_lossy(bytes).to_string().into(),
        Ok(rusqlite::types::ValueRef::Blob(bytes)) => json!({
            "base64": base64::engine::general_purpose::STANDARD.encode(bytes)
        }),
        Err(_) => Value::Null,
    }
}

fn sqlite_columns(conn: &rusqlite::Connection, listed: SqlRows) -> Result<SqlRows, String> {
    let mut rows = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = listed.truncated;
    for item in listed.rows {
        if truncated {
            break;
        }
        let schema = item.first().cloned().unwrap_or(Value::String("main".into()));
        let name = item.get(1).and_then(|cell| cell.as_str()).unwrap_or("").to_string();
        let kind = item.get(4).cloned().unwrap_or(Value::String("BASE TABLE".into()));
        let mut statement = conn
            .prepare("SELECT name, type, pk FROM pragma_table_info(?)")
            .map_err(|err| err.to_string())?;
        let mut query = statement.query([name.as_str()]).map_err(|err| err.to_string())?;
        let mut any = false;
        while let Some(row) = query.next().map_err(|err| err.to_string())? {
            any = true;
            if truncated {
                break;
            }
            let column = sqlite_cell(row, 0);
            let data_type = sqlite_cell(row, 1);
            let pk = sqlite_cell(row, 2);
            let marker = Value::String(if pk.as_str().is_some_and(|value| value != "0" && !value.is_empty()) {
                "PRI".into()
            } else {
                String::new()
            });
            push_row(
                &mut rows,
                &mut truncated,
                &mut bytes,
                500,
                vec![
                    schema.clone(),
                    Value::String(name.clone()),
                    column,
                    data_type,
                    kind.clone(),
                    marker,
                ],
            );
        }
        if !any && !truncated {
            push_row(
                &mut rows,
                &mut truncated,
                &mut bytes,
                500,
                vec![
                    schema,
                    Value::String(name),
                    Value::String(String::new()),
                    Value::String(String::new()),
                    kind,
                    Value::String(String::new()),
                ],
            );
        }
    }
    Ok(SqlRows {
        columns: vec![
            "schema".into(),
            "name".into(),
            "column".into(),
            "data_type".into(),
            "table_type".into(),
            "column_key".into(),
        ],
        rows,
        truncated,
    })
}

pub async fn redis_query(
    host: &str,
    port: u16,
    connection: &DbConnection,
    password: &str,
    job: &SqlJob,
    pattern: Option<&str>,
    watch: Option<&QueryWatch>,
) -> Result<SqlRows, String> {
    let mut info = redis::RedisConnectionInfo::default();
    info.db = connection.database.parse().unwrap_or(0);
    if !password.is_empty() {
        info.password = Some(password.to_string());
    }
    if !connection.user.is_empty() && connection.user != "default" {
        info.username = Some(connection.user.clone());
    }
    let client = redis::Client::open(redis::ConnectionInfo {
        addr: redis::ConnectionAddr::Tcp(host.to_string(), port),
        redis: info,
    })
    .map_err(|err| err.to_string())?;
    let mut conn = client
        .get_multiplexed_async_connection()
        .await
        .map_err(|err| err.to_string())?;
    let client_id: Option<i64> = redis::cmd("CLIENT").arg("ID").query_async(&mut conn).await.ok();
    let work = redis_command(&mut conn, &job.sql, job.row_limit, pattern, &connection.database);
    tokio::pin!(work);
    tokio::select! {
        result = &mut work => result,
        _ = tokio::time::sleep(query_timeout()) => Err("query timed out".into()),
        halt = until_watch(watch) => {
            if let Some(client_id) = client_id {
                if let Ok(mut killer) = client.get_multiplexed_async_connection().await {
                    let _: Result<redis::Value, _> = redis::cmd("CLIENT")
                        .arg("KILL")
                        .arg("ID")
                        .arg(client_id)
                        .query_async(&mut killer)
                        .await;
                }
            }
            Err(super::live::halt_error(halt))
        }
    }
}

async fn redis_command(
    conn: &mut impl redis::aio::ConnectionLike,
    text: &str,
    row_limit: u32,
    pattern: Option<&str>,
    database: &str,
) -> Result<SqlRows, String> {
    let args = redis_args(text);
    let verb = args.first().map(|item| item.to_ascii_uppercase()).unwrap_or_default();
    if !redis_verb_allowed(&verb) {
        return Err("command is not available".into());
    }
    if verb == "SCAN" {
        return redis_scan(conn, row_limit, pattern, database).await;
    }
    let mut cmd = redis::cmd(args.first().map(String::as_str).unwrap_or("PING"));
    for arg in args.iter().skip(1) {
        cmd.arg(arg);
    }
    let value: redis::Value = cmd.query_async(conn).await.map_err(|err| err.to_string())?;
    if verb == "INFO" {
        let text = redis_text(&value);
        return Ok(redis_keyspace_rows(&text, database));
    }
    Ok(redis_value_rows(value, row_limit))
}

fn redis_verb_allowed(verb: &str) -> bool {
    super::command_risk::classify_command("redis", verb).is_some_and(|class| class != "unparsed")
}

fn redis_args(text: &str) -> Vec<String> {
    let mut args = Vec::new();
    let mut current = String::new();
    let mut quoted = false;
    for ch in text.chars() {
        if ch == '"' {
            quoted = !quoted;
            continue;
        }
        if ch.is_whitespace() && !quoted {
            if !current.is_empty() {
                args.push(std::mem::take(&mut current));
            }
            continue;
        }
        current.push(ch);
    }
    if !current.is_empty() {
        args.push(current);
    }
    args
}

async fn redis_scan(
    conn: &mut impl redis::aio::ConnectionLike,
    row_limit: u32,
    pattern: Option<&str>,
    database: &str,
) -> Result<SqlRows, String> {
    let mut cursor = "0".to_string();
    let mut rows = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;
    let glob = pattern.map(|item| item.replace('%', "*")).filter(|item| item != "*" && item != "**");
    loop {
        let mut cmd = redis::cmd("SCAN");
        cmd.arg(&cursor).arg("COUNT").arg(row_limit);
        if let Some(glob) = &glob {
            cmd.arg("MATCH").arg(glob);
        }
        let value: redis::Value = cmd.query_async(conn).await.map_err(|err| err.to_string())?;
        let redis::Value::Array(parts) = value else {
            return Err("scan failed".into());
        };
        cursor = parts.first().map(redis_text).unwrap_or_else(|| "0".into());
        if let Some(redis::Value::Array(keys)) = parts.get(1) {
            for key in keys {
                if truncated {
                    break;
                }
                let name = redis_text(key);
                let kind = redis_type(conn, &name).await.unwrap_or_else(|_| "string".into());
                push_row(
                    &mut rows,
                    &mut truncated,
                    &mut bytes,
                    row_limit,
                    vec![
                        Value::String(database.to_string()),
                        Value::String(name),
                        Value::String(String::new()),
                        Value::String(kind),
                        Value::String("KEY".into()),
                    ],
                );
            }
        }
        if truncated || cursor == "0" {
            break;
        }
    }
    Ok(SqlRows {
        columns: vec!["db".into(), "name".into(), "column".into(), "type".into(), "table_type".into()],
        rows,
        truncated,
    })
}

async fn redis_type(conn: &mut impl redis::aio::ConnectionLike, key: &str) -> Result<String, String> {
    let mut cmd = redis::cmd("TYPE");
    cmd.arg(key);
    let value: redis::Value = cmd.query_async(conn).await.map_err(|err| err.to_string())?;
    Ok(redis_text(&value))
}

fn redis_keyspace_rows(text: &str, selected: &str) -> SqlRows {
    let mut stats = std::collections::BTreeMap::<u16, (i64, i64, i64)>::new();
    for index in 0..=15 {
        stats.insert(index, (0, 0, 0));
    }
    if let Ok(index) = selected.parse::<u16>() {
        stats.entry(index).or_insert((0, 0, 0));
    }
    for line in text.lines() {
        let Some(rest) = line.trim().strip_prefix("db") else {
            continue;
        };
        let Some((index, body)) = rest.split_once(':') else {
            continue;
        };
        let Ok(index) = index.parse::<u16>() else {
            continue;
        };
        let mut keys = 0i64;
        let mut expires = 0i64;
        let mut avg_ttl = 0i64;
        for part in body.split(',') {
            let Some((name, value)) = part.split_once('=') else {
                continue;
            };
            let number = value.parse::<i64>().unwrap_or(0);
            match name {
                "keys" => keys = number,
                "expires" => expires = number,
                "avg_ttl" => avg_ttl = number,
                _ => {}
            }
        }
        stats.insert(index, (keys, expires, avg_ttl));
    }
    SqlRows {
        columns: vec!["name".into(), "keys".into(), "expires".into(), "avg_ttl".into()],
        rows: stats
            .into_iter()
            .map(|(index, (keys, expires, avg_ttl))| {
                vec![
                    Value::String(index.to_string()),
                    Value::String(keys.to_string()),
                    Value::String(expires.to_string()),
                    Value::String(avg_ttl.to_string()),
                ]
            })
            .collect(),
        truncated: false,
    }
}

fn redis_value_rows(value: redis::Value, row_limit: u32) -> SqlRows {
    let mut rows = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;
    match value {
        redis::Value::Array(items) | redis::Value::Set(items) => {
            for item in items {
                if truncated {
                    break;
                }
                push_row(&mut rows, &mut truncated, &mut bytes, row_limit, vec![Value::String(redis_text(&item))]);
            }
        }
        other => push_row(&mut rows, &mut truncated, &mut bytes, row_limit, vec![Value::String(redis_text(&other))]),
    }
    SqlRows {
        columns: vec!["value".into()],
        rows,
        truncated,
    }
}

fn redis_text(value: &redis::Value) -> String {
    match value {
        redis::Value::Nil => String::new(),
        redis::Value::Int(number) => number.to_string(),
        redis::Value::BulkString(bytes) => String::from_utf8_lossy(bytes).to_string(),
        redis::Value::SimpleString(text) => text.clone(),
        redis::Value::Okay => "OK".into(),
        redis::Value::Array(items) | redis::Value::Set(items) => items.iter().map(redis_text).collect::<Vec<_>>().join(" "),
        redis::Value::Map(items) => items
            .iter()
            .map(|(key, value)| format!("{}={}", redis_text(key), redis_text(value)))
            .collect::<Vec<_>>()
            .join(" "),
        redis::Value::Double(number) => number.to_string(),
        redis::Value::Boolean(flag) => flag.to_string(),
        redis::Value::ServerError(err) => format!("{err:?}"),
        _ => String::new(),
    }
}

pub async fn mongodb_query(
    host: &str,
    port: u16,
    connection: &DbConnection,
    password: &str,
    job: &SqlJob,
    watch: Option<&QueryWatch>,
) -> Result<SqlRows, String> {
    let mut options = mongodb::options::ClientOptions::parse(format!("mongodb://{host}:{port}"))
        .await
        .map_err(|err| err.to_string())?;
    options.credential = Some(
        mongodb::options::Credential::builder()
            .username(connection.user.clone())
            .password(password.to_string())
            .source(if connection.auth_database.trim().is_empty() {
                "admin".to_string()
            } else {
                connection.auth_database.clone()
            })
            .build(),
    );
    options.default_database = Some(connection.database.clone());
    options.connect_timeout = Some(query_timeout());
    options.server_selection_timeout = Some(query_timeout());
    let client = mongodb::Client::with_options(options).map_err(|err| err.to_string())?;
    let database_name = connection.database.clone();
    let sql = job.sql.clone();
    let row_limit = job.row_limit;
    let running = client.clone();
    let work = mongo_command(&running, &database_name, &sql, row_limit);
    tokio::pin!(work);
    tokio::select! {
        result = &mut work => result,
        _ = tokio::time::sleep(query_timeout()) => Err("query timed out".into()),
        halt = until_watch(watch) => {
            client.shutdown().await;
            Err(super::live::halt_error(halt))
        }
    }
}

async fn mongo_command(
    client: &mongodb::Client,
    database_name: &str,
    text: &str,
    row_limit: u32,
) -> Result<SqlRows, String> {
    let call = mongo_call(text)?;
    let class = super::command_risk::classify_command("mongodb", text).unwrap_or("unparsed");
    if class == "unparsed" {
        return Err("command is not available".into());
    }
    match call.method.as_str() {
        "listdatabases" => {
            let names = client.list_database_names().await.map_err(|err| err.to_string())?;
            Ok(name_rows(names))
        }
        "listcollections" => {
            let names = client
                .database(database_name)
                .list_collection_names()
                .await
                .map_err(|err| err.to_string())?;
            Ok(collection_rows(database_name, names))
        }
        "find" => {
            let collection = call.collection.ok_or("collection is required")?;
            mongo_find(client, database_name, &collection, &call.args, row_limit).await
        }
        "insertone" => {
            let collection = call.collection.ok_or("collection is required")?;
            let document = mongo_document(&call.args)?;
            client
                .database(database_name)
                .collection::<mongodb::bson::Document>(&collection)
                .insert_one(document)
                .await
                .map_err(|err| err.to_string())?;
            Ok(ok_rows())
        }
        "deleteone" => {
            let collection = call.collection.ok_or("collection is required")?;
            let document = mongo_document(&call.args)?;
            client
                .database(database_name)
                .collection::<mongodb::bson::Document>(&collection)
                .delete_one(document)
                .await
                .map_err(|err| err.to_string())?;
            Ok(ok_rows())
        }
        "replaceone" => {
            let collection = call.collection.ok_or("collection is required")?;
            let (filter, replacement) = mongo_pair(&call.args)?;
            client
                .database(database_name)
                .collection::<mongodb::bson::Document>(&collection)
                .replace_one(filter, replacement)
                .await
                .map_err(|err| err.to_string())?;
            Ok(ok_rows())
        }
        "drop" => {
            let collection = call.collection.ok_or("collection is required")?;
            client
                .database(database_name)
                .collection::<mongodb::bson::Document>(&collection)
                .drop()
                .await
                .map_err(|err| err.to_string())?;
            Ok(ok_rows())
        }
        _ => Err("command is not available".into()),
    }
}

struct MongoCall {
    collection: Option<String>,
    method: String,
    args: String,
}

fn mongo_call(text: &str) -> Result<MongoCall, String> {
    let text = text.trim().trim_end_matches(';').trim();
    let Some((head, rest)) = text.split_once('(') else {
        return Ok(MongoCall {
            collection: None,
            method: text.to_ascii_lowercase(),
            args: String::new(),
        });
    };
    let args = rest.trim().trim_end_matches(')').trim().to_string();
    let head = head.trim();
    let method = head.rsplit('.').next().unwrap_or(head).trim().to_ascii_lowercase();
    let collection = head
        .strip_prefix("db.")
        .and_then(|rest| rest.rsplit_once('.'))
        .map(|(name, _)| name.to_string())
        .filter(|name| !name.is_empty());
    Ok(MongoCall {
        collection,
        method,
        args,
    })
}

fn mongo_document(args: &str) -> Result<mongodb::bson::Document, String> {
    let text = if args.trim().is_empty() { "{}" } else { args.trim() };
    let value: serde_json::Value = serde_json::from_str(text).map_err(|err| err.to_string())?;
    mongodb::bson::to_document(&value).map_err(|err| err.to_string())
}

fn mongo_pair(args: &str) -> Result<(mongodb::bson::Document, mongodb::bson::Document), String> {
    let parts = split_json_values(args)?;
    if parts.len() != 2 {
        return Err("replace needs a filter and a document".into());
    }
    Ok((mongo_document(&parts[0])?, mongo_document(&parts[1])?))
}

fn split_json_values(args: &str) -> Result<Vec<String>, String> {
    let mut values = Vec::new();
    let mut start = None;
    let mut depth = 0i32;
    let mut in_string = false;
    let mut escape = false;
    for (index, ch) in args.char_indices() {
        if in_string {
            if escape {
                escape = false;
            } else if ch == '\\' {
                escape = true;
            } else if ch == '"' {
                in_string = false;
            }
            continue;
        }
        match ch {
            '"' => in_string = true,
            '{' | '[' => {
                if depth == 0 {
                    start = Some(index);
                }
                depth += 1;
            }
            '}' | ']' => {
                depth -= 1;
                if depth == 0 {
                    let from = start.ok_or("document is required")?;
                    values.push(args[from..=index].to_string());
                    start = None;
                }
                if depth < 0 {
                    return Err("document is required".into());
                }
            }
            _ => {}
        }
    }
    if depth != 0 || in_string {
        return Err("document is required".into());
    }
    Ok(values)
}

async fn mongo_find(
    client: &mongodb::Client,
    database_name: &str,
    collection: &str,
    args: &str,
    row_limit: u32,
) -> Result<SqlRows, String> {
    use futures::TryStreamExt;
    let filter = mongo_document(args)?;
    let coll = client
        .database(database_name)
        .collection::<mongodb::bson::Document>(collection);
    let mut cursor = coll
        .find(filter)
        .limit(i64::from(row_limit))
        .await
        .map_err(|err| err.to_string())?;
    let mut documents = Vec::new();
    while let Some(document) = cursor.try_next().await.map_err(|err| err.to_string())? {
        documents.push(document);
        if documents.len() as u32 >= row_limit {
            break;
        }
    }
    let mut rows = Vec::new();
    let mut bytes = 0usize;
    let mut truncated = false;
    for document in documents {
        if truncated {
            break;
        }
        let value = mongodb::bson::from_document::<serde_json::Value>(document).unwrap_or(json!({}));
        let text = serde_json::to_string(&value).unwrap_or_else(|_| "{}".into());
        push_row(&mut rows, &mut truncated, &mut bytes, row_limit, vec![Value::String(text)]);
    }
    Ok(SqlRows {
        columns: vec!["document".into()],
        rows,
        truncated,
    })
}

fn name_rows(names: Vec<String>) -> SqlRows {
    SqlRows {
        columns: vec!["name".into()],
        rows: names.into_iter().map(|name| vec![Value::String(name)]).collect(),
        truncated: false,
    }
}

fn collection_rows(database: &str, names: Vec<String>) -> SqlRows {
    SqlRows {
        columns: vec!["db".into(), "name".into(), "column".into(), "type".into(), "table_type".into()],
        rows: names
            .into_iter()
            .map(|name| {
                vec![
                    Value::String(database.to_string()),
                    Value::String(name),
                    Value::String(String::new()),
                    Value::String("collection".into()),
                    Value::String("COLLECTION".into()),
                ]
            })
            .collect(),
        truncated: false,
    }
}

fn ok_rows() -> SqlRows {
    SqlRows {
        columns: vec!["ok".into()],
        rows: vec![vec![Value::String("1".into())]],
        truncated: false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn redis_keyspace_fills_empty_databases_and_keeps_counts() {
        let rows = redis_keyspace_rows("# Keyspace\ndb0:keys=3,expires=1,avg_ttl=9\n", "0");
        assert_eq!(rows.columns, vec!["name", "keys", "expires", "avg_ttl"]);
        assert_eq!(rows.rows.len(), 16);
        assert_eq!(rows.rows[0][0], Value::String("0".into()));
        assert_eq!(rows.rows[0][1], Value::String("3".into()));
        assert_eq!(rows.rows[0][2], Value::String("1".into()));
        assert_eq!(rows.rows[0][3], Value::String("9".into()));
        assert_eq!(rows.rows[1][1], Value::String("0".into()));
    }

    #[test]
    fn sqlite_file_round_trip_keeps_column_types() {
        let path = std::env::temp_dir().join(format!("tw-sqlite-{}.db", uuid::Uuid::new_v4()));
        let connection = DbConnection {
            id: "c".into(),
            name: "local".into(),
            engine: "sqlite".into(),
            host: String::new(),
            port: 0,
            database: path.display().to_string(),
            user: String::new(),
            auth_database: String::new(),
            tls: "disabled".into(),
            ssh_session_id: None,
            revision: 1,
            secret_id: String::new(),
        };
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            let created = sqlite_query(
                &connection,
                &SqlJob {
                    sql: "CREATE TABLE orders (id INTEGER, name TEXT)".into(),
                    read_only: false,
                    row_limit: 10,
                },
                None,
                None,
            )
            .await
            .unwrap();
            assert!(created.columns.is_empty() || created.rows.is_empty());
            let probe = sqlite_query(
                &connection,
                &SqlJob {
                    sql: "SELECT 1".into(),
                    read_only: true,
                    row_limit: 1,
                },
                None,
                None,
            )
            .await
            .unwrap();
            assert_eq!(probe.rows[0][0], Value::String("1".into()));
            let catalog = sqlite_query(
                &connection,
                &SqlJob {
                    sql: super::super::driver::search_sql("sqlite").into(),
                    read_only: true,
                    row_limit: 50,
                },
                Some("%%"),
                None,
            )
            .await
            .unwrap();
            assert!(catalog.rows.iter().any(|row| {
                row[1] == Value::String("orders".into())
                    && row[2] == Value::String("id".into())
                    && row[4] == Value::String("BASE TABLE".into())
            }));
        });
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn sqlite_read_only_insert_does_not_change_the_file() {
        let path = std::env::temp_dir().join(format!("tw-sqlite-ro-{}.db", uuid::Uuid::new_v4()));
        let connection = DbConnection {
            id: "c".into(),
            name: "local".into(),
            engine: "sqlite".into(),
            host: String::new(),
            port: 0,
            database: path.display().to_string(),
            user: String::new(),
            auth_database: String::new(),
            tls: "disabled".into(),
            ssh_session_id: None,
            revision: 1,
            secret_id: String::new(),
        };
        let runtime = tokio::runtime::Builder::new_current_thread().enable_all().build().unwrap();
        runtime.block_on(async {
            sqlite_query(
                &connection,
                &SqlJob {
                    sql: "CREATE TABLE orders (id INTEGER)".into(),
                    read_only: false,
                    row_limit: 10,
                },
                None,
                None,
            )
            .await
            .unwrap();
            sqlite_query(
                &connection,
                &SqlJob {
                    sql: "INSERT INTO orders (id) VALUES (1)".into(),
                    read_only: false,
                    row_limit: 10,
                },
                None,
                None,
            )
            .await
            .unwrap();
            let denied = sqlite_query(
                &connection,
                &SqlJob {
                    sql: "INSERT INTO orders (id) VALUES (2)".into(),
                    read_only: true,
                    row_limit: 10,
                },
                None,
                None,
            )
            .await;
            assert!(denied.is_err());
            let rows = sqlite_query(
                &connection,
                &SqlJob {
                    sql: "SELECT COUNT(*) FROM orders".into(),
                    read_only: true,
                    row_limit: 10,
                },
                None,
                None,
            )
            .await
            .unwrap();
            assert_eq!(rows.rows[0][0], Value::String("1".into()));
        });
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn sqlite_cancel_flag_stops_a_long_read() {
        let path = std::env::temp_dir().join(format!("tw-sqlite-stop-{}.db", uuid::Uuid::new_v4()));
        let created = sqlite_blocking(
            path.to_str().unwrap(),
            "CREATE TABLE t (id INTEGER)",
            false,
            10,
            None,
            std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false)),
        );
        assert!(created.is_ok());
        let stop = std::sync::Arc::new(std::sync::atomic::AtomicBool::new(false));
        let flag = std::sync::Arc::clone(&stop);
        let file = path.clone();
        let handle = std::thread::spawn(move || {
            sqlite_blocking(
                file.to_str().unwrap(),
                "WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 5000000) SELECT MAX(x) FROM c",
                true,
                10,
                None,
                flag,
            )
        });
        std::thread::sleep(std::time::Duration::from_millis(30));
        stop.store(true, std::sync::atomic::Ordering::SeqCst);
        let stopped = handle.join().unwrap();
        assert_eq!(stopped.unwrap_err(), "query cancelled");
        let _ = std::fs::remove_file(path);
    }

    #[test]
    fn catalog_sql_for_new_sql_engines_is_a_single_read() {
        for engine in ["sqlite", "mariadb", "sqlserver", "oracle"] {
            let list = super::super::driver::list_command(engine);
            let search = super::super::driver::search_command(engine);
            assert_eq!(super::super::statement_count(list, engine), Some(1), "{engine} list");
            assert_eq!(super::super::classify_sql(list, engine), "read", "{engine} list");
            assert_eq!(super::super::statement_count(search, engine), Some(1), "{engine} search");
            assert_eq!(super::super::classify_sql(search, engine), "read", "{engine} search");
        }
        assert_eq!(super::super::classify_command("redis", super::super::driver::list_command("redis")), Some("read"));
        assert_eq!(
            super::super::classify_command("mongodb", super::super::driver::list_command("mongodb")),
            Some("read")
        );
        assert_eq!(
            super::super::classify_command("redis", "SET user:1 a"),
            Some("write")
        );
        let pair = super::split_json_values(r#"{"id":1}, {"id":1,"name":"a"}"#).unwrap();
        assert_eq!(pair.len(), 2);
        assert!(super::mongo_pair(r#"{"id":1}, {"id":1,"name":"a"}"#).is_ok());
        assert_eq!(
            super::super::classify_sql("UPDATE orders SET name = 'a' WHERE id = 1", "sqlite"),
            "write"
        );
    }

    fn live_connection(engine: &str, host: &str, port: u16, database: &str, user: &str) -> DbConnection {
        DbConnection {
            id: engine.into(),
            name: engine.into(),
            engine: engine.into(),
            host: host.into(),
            port,
            database: database.into(),
            user: user.into(),
            auth_database: String::new(),
            tls: "disabled".into(),
            ssh_session_id: None,
            revision: 1,
            secret_id: "secret".into(),
        }
    }

    #[tokio::test]
    #[ignore = "needs TW_ENGINE_HOST and TW_ENGINE_PASSWORD"]
    async fn live_mariadb_redis_mongo_read() {
        let host = std::env::var("TW_ENGINE_HOST").expect("TW_ENGINE_HOST");
        let password = std::env::var("TW_ENGINE_PASSWORD").expect("TW_ENGINE_PASSWORD");
        let sessions = crate::session::SessionManager::new();
        let cases = [
            ("mariadb", 13307_u16, "twreview", "twreview", "SELECT 1"),
            ("redis", 16379, "0", "default", "PING"),
            ("mongodb", 27017, "admin", "twreview", "listDatabases"),
        ];
        for (engine, port, database, user, sql) in cases {
            let connection = live_connection(engine, &host, port, database, user);
            let rows = super::super::driver::execute(
                &sessions,
                &connection,
                &password,
                &SqlJob {
                    sql: sql.into(),
                    read_only: true,
                    row_limit: 20,
                },
                None,
                None,
            )
            .await
            .unwrap_or_else(|err| panic!("{engine}: {err}"));
            assert!(!rows.rows.is_empty(), "{engine}");
            assert!(!format!("{rows:?}").contains(&password), "{engine}");
            let bad_sql = match engine {
                "redis" => "NOPE",
                "mongodb" => "nope()",
                _ => "SELECT * FROM tw_no_such_relation_zz",
            };
            let bad = super::super::driver::execute(
                &sessions,
                &connection,
                &password,
                &SqlJob {
                    sql: bad_sql.into(),
                    read_only: true,
                    row_limit: 20,
                },
                None,
                None,
            )
            .await;
            let err = bad.expect_err(engine);
            assert!(!err.contains(&password), "{engine} error leaked a secret");
            let write = match engine {
                "redis" => "SET tw_should_not_land 1",
                "mongodb" => "db.orders.insertOne({})",
                _ => "INSERT INTO tw_should_not_land (id) VALUES (1)",
            };
            let decision = super::super::gate::authorize(&connection, "safe", "query", write, 20, None).expect(engine);
            assert!(
                matches!(decision, super::super::gate::Authorized::NeedsApproval { .. }),
                "{engine} write was not held for approval"
            );
        }
    }

    async fn live_vendor_sql(engine: &str, host_key: &str, port_key: &str, default_port: u16, database_key: &str, default_database: &str, user_key: &str, password_key: &str, cancel_sql: &str) {
        let host = std::env::var(host_key).unwrap_or_else(|_| panic!("{host_key}"));
        let port = std::env::var(port_key).ok().and_then(|value| value.parse().ok()).unwrap_or(default_port);
        let database = std::env::var(database_key).unwrap_or_else(|_| default_database.to_string());
        let user = std::env::var(user_key).unwrap_or_else(|_| panic!("{user_key}"));
        let password = std::env::var(password_key).unwrap_or_else(|_| panic!("{password_key}"));
        let sessions = crate::session::SessionManager::new();
        let connection = live_connection(engine, &host, port, &database, &user);
        let list = super::super::driver::execute(
            &sessions,
            &connection,
            &password,
            &SqlJob {
                sql: super::super::driver::list_command(engine).into(),
                read_only: true,
                row_limit: 50,
            },
            None,
            None,
        )
        .await
        .unwrap_or_else(|err| panic!("{engine} list: {err}"));
        assert!(!list.rows.is_empty(), "{engine} listed no databases");
        assert!(!format!("{list:?}").contains(&password));
        let search = super::super::driver::execute(
            &sessions,
            &connection,
            &password,
            &SqlJob {
                sql: super::super::driver::search_command(engine).into(),
                read_only: true,
                row_limit: 50,
            },
            Some("%%"),
            None,
        )
        .await
        .unwrap_or_else(|err| panic!("{engine} search: {err}"));
        assert!(!format!("{search:?}").contains(&password));
        let bad = super::super::driver::execute(
            &sessions,
            &connection,
            &password,
            &SqlJob {
                sql: "SELECT * FROM tw_no_such_relation_zz".into(),
                read_only: true,
                row_limit: 20,
            },
            None,
            None,
        )
        .await;
        let err = bad.expect_err(engine);
        assert!(!err.contains(&password), "{engine} error leaked a secret");
        let decision = super::super::gate::authorize(
            &connection,
            "safe",
            "query",
            "INSERT INTO tw_should_not_land (id) VALUES (1)",
            20,
            None,
        )
        .expect(engine);
        assert!(matches!(decision, super::super::gate::Authorized::NeedsApproval { .. }));

        let operation = format!("live-{engine}-cancel");
        let cancel_host = host.clone();
        let cancel_password = password.clone();
        let cancel_database = database.clone();
        let cancel_user = user.clone();
        let cancel_sql = cancel_sql.to_string();
        let operation_id = operation.clone();
        let engine_name = engine.to_string();
        let running = tokio::spawn(async move {
            let sessions = crate::session::SessionManager::new();
            let connection = live_connection(&engine_name, &cancel_host, port, &cancel_database, &cancel_user);
            super::super::driver::execute(
                &sessions,
                &connection,
                &cancel_password,
                &SqlJob {
                    sql: cancel_sql,
                    read_only: false,
                    row_limit: 20,
                },
                None,
                Some(&operation_id),
            )
            .await
        });
        tokio::time::sleep(std::time::Duration::from_secs(1)).await;
        crate::db::live::cancel_operation(&operation);
        let cancelled = running.await.unwrap().expect_err("cancel should stop the statement");
        assert!(cancelled.contains("query cancelled"), "{engine}: {cancelled}");
    }

    #[tokio::test]
    #[ignore = "needs TW_DB_MSSQL_HOST, TW_DB_MSSQL_USER, and TW_DB_MSSQL_PASSWORD"]
    async fn live_sqlserver_catalog_read_error_and_cancel() {
        live_vendor_sql(
            "sqlserver",
            "TW_DB_MSSQL_HOST",
            "TW_DB_MSSQL_PORT",
            1433,
            "TW_DB_MSSQL_DATABASE",
            "master",
            "TW_DB_MSSQL_USER",
            "TW_DB_MSSQL_PASSWORD",
            "WAITFOR DELAY '00:00:30'",
        )
        .await;
    }

    #[tokio::test]
    #[ignore = "needs TW_DB_ORACLE_HOST, TW_DB_ORACLE_USER, and TW_DB_ORACLE_PASSWORD"]
    async fn live_oracle_catalog_read_error_and_cancel() {
        live_vendor_sql(
            "oracle",
            "TW_DB_ORACLE_HOST",
            "TW_DB_ORACLE_PORT",
            1521,
            "TW_DB_ORACLE_SERVICE",
            "FREEPDB1",
            "TW_DB_ORACLE_USER",
            "TW_DB_ORACLE_PASSWORD",
            "BEGIN DBMS_SESSION.SLEEP(30); END;",
        )
        .await;
    }
}
