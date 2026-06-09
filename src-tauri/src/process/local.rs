use std::collections::HashMap;
use std::process::Command;
use std::thread;
use std::time::Duration;

use sysinfo::{ProcessesToUpdate, System};

use crate::error::{AppError, AppResult};
use crate::types::{ProcessEntry, ProcessListResult};

pub fn list_processes() -> AppResult<ProcessListResult> {
    let port_map = listen_ports_by_pid()?;

    let mut sys = System::new();
    sys.refresh_processes(ProcessesToUpdate::All, true);
    thread::sleep(Duration::from_millis(500));
    sys.refresh_cpu_usage();

    let mut processes: Vec<ProcessEntry> = sys
        .processes()
        .iter()
        .map(|(pid, process)| {
            let pid_u32 = pid.as_u32();
            ProcessEntry {
                pid: pid_u32,
                name: process.name().to_string_lossy().into_owned(),
                cpu_percent: process.cpu_usage(),
                memory_bytes: process.memory(),
                ports: port_map.get(&pid_u32).cloned().unwrap_or_default(),
            }
        })
        .collect();

    for entry in &mut processes {
        entry.ports.sort_unstable();
        entry.ports.dedup();
    }

    processes.sort_by(|a, b| b.cpu_percent.total_cmp(&a.cpu_percent));

    Ok(ProcessListResult { processes })
}

pub fn kill_process(pid: u32, force: bool) -> AppResult<()> {
    if pid == 0 {
        return Err(AppError::msg("无效的进程 ID"));
    }

    #[cfg(windows)]
    {
        let mut cmd = Command::new("taskkill");
        cmd.args(["/PID", &pid.to_string()]);
        if force {
            cmd.arg("/F");
        }
        let output = cmd.output().map_err(|e| AppError::msg(e.to_string()))?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(AppError::msg(format!(
            "结束进程失败: {}",
            stderr.trim()
        )));
    }

    #[cfg(not(windows))]
    {
        let signal = if force { "-KILL" } else { "-TERM" };
        let output = Command::new("kill")
            .args([signal, &pid.to_string()])
            .output()
            .map_err(|e| AppError::msg(e.to_string()))?;
        if output.status.success() {
            return Ok(());
        }
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(AppError::msg(format!(
            "结束进程失败: {}",
            stderr.trim()
        )))
    }
}

#[cfg(windows)]
fn listen_ports_by_pid() -> AppResult<HashMap<u32, Vec<u16>>> {
    use netstat2::{
        get_sockets_info, AddressFamilyFlags, ProtocolFlags, ProtocolSocketInfo, TcpState,
    };

    let mut map: HashMap<u32, Vec<u16>> = HashMap::new();
    let af_flags = AddressFamilyFlags::IPV4 | AddressFamilyFlags::IPV6;
    let sockets = get_sockets_info(af_flags, ProtocolFlags::TCP)
        .map_err(|e| AppError::msg(format!("读取 TCP 端口失败: {e}")))?;

    for socket in sockets {
        let ProtocolSocketInfo::Tcp(tcp) = socket.protocol_socket_info else {
            continue;
        };
        if tcp.state != TcpState::Listen {
            continue;
        }
        for pid in socket.associated_pids {
            map.entry(pid).or_default().push(tcp.local_port);
        }
    }

    Ok(map)
}

#[cfg(target_os = "macos")]
fn listen_ports_by_pid() -> AppResult<HashMap<u32, Vec<u16>>> {
    parse_listen_ports_from_command(&["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"])
}

#[cfg(all(unix, not(target_os = "macos")))]
fn listen_ports_by_pid() -> AppResult<HashMap<u32, Vec<u16>>> {
    if let Ok(map) = parse_ss_listen_ports() {
        if !map.is_empty() {
            return Ok(map);
        }
    }
    parse_listen_ports_from_command(&["lsof", "-nP", "-iTCP", "-sTCP:LISTEN", "-F", "pcn"])
}

#[cfg(unix)]
fn parse_ss_listen_ports() -> AppResult<HashMap<u32, Vec<u16>>> {
    let output = Command::new("ss")
        .args(["-H", "-tlnp"])
        .output()
        .map_err(|e| AppError::msg(e.to_string()))?;
    if !output.status.success() {
        return Ok(HashMap::new());
    }

    let mut map: HashMap<u32, Vec<u16>> = HashMap::new();
    let text = String::from_utf8_lossy(&output.stdout);
    for line in text.lines() {
        let Some((pid, port)) = parse_ss_line(line) else {
            continue;
        };
        map.entry(pid).or_default().push(port);
    }
    Ok(map)
}

#[cfg(unix)]
fn parse_ss_line(line: &str) -> Option<(u32, u16)> {
    let pid = line
        .split("pid=")
        .nth(1)?
        .split(|c: char| !c.is_ascii_digit())
        .next()?
        .parse()
        .ok()?;

    let local_field = line.split_whitespace().nth(3)?;
    let port_str = local_field.rsplit(':').next()?;
    let port: u16 = port_str.parse().ok()?;
    Some((pid, port))
}

#[cfg(unix)]
fn parse_listen_ports_from_command(args: &[&str]) -> AppResult<HashMap<u32, Vec<u16>>> {
    let output = Command::new(args[0])
        .args(&args[1..])
        .output()
        .map_err(|e| AppError::msg(e.to_string()))?;
    if !output.status.success() {
        return Ok(HashMap::new());
    }

    let mut map: HashMap<u32, Vec<u16>> = HashMap::new();
    let text = String::from_utf8_lossy(&output.stdout);
    let mut current_pid: Option<u32> = None;

    for line in text.lines() {
        if line.is_empty() {
            continue;
        }
        match line.as_bytes()[0] {
            b'p' => {
                current_pid = line[1..].trim().parse().ok();
            }
            b'n' if line.contains("TCP") && line.contains("LISTEN") => {
                let port = line
                    .split(':')
                    .next_back()
                    .and_then(|value| value.trim().parse().ok());
                if let (Some(pid), Some(port)) = (current_pid, port) {
                    map.entry(pid).or_default().push(port);
                }
            }
            _ => {}
        }
    }

    Ok(map)
}
