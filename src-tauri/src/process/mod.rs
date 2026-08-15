mod remote;

pub use remote::{
    kill_process as kill_remote_process, list_processes as list_remote_processes,
};
