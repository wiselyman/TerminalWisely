mod local;
mod remote;

pub use local::{kill_process as kill_local_process, list_processes as list_local_processes};
pub use remote::{kill_process as kill_remote_process, list_processes as list_remote_processes};
