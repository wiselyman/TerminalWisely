//! In-flight database work. Closing the SSH session or cancelling an operation stops it.

use std::collections::{HashMap, VecDeque};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use tokio::sync::watch;

static FLIGHT_IDS: AtomicU64 = AtomicU64::new(1);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Halt {
    None,
    Cancelled,
    SessionClosed,
}

struct Flight {
    id: u64,
    tx: Arc<watch::Sender<Halt>>,
}

static OPERATIONS: Mutex<Option<HashMap<String, Flight>>> = Mutex::new(None);
static SESSIONS: Mutex<Option<HashMap<String, Vec<Flight>>>> = Mutex::new(None);
static EARLY_CANCEL: Mutex<VecDeque<String>> = Mutex::new(VecDeque::new());

pub struct QueryWatch {
    flight_id: u64,
    operation_id: Option<String>,
    session_id: Option<String>,
    rx: watch::Receiver<Halt>,
}

impl QueryWatch {
    pub fn halt(&self) -> Halt {
        *self.rx.borrow()
    }

    pub fn receiver(&self) -> watch::Receiver<Halt> {
        self.rx.clone()
    }

    pub async fn until_halt(&self) -> Halt {
        let mut rx = self.rx.clone();
        loop {
            let current = *rx.borrow();
            if current != Halt::None {
                return current;
            }
            if rx.changed().await.is_err() {
                return Halt::SessionClosed;
            }
        }
    }
}

impl Drop for QueryWatch {
    fn drop(&mut self) {
        if let Some(operation_id) = self.operation_id.as_deref() {
            if let Ok(mut guard) = OPERATIONS.lock() {
                if let Some(map) = guard.as_mut() {
                    map.remove(operation_id);
                }
            }
        }
        if let Some(session_id) = self.session_id.as_deref() {
            if let Ok(mut guard) = SESSIONS.lock() {
                if let Some(map) = guard.as_mut() {
                    if let Some(list) = map.get_mut(session_id) {
                        list.retain(|flight| flight.id != self.flight_id);
                        if list.is_empty() {
                            map.remove(session_id);
                        }
                    }
                }
            }
        }
    }
}

/// Register a flight the UI or an SSH disconnect can stop.
pub fn begin(operation_id: Option<&str>, session_id: Option<&str>) -> Option<QueryWatch> {
    let operation_id = operation_id.map(str::trim).filter(|value| !value.is_empty()).map(str::to_string);
    let session_id = session_id.map(str::trim).filter(|value| !value.is_empty()).map(str::to_string);
    if operation_id.is_none() && session_id.is_none() {
        return None;
    }
    let already = operation_id.as_deref().is_some_and(take_early_cancel);
    let (tx, rx) = watch::channel(if already { Halt::Cancelled } else { Halt::None });
    let tx = Arc::new(tx);
    let flight_id = FLIGHT_IDS.fetch_add(1, Ordering::Relaxed);
    if let Some(operation_id) = operation_id.as_deref() {
        if let Ok(mut guard) = OPERATIONS.lock() {
            guard.get_or_insert_with(HashMap::new).insert(
                operation_id.to_string(),
                Flight {
                    id: flight_id,
                    tx: tx.clone(),
                },
            );
        }
    }
    if let Some(session_id) = session_id.as_deref() {
        if let Ok(mut guard) = SESSIONS.lock() {
            guard.get_or_insert_with(HashMap::new).entry(session_id.to_string()).or_default().push(Flight {
                id: flight_id,
                tx: tx.clone(),
            });
        }
    }
    Some(QueryWatch {
        flight_id,
        operation_id,
        session_id,
        rx,
    })
}

pub fn cancel_operation(operation_id: &str) {
    let operation_id = operation_id.trim();
    if operation_id.is_empty() {
        return;
    }
    let found = OPERATIONS.lock().ok().and_then(|guard| {
        guard.as_ref().and_then(|map| map.get(operation_id).map(|flight| flight.tx.clone()))
    });
    if let Some(tx) = found {
        let _ = tx.send(Halt::Cancelled);
        return;
    }
    if let Ok(mut early) = EARLY_CANCEL.lock() {
        if !early.iter().any(|item| item == operation_id) {
            early.push_back(operation_id.to_string());
            while early.len() > 32 {
                early.pop_front();
            }
        }
    }
}

fn take_early_cancel(operation_id: &str) -> bool {
    let Ok(mut early) = EARLY_CANCEL.lock() else {
        return false;
    };
    if let Some(index) = early.iter().position(|item| item == operation_id) {
        early.remove(index);
        return true;
    }
    false
}

pub fn cancel_ssh(session_id: &str) {
    let Ok(guard) = SESSIONS.lock() else {
        return;
    };
    let Some(map) = guard.as_ref() else {
        return;
    };
    if let Some(list) = map.get(session_id) {
        for flight in list {
            let _ = flight.tx.send(Halt::SessionClosed);
        }
    }
}

pub fn halt_error(halt: Halt) -> String {
    match halt {
        Halt::SessionClosed => "ssh session closed".into(),
        Halt::Cancelled | Halt::None => "query cancelled".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn cancel_operation_wakes_the_flight_and_a_second_call_does_not() {
        let watch = begin(Some("op-1"), None).unwrap();
        cancel_operation("op-1");
        assert_eq!(watch.until_halt().await, Halt::Cancelled);
        cancel_operation("op-1");
        drop(watch);
        assert!(begin(Some("op-1"), None).is_some());
    }

    #[test]
    fn cancel_before_begin_starts_the_flight_already_stopped() {
        cancel_operation("op-early");
        let watch = begin(Some("op-early"), None).unwrap();
        assert_eq!(watch.halt(), Halt::Cancelled);
    }
}
