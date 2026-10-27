use sysinfo::{Pid, ProcessesToUpdate, Signal, System};

use crate::error::{AppError, AppResult};
use crate::types::{ProcessEntry, ProcessListResult};

pub fn list_local_processes() -> AppResult<ProcessListResult> {
    let mut system = System::new_all();
    system.refresh_all();
    let mut processes = system
        .processes()
        .iter()
        .map(|(pid, process)| ProcessEntry {
            pid: pid.as_u32(),
            name: process.name().to_string_lossy().into_owned(),
            command: Some(
                process
                    .cmd()
                    .iter()
                    .map(|part| part.to_string_lossy())
                    .collect::<Vec<_>>()
                    .join(" "),
            ),
            cpu_percent: process.cpu_usage(),
            memory_bytes: process.memory(),
            ports: Vec::new(),
        })
        .collect::<Vec<_>>();
    processes.sort_by(|a, b| b.cpu_percent.total_cmp(&a.cpu_percent));
    Ok(ProcessListResult { processes })
}

pub fn kill_local_process(pid: u32, force: bool) -> AppResult<()> {
    let pid = Pid::from_u32(pid);
    let mut system = System::new();
    system.refresh_processes(ProcessesToUpdate::Some(&[pid]), true);
    let process = system
        .process(pid)
        .ok_or_else(|| AppError::msg(format!("Process {pid} no longer exists")))?;
    #[cfg(windows)]
    let killed = {
        let _ = force;
        process.kill()
    };
    #[cfg(not(windows))]
    let killed = if force {
        process.kill()
    } else {
        process.kill_with(Signal::Term).unwrap_or(false)
    };
    if !killed {
        return Err(AppError::msg(format!("Unable to stop process {pid}")));
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::process::{Child, Command, Stdio};

    use super::{kill_local_process, list_local_processes};

    fn spawn_fixture() -> Child {
        #[cfg(unix)]
        let mut command = Command::new("sleep");
        #[cfg(windows)]
        let mut command = Command::new("ping");
        #[cfg(unix)]
        command.arg("60");
        #[cfg(windows)]
        command.args(["127.0.0.1", "-t"]);
        command.stdout(Stdio::null()).stderr(Stdio::null()).spawn().unwrap()
    }

    #[test]
    fn lists_running_processes_with_identity_and_metrics() {
        let process = spawn_fixture();
        let result = list_local_processes().unwrap();
        let row = result.processes.iter().find(|row| row.pid == process.id()).unwrap();
        assert!(!row.name.is_empty());
        assert!(!row.command.as_deref().unwrap_or_default().is_empty());
        assert!(row.memory_bytes > 0);
        assert!(row.ports.is_empty());
        drop(process);
    }

    #[test]
    fn kills_only_the_requested_process_and_rejects_missing_pid() {
        let mut target = spawn_fixture();
        let mut other = spawn_fixture();
        kill_local_process(target.id(), false).unwrap();
        assert!(target.wait().unwrap().success() || target.try_wait().unwrap().is_some());
        assert!(other.try_wait().unwrap().is_none());
        let _ = kill_local_process(u32::MAX, false).unwrap_err();
        kill_local_process(other.id(), true).unwrap();
        let _ = other.wait();
    }
}
