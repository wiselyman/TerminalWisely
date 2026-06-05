use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

use tokio::sync::Mutex;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

pub const CANCELLED_MSG: &str = "传输已取消";

struct ActiveTransfer {
    cancel: Arc<AtomicBool>,
    session_id: String,
    direction: String,
}

#[derive(Clone)]
pub struct TransferHandle {
    pub id: String,
    pub cancel: Arc<AtomicBool>,
}

#[derive(Clone)]
pub struct TransferRegistry {
    active: Arc<Mutex<HashMap<String, ActiveTransfer>>>,
}

impl TransferRegistry {
    pub fn new() -> Self {
        Self {
            active: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn resolve_transfer_id(transfer_id: Option<String>) -> String {
        transfer_id.unwrap_or_else(|| Uuid::new_v4().to_string())
    }

    pub async fn begin(
        &self,
        transfer_id: String,
        session_id: String,
        direction: impl Into<String>,
    ) -> TransferHandle {
        let cancel = Arc::new(AtomicBool::new(false));
        self.active.lock().await.insert(
            transfer_id.clone(),
            ActiveTransfer {
                cancel: cancel.clone(),
                session_id,
                direction: direction.into(),
            },
        );
        TransferHandle {
            id: transfer_id,
            cancel,
        }
    }

    pub async fn cancel(&self, transfer_id: &str) -> bool {
        if let Some(entry) = self.active.lock().await.get(transfer_id) {
            entry.cancel.store(true, Ordering::SeqCst);
            return true;
        }
        false
    }

    pub async fn clear(&self, transfer_id: &str) {
        self.active.lock().await.remove(transfer_id);
    }
}

pub const CANCEL_POLL_MS: u64 = 200;

pub fn check_cancel(cancel: Option<&AtomicBool>) -> AppResult<()> {
    if cancel.is_some_and(|flag| flag.load(Ordering::SeqCst)) {
        return Err(AppError::msg(CANCELLED_MSG));
    }
    Ok(())
}

pub fn is_cancelled(err: &AppError) -> bool {
    matches!(err, AppError::Message(message) if message == CANCELLED_MSG)
}

/// Limit UI/event overhead during large transfers.
pub struct ThrottledProgress<F> {
    on_progress: F,
    last_emit: Instant,
    min_interval: Duration,
}

impl<F> ThrottledProgress<F>
where
    F: FnMut(u64, u64),
{
    pub fn new(on_progress: F, min_interval: Duration) -> Self {
        Self {
            on_progress,
            last_emit: Instant::now() - min_interval,
            min_interval,
        }
    }

    pub fn report(&mut self, transferred: u64, total: u64, force: bool) {
        if force || self.last_emit.elapsed() >= self.min_interval {
            (self.on_progress)(transferred, total);
            self.last_emit = Instant::now();
        }
    }
}

pub struct ThrottledProgressBytes<F> {
    on_progress: F,
    last_emit: Instant,
    min_interval: Duration,
}

impl<F> ThrottledProgressBytes<F>
where
    F: FnMut(u64),
{
    pub fn new(on_progress: F, min_interval: Duration) -> Self {
        Self {
            on_progress,
            last_emit: Instant::now() - min_interval,
            min_interval,
        }
    }

    pub fn report(&mut self, transferred: u64, force: bool) {
        if force || self.last_emit.elapsed() >= self.min_interval {
            (self.on_progress)(transferred);
            self.last_emit = Instant::now();
        }
    }
}
