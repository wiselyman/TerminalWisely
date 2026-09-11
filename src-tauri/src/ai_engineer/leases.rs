//! One-shot PrivilegeLease registry — exact command + expiry hard gate.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

fn leases() -> &'static Mutex<HashMap<String, PrivilegeLease>> {
    static LEASES: OnceLock<Mutex<HashMap<String, PrivilegeLease>>> = OnceLock::new();
    LEASES.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrivilegeLease {
    pub lease_id: String,
    pub session_id: String,
    pub command: String,
    pub expires_at_epoch_s: f64,
    pub max_executions: u32,
    pub executions: u32,
}

#[derive(Debug, Deserialize)]
pub struct RegisterLeaseRequest {
    pub lease_id: String,
    pub session_id: String,
    pub command: String,
    pub expires_at_epoch_s: f64,
    pub max_executions: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct RegisterLeaseResponse {
    pub ok: bool,
    pub lease_id: String,
}

fn now_epoch_s() -> f64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs_f64())
        .unwrap_or(0.0)
}

pub fn register_privilege_lease(req: RegisterLeaseRequest) -> AppResult<RegisterLeaseResponse> {
    let command = req.command.trim().to_string();
    if req.lease_id.is_empty() || req.session_id.is_empty() || command.is_empty() {
        return Err(AppError::msg("lease_id, session_id, and command required"));
    }
    if req.expires_at_epoch_s <= now_epoch_s() {
        return Err(AppError::msg("lease already expired"));
    }
    let lease = PrivilegeLease {
        lease_id: req.lease_id.clone(),
        session_id: req.session_id,
        command,
        expires_at_epoch_s: req.expires_at_epoch_s,
        max_executions: req.max_executions.unwrap_or(1).max(1),
        executions: 0,
    };
    let mut map = leases().lock().map_err(|e| AppError::msg(e.to_string()))?;
    map.insert(lease.lease_id.clone(), lease);
    Ok(RegisterLeaseResponse {
        ok: true,
        lease_id: req.lease_id,
    })
}

/// Validate lease without consuming (so sudo password retries can re-enter).
pub fn assert_lease_ready(lease_id: &str, session_id: &str, command: &str) -> AppResult<()> {
    let mut map = leases().lock().map_err(|e| AppError::msg(e.to_string()))?;
    let Some(lease) = map.get(lease_id) else {
        return Err(AppError::msg("unknown privilege lease"));
    };
    if lease.session_id != session_id {
        return Err(AppError::msg("lease session_id mismatch"));
    }
    if lease.command != command.trim() {
        return Err(AppError::msg(
            "lease command mismatch — exact approved command required",
        ));
    }
    if lease.expires_at_epoch_s <= now_epoch_s() {
        map.remove(lease_id);
        return Err(AppError::msg("privilege lease expired"));
    }
    if lease.executions >= lease.max_executions {
        return Err(AppError::msg("privilege lease exhausted"));
    }
    Ok(())
}

/// Consume one execution of a lease.
pub fn consume_lease(lease_id: &str, session_id: &str, command: &str) -> AppResult<()> {
    assert_lease_ready(lease_id, session_id, command)?;
    let mut map = leases().lock().map_err(|e| AppError::msg(e.to_string()))?;
    let Some(lease) = map.get_mut(lease_id) else {
        return Err(AppError::msg("unknown privilege lease"));
    };
    lease.executions += 1;
    if lease.executions >= lease.max_executions {
        map.remove(lease_id);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn lease_exact_command_and_oneshot() {
        let id = format!("t-{}", now_epoch_s());
        register_privilege_lease(RegisterLeaseRequest {
            lease_id: id.clone(),
            session_id: "s1".into(),
            command: "systemctl restart nginx".into(),
            expires_at_epoch_s: now_epoch_s() + 60.0,
            max_executions: Some(1),
        })
        .unwrap();
        consume_lease(&id, "s1", "systemctl restart nginx").unwrap();
        assert!(consume_lease(&id, "s1", "systemctl restart nginx").is_err());
    }
}
