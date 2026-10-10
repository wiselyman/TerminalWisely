//! Authorize a statement before any driver sees it.

use std::sync::Arc;
use std::sync::Mutex;

use serde::Serialize;

use super::auth::{decide_sql, SqlAuth};
use super::catalog::DbConnection;
use super::command_risk::{classify_command, command_statement_count};
use super::lease::{consume_db_lease, register_db_lease, DbLease};
use super::sql_risk::{classify_sql, statement_count};

/// Default / data-query row cap (grid pages stay smaller via SQL LIMIT).
pub const MAX_ROW_LIMIT: u32 = 500;
/// Object/structure search returns one row per column — 500 truncates mid-schema.
pub const CATALOG_ROW_LIMIT: u32 = 50_000;
pub const QUERY_TIMEOUT_SECS: u64 = 30;

#[derive(Debug, Clone)]
pub struct SqlJob {
    pub sql: String,
    pub read_only: bool,
    pub row_limit: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
pub struct SqlRows {
    pub columns: Vec<String>,
    pub rows: Vec<Vec<serde_json::Value>>,
    pub truncated: bool,
}

#[derive(Debug, Clone, PartialEq)]
pub enum GateOutcome {
    Rows(SqlRows),
    NeedsApproval {
        risk: String,
        connection_id: String,
        revision: u64,
        operation: String,
        sql: String,
    },
}

pub enum Authorized {
    Ready(SqlJob),
    NeedsApproval {
        risk: String,
        connection_id: String,
        revision: u64,
        operation: String,
        sql: String,
    },
}

pub trait SqlExecutor {
    fn execute(&self, job: &SqlJob) -> Result<SqlRows, String>;
}

#[derive(Default)]
pub struct RecordingExecutor {
    pub jobs: Mutex<Vec<SqlJob>>,
}

impl SqlExecutor for RecordingExecutor {
    fn execute(&self, job: &SqlJob) -> Result<SqlRows, String> {
        self.jobs.lock().map_err(|err| err.to_string())?.push(job.clone());
        Ok(SqlRows {
            columns: vec!["ok".into()],
            rows: vec![vec![serde_json::Value::String("1".into())]],
            truncated: false,
        })
    }
}

pub fn run_statement(
    connection: &DbConnection,
    security_mode: &str,
    operation: &str,
    sql: &str,
    row_limit: u32,
    lease_id: Option<&str>,
    executor: &dyn SqlExecutor,
) -> Result<GateOutcome, String> {
    match authorize(connection, security_mode, operation, sql, row_limit, lease_id)? {
        Authorized::NeedsApproval {
            risk,
            connection_id,
            revision,
            operation,
            sql,
        } => Ok(GateOutcome::NeedsApproval {
            risk,
            connection_id,
            revision,
            operation,
            sql,
        }),
        Authorized::Ready(job) => Ok(GateOutcome::Rows(executor.execute(&job)?)),
    }
}

/// Classify and consume a lease. `Ready` carries the job; the caller runs it.
pub fn authorize(
    connection: &DbConnection,
    security_mode: &str,
    operation: &str,
    sql: &str,
    row_limit: u32,
    lease_id: Option<&str>,
) -> Result<Authorized, String> {
    if !(1..=CATALOG_ROW_LIMIT).contains(&row_limit) {
        return Err(format!("row_limit must be 1..={CATALOG_ROW_LIMIT}"));
    }
    let dialect = connection.engine.as_str();
    let class = if classify_command(dialect, sql).is_some() {
        match command_statement_count(sql) {
            1 => classify_command(dialect, sql).unwrap_or("unparsed"),
            _ => return Err("only a single statement is accepted".into()),
        }
    } else {
        match statement_count(sql, dialect) {
            Some(1) => classify_sql(sql, dialect),
            Some(_) => return Err("only a single statement is accepted".into()),
            None => return Err("could not prove a single statement".into()),
        }
    };
    if class == "transaction" {
        return Err("transaction control is not accepted".into());
    }
    let trimmed = sql.trim().to_string();
    let job = SqlJob {
        sql: trimmed.clone(),
        read_only: class == "read",
        row_limit,
    };
    match decide_sql(class, security_mode) {
        SqlAuth::Deny { reason } => Err(reason.into()),
        SqlAuth::RequireApproval { risk } => {
            let Some(lease_id) = lease_id.map(str::trim).filter(|value| !value.is_empty()) else {
                return Ok(Authorized::NeedsApproval {
                    risk: risk.into(),
                    connection_id: connection.id.clone(),
                    revision: connection.revision,
                    operation: operation.into(),
                    sql: trimmed,
                });
            };
            consume_db_lease(
                lease_id,
                &connection.id,
                connection.revision,
                operation,
                &trimmed,
            )?;
            Ok(Authorized::Ready(job))
        }
        SqlAuth::Allow { automatic, .. } => {
            let lease_id = format!(
                "auto-{}-{}-{}",
                connection.id,
                connection.revision,
                uuid::Uuid::new_v4()
            );
            register_db_lease(DbLease {
                lease_id: lease_id.clone(),
                connection_id: connection.id.clone(),
                revision: connection.revision,
                operation: operation.into(),
                sql: trimmed.clone(),
                expires_at_epoch_s: now_epoch_s() + 30.0,
                max_executions: 1,
                executions: 0,
                grant_kind: if automatic { "auto" } else { "approval" }.into(),
            })?;
            consume_db_lease(
                &lease_id,
                &connection.id,
                connection.revision,
                operation,
                &trimmed,
            )?;
            Ok(Authorized::Ready(job))
        }
    }
}

fn now_epoch_s() -> f64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

pub fn received_sql(executor: &RecordingExecutor) -> Vec<String> {
    executor
        .jobs
        .lock()
        .map(|jobs| jobs.iter().map(|job| job.sql.clone()).collect())
        .unwrap_or_default()
}

pub fn share(executor: RecordingExecutor) -> Arc<RecordingExecutor> {
    Arc::new(executor)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::catalog::{DbCatalog, SaveDbConnection};
    use crate::db::lease::{register_db_lease, DbLease};
    use crate::db::secrets::MemorySecretStore;
    use crate::db::sql_risk::{classify_sql, statement_count};

    fn connection() -> DbConnection {
        let mut catalog = DbCatalog::default();
        let secrets = MemorySecretStore::default();
        catalog
            .save(
                SaveDbConnection {
                    id: None,
                    name: "app".into(),
                    engine: "postgres".into(),
                    host: "db.internal".into(),
                    port: Some(5432),
                    database: "app".into(),
                    user: "app".into(),
                    auth_database: String::new(),
                    tls: "disabled".into(),
                    ssh_session_id: None,
                    password: Some("secret".into()),
                    clear_secret: false,
                },
                &secrets,
            )
            .unwrap()
            .connection
    }

    #[test]
    fn observe_rejects_unparsed_without_calling_the_driver() {
        let executor = RecordingExecutor::default();
        let err = run_statement(
            &connection(),
            "observe",
            "query",
            "not sql",
            50,
            None,
            &executor,
        )
        .unwrap_err();
        assert!(err.contains("OBSERVE") || err.contains("parsed"));
        assert!(received_sql(&executor).is_empty());
    }

    #[test]
    fn redis_and_mongo_writes_need_approval() {
        let secrets = MemorySecretStore::default();
        for (engine, sql, port, database, user) in [
            ("redis", "SET user:1 a", 6379_u16, "0", "default"),
            ("redis", "DEL user:1", 6379, "0", "default"),
            ("mongodb", "db.orders.insertOne({})", 27017, "app", "app"),
            ("mongodb", "db.orders.deleteOne({})", 27017, "app", "app"),
            ("mongodb", "db.orders.replaceOne({},{})", 27017, "app", "app"),
        ] {
            let mut catalog = DbCatalog::default();
            let conn = catalog
                .save(
                    SaveDbConnection {
                        id: None,
                        name: engine.into(),
                        engine: engine.into(),
                        host: "db.internal".into(),
                        port: Some(port),
                        database: database.into(),
                        user: user.into(),
                        auth_database: String::new(),
                        tls: "disabled".into(),
                        ssh_session_id: None,
                        password: Some("secret".into()),
                        clear_secret: false,
                    },
                    &secrets,
                )
                .unwrap()
                .connection;
            let executor = RecordingExecutor::default();
            let pending = run_statement(&conn, "safe", "query", sql, 50, None, &executor).unwrap();
            assert!(matches!(pending, GateOutcome::NeedsApproval { .. }), "{engine}");
            assert!(received_sql(&executor).is_empty(), "{engine}");
        }
    }

    #[test]
    fn safe_update_needs_approval_until_a_matching_lease() {
        let conn = connection();
        let executor = RecordingExecutor::default();
        let pending = run_statement(
            &conn,
            "safe",
            "query",
            "UPDATE t SET a = 1",
            50,
            None,
            &executor,
        )
        .unwrap();
        assert!(matches!(pending, GateOutcome::NeedsApproval { .. }));
        assert!(received_sql(&executor).is_empty());

        register_db_lease(DbLease {
            lease_id: "lease-1".into(),
            connection_id: conn.id.clone(),
            revision: conn.revision,
            operation: "query".into(),
            sql: "UPDATE t SET a = 1".into(),
            expires_at_epoch_s: now_epoch_s() + 60.0,
            max_executions: 1,
            executions: 0,
            grant_kind: "approval".into(),
        })
        .unwrap();
        let done = run_statement(
            &conn,
            "safe",
            "query",
            "UPDATE t SET a = 1",
            50,
            Some("lease-1"),
            &executor,
        )
        .unwrap();
        assert!(matches!(done, GateOutcome::Rows(_)));
        assert_eq!(received_sql(&executor), vec!["UPDATE t SET a = 1".to_string()]);
    }

    fn connection_for(engine: &str, port: u16) -> DbConnection {
        let mut catalog = DbCatalog::default();
        let secrets = MemorySecretStore::default();
        catalog
            .save(
                SaveDbConnection {
                    id: None,
                    name: engine.into(),
                    engine: engine.into(),
                    host: "db.internal".into(),
                    port: Some(port),
                    database: "app".into(),
                    user: "app".into(),
                    auth_database: String::new(),
                    tls: "disabled".into(),
                    ssh_session_id: None,
                    password: Some("secret".into()),
                    clear_secret: false,
                },
                &secrets,
            )
            .unwrap()
            .connection
    }

    #[test]
    fn table_editor_writes_need_approval_and_definition_reads_stay_reads() {
        let pg = connection();
        let read = r#"SELECT * FROM "public"."orders" WHERE "id" LIKE '%a''%' ESCAPE '\' ORDER BY "id" DESC LIMIT 100 OFFSET 100"#;
        assert_eq!(statement_count(read, "postgres"), Some(1));
        let executor = RecordingExecutor::default();
        let outcome = run_statement(&pg, "safe", "query", read, 100, None, &executor).unwrap();
        assert!(matches!(outcome, GateOutcome::Rows(_)));
        assert!(executor.jobs.lock().unwrap()[0].read_only);

        for sql in [
            r#"INSERT INTO "public"."orders" ("id") VALUES (1)"#,
            r#"DELETE FROM "public"."orders" WHERE "id" = 1"#,
            r#"DROP TABLE "public"."orders""#,
            r#"TRUNCATE TABLE "public"."orders""#,
            r#"CREATE TABLE "public"."orders" ("id" integer NOT NULL, PRIMARY KEY ("id"))"#,
        ] {
            assert_eq!(statement_count(sql, "postgres"), Some(1), "{sql}");
            let executor = RecordingExecutor::default();
            let pending = run_statement(&pg, "safe", "query", sql, 50, None, &executor).unwrap();
            assert!(matches!(pending, GateOutcome::NeedsApproval { .. }), "{sql}");
            assert!(received_sql(&executor).is_empty(), "{sql}");
        }

        let view = r#"SELECT pg_get_viewdef('"public"."orders"'::regclass, true)"#;
        assert_eq!(statement_count(view, "postgres"), Some(1));
        assert_eq!(classify_sql(view, "postgres"), "read");

        let mysql = connection_for("mysql", 3306);
        let show = "SHOW CREATE TABLE `shop`.`orders`";
        assert_eq!(statement_count(show, "mysql"), Some(1));
        assert_eq!(classify_sql(show, "mysql"), "read");
        let executor = RecordingExecutor::default();
        let shown = run_statement(&mysql, "safe", "query", show, 50, None, &executor).unwrap();
        assert!(matches!(shown, GateOutcome::Rows(_)));
        assert!(executor.jobs.lock().unwrap()[0].read_only);
    }

    #[test]
    fn read_query_is_marked_read_only() {
        let executor = RecordingExecutor::default();
        run_statement(
            &connection(),
            "observe",
            "query",
            "SELECT 1",
            10,
            None,
            &executor,
        )
        .unwrap();
        let jobs = executor.jobs.lock().unwrap();
        assert!(jobs[0].read_only);
    }

    #[test]
    fn multi_statement_never_reaches_the_driver() {
        let executor = RecordingExecutor::default();
        let err = run_statement(
            &connection(),
            "autonomous",
            "query",
            "SELECT 1; DROP TABLE t",
            10,
            None,
            &executor,
        )
        .unwrap_err();
        assert!(err.contains("single"));
        assert!(received_sql(&executor).is_empty());
    }

    #[test]
    fn unprovable_script_never_reaches_the_driver() {
        let executor = RecordingExecutor::default();
        let err = run_statement(
            &connection(),
            "autonomous",
            "query",
            "SELECT '",
            10,
            None,
            &executor,
        )
        .unwrap_err();
        assert!(err.contains("prove"));
        assert!(received_sql(&executor).is_empty());
    }

    #[test]
    fn file_output_plus_another_statement_never_reaches_the_driver() {
        let executor = RecordingExecutor::default();
        let err = run_statement(
            &connection(),
            "autonomous",
            "query",
            "SELECT 1 INTO OUTFILE '/tmp/a'; DROP TABLE t",
            10,
            None,
            &executor,
        )
        .unwrap_err();
        assert!(err.contains("single") || err.contains("prove"));
        assert!(received_sql(&executor).is_empty());
    }

    #[test]
    fn catalog_row_limit_is_accepted_for_object_search() {
        let executor = RecordingExecutor::default();
        let outcome = run_statement(
            &connection(),
            "safe",
            "search",
            r#"SELECT 1"#,
            CATALOG_ROW_LIMIT,
            None,
            &executor,
        )
        .unwrap();
        assert!(matches!(outcome, GateOutcome::Rows(_)));
        assert_eq!(executor.jobs.lock().unwrap()[0].row_limit, CATALOG_ROW_LIMIT);
        let rejected = authorize(
            &connection(),
            "safe",
            "search",
            "SELECT 1",
            CATALOG_ROW_LIMIT + 1,
            None,
        );
        assert!(rejected.is_err());
        assert!(rejected.err().unwrap().contains("row_limit"));
    }
}
