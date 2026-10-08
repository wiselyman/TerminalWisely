//! One-shot database lease. Bound to connection revision, operation, and SQL text.
//! Not a shell command lease.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DbLease {
    pub lease_id: String,
    pub connection_id: String,
    pub revision: u64,
    pub operation: String,
    pub sql: String,
    pub expires_at_epoch_s: f64,
    pub max_executions: u32,
    pub executions: u32,
    /// `approval` when a person approved; `auto` when the mode allowed it.
    pub grant_kind: String,
}

fn store() -> &'static Mutex<HashMap<String, DbLease>> {
    static LEASES: OnceLock<Mutex<HashMap<String, DbLease>>> = OnceLock::new();
    LEASES.get_or_init(|| Mutex::new(HashMap::new()))
}

fn now_epoch_s() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

pub fn register_db_lease(mut lease: DbLease) -> Result<(), String> {
    let sql = lease.sql.trim().to_string();
    if lease.lease_id.is_empty()
        || lease.connection_id.is_empty()
        || lease.operation.is_empty()
        || sql.is_empty()
    {
        return Err("lease target required".into());
    }
    if lease.expires_at_epoch_s <= now_epoch_s() {
        return Err("lease already expired".into());
    }
    if lease.grant_kind != "approval" && lease.grant_kind != "auto" {
        return Err("unknown grant kind".into());
    }
    lease.sql = sql;
    lease.max_executions = lease.max_executions.max(1);
    lease.executions = 0;
    let mut map = store().lock().map_err(|err| err.to_string())?;
    map.insert(lease.lease_id.clone(), lease);
    Ok(())
}

/// Atomically check and consume. A second caller sees the lease gone.
pub fn consume_db_lease(
    lease_id: &str,
    connection_id: &str,
    revision: u64,
    operation: &str,
    sql: &str,
) -> Result<String, String> {
    let mut map = store().lock().map_err(|err| err.to_string())?;
    let Some(lease) = map.get(lease_id) else {
        return Err("unknown database lease".into());
    };
    if lease.connection_id != connection_id {
        return Err("lease connection mismatch".into());
    }
    if lease.revision != revision {
        return Err("lease revision mismatch".into());
    }
    if lease.operation != operation {
        return Err("lease operation mismatch".into());
    }
    if lease.sql != sql.trim() {
        return Err("lease sql mismatch".into());
    }
    if lease.expires_at_epoch_s <= now_epoch_s() {
        map.remove(lease_id);
        return Err("database lease expired".into());
    }
    if lease.executions >= lease.max_executions {
        map.remove(lease_id);
        return Err("database lease exhausted".into());
    }
    let grant = lease.grant_kind.clone();
    let lease = map.get_mut(lease_id).ok_or("unknown database lease")?;
    lease.executions += 1;
    if lease.executions >= lease.max_executions {
        map.remove(lease_id);
    }
    Ok(grant)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    fn sample(id: &str, sql: &str) -> DbLease {
        DbLease {
            lease_id: id.into(),
            connection_id: "c1".into(),
            revision: 3,
            operation: "query".into(),
            sql: sql.into(),
            expires_at_epoch_s: now_epoch_s() + 60.0,
            max_executions: 1,
            executions: 0,
            grant_kind: "approval".into(),
        }
    }

    #[test]
    fn rejects_missing_expired_and_target_changes() {
        let missing = consume_db_lease("nope", "c1", 3, "query", "SELECT 1");
        assert!(missing.is_err());

        let id = format!("exp-{}", now_epoch_s());
        let mut expired = sample(&id, "SELECT 1");
        expired.expires_at_epoch_s = now_epoch_s() - 1.0;
        assert!(register_db_lease(expired).is_err());

        let id = format!("ok-{}", now_epoch_s());
        register_db_lease(sample(&id, "SELECT 1")).unwrap();
        assert!(consume_db_lease(&id, "other", 3, "query", "SELECT 1").is_err());
        assert!(consume_db_lease(&id, "c1", 4, "query", "SELECT 1").is_err());
        assert!(consume_db_lease(&id, "c1", 3, "explain", "SELECT 1").is_err());
        assert!(consume_db_lease(&id, "c1", 3, "query", "SELECT 2").is_err());
        assert_eq!(
            consume_db_lease(&id, "c1", 3, "query", " SELECT 1 ").unwrap(),
            "approval"
        );
        assert!(consume_db_lease(&id, "c1", 3, "query", "SELECT 1").is_err());
    }

    #[test]
    fn concurrent_consume_runs_once() {
        let id = format!("race-{}", now_epoch_s());
        register_db_lease(sample(&id, "UPDATE t SET a = 1")).unwrap();
        let left_id = id.clone();
        let right_id = id.clone();
        let left = thread::spawn(move || {
            consume_db_lease(&left_id, "c1", 3, "query", "UPDATE t SET a = 1")
        });
        let right = thread::spawn(move || {
            consume_db_lease(&right_id, "c1", 3, "query", "UPDATE t SET a = 1")
        });
        let results = [left.join().unwrap(), right.join().unwrap()];
        let ok = results.iter().filter(|item| item.is_ok()).count();
        assert_eq!(ok, 1);
    }
}
