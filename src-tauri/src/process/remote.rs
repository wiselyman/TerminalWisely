use std::collections::HashMap;
use std::sync::Arc;

use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::ssh::client::{exec_command, ClientHandler};
use crate::types::{ProcessEntry, ProcessListMode, ProcessListResult};
use russh::client;

/// One `ps` invocation. Rows are parsed in Rust, not with per-line awk.
const PS_LIST_COMMAND: &str = "ps --no-headers -eo pid=,ppid=,pcpu=,rss=,comm= --sort=-pcpu 2>/dev/null | head -n 250 || ps -eo pid=,ppid=,pcpu=,rss=,comm= 2>/dev/null | head -n 250 || true";

/// One `ss` (or `lsof`) plus a pid/ppid table. Parent ports are attached in Rust.
const PORTS_LIST_COMMAND: &str = "ss -H -tlnp 2>/dev/null || lsof -nP -iTCP -sTCP:LISTEN -F pcn 2>/dev/null || true\nprintf '\\n--TW-PPID--\\n'\nps --no-headers -eo pid=,ppid= 2>/dev/null || ps -eo pid=,ppid= 2>/dev/null || true\n";

const PPID_MARK: &str = "--TW-PPID--";

// POSIX/BusyBox fallback for hosts without bash or GNU ps (OpenWrt / Dropbear).
// Delivered via base64 | sh so Dropbear/`ash -c` never mangled heredoc/newlines.
// Emits TSV records; JSON assembly happens in Rust.
// cpu_percent is 0 (no cheap per-process CPU sampling without bash+GNU ps).
const LIST_PROCESSES_BUSYBOX_B64: &str = concat!(
    "cG9ydHNfdG1wPS90bXAvLnR3X3BvcnRzLiQkCm5ldHN0YXQgLXRsbnAgMj4vZGV2L251bGwgfCBh",
    "d2sgJ3sKICBpZiAoJDAgIX4gL0xJU1RFTi8pIG5leHQ7CiAgbiA9IHNwbGl0KCQ0LCBhLCAiOiIp",
    "OyBwb3J0ID0gYVtuXTsKICBpZiAocG9ydCAhfiAvXlswLTldKyQvKSBuZXh0OwogIG0gPSBzcGxp",
    "dCgkTkYsIGIsICIvIik7CiAgaWYgKG0gPj0gMiAmJiBiWzFdIH4gL15bMC05XSskLykgcHJpbnQg",
    "YlsxXSwgcG9ydDsKfScgPiAiJHBvcnRzX3RtcCIgMj4vZGV2L251bGwgfHwgOiA+ICIkcG9ydHNf",
    "dG1wIgpwYWdlX3NpemU9JChnZXRjb25mIFBBR0VTSVpFIDI+L2Rldi9udWxsKQpjYXNlICIkcGFn",
    "ZV9zaXplIiBpbiAnJ3wqWyEwLTldKikgcGFnZV9zaXplPTQwOTYgOzsgZXNhYwplY2hvIFRXUFJP",
    "Q19CRUdJTgpmb3IgZCBpbiAvcHJvYy9bMC05XSo7IGRvCiAgcGlkPSR7ZCMvcHJvYy99CiAgWyAt",
    "ciAiJGQvc3RhdG0iIF0gfHwgY29udGludWUKICBbIC1yICIkZC9zdGF0IiBdIHx8IGNvbnRpbnVl",
    "CiAgY21kbGluZT0kKGNhdCAiJGQvY21kbGluZSIgMj4vZGV2L251bGwgfCB0ciAnXDAwMFwwMTFc",
    "MDEyJyAnICAgJykKICBjb21tPSQoY2F0ICIkZC9jb21tIiAyPi9kZXYvbnVsbCB8IHRyICdcMDEx",
    "XDAxMicgJyAgJykKICBbIC16ICIkY21kbGluZSIgXSAmJiBbIC16ICIkY29tbSIgXSAmJiBjb250",
    "aW51ZQogICMgU2tpcCBrZXJuZWwgdGhyZWFkczogZW1wdHkgY21kbGluZSBhbmQgYnJhY2tldGVk",
    "IGNvbW0gZnJvbSBzdGF0LgogIGlmIFsgLXogIiRjbWRsaW5lIiBdOyB0aGVuCiAgICBjYXNlICIk",
    "Y29tbSIgaW4KICAgICAga3dvcmtlcip8a3NvZnRpcnFkKnxtaWdyYXRpb24qfHJjdV8qfGtzd2Fw",
    "ZCp8a3RocmVhZGQpIGNvbnRpbnVlIDs7CiAgICBlc2FjCiAgZmkKICByc3NfcGFnZXM9JChhd2sg",
    "J3twcmludCAkMn0nICIkZC9zdGF0bSIgMj4vZGV2L251bGwpCiAgY2FzZSAiJHJzc19wYWdlcyIg",
    "aW4gJyd8KlshMC05XSopIGNvbnRpbnVlIDs7IGVzYWMKICBpZiBbIC1uICIkY29tbSIgXTsgdGhl",
    "bgogICAgbmFtZT0kY29tbQogIGVsc2UKICAgIHN0YXRfbGluZT0kKGNhdCAiJGQvc3RhdCIgMj4v",
    "ZGV2L251bGwpCiAgICBuYW1lPSR7c3RhdF9saW5lIyoofQogICAgbmFtZT0ke25hbWUlJSkqfQog",
    "IGZpCiAgbmFtZT0kKHByaW50ZiAnJXMnICIkbmFtZSIgfCB0ciAnXDAxMVwwMTInICcgICcpCiAg",
    "WyAteiAiJG5hbWUiIF0gJiYgY29udGludWUKICBbIC16ICIkY21kbGluZSIgXSAmJiBjbWRsaW5l",
    "PSRuYW1lCiAgbWVtPSQoKHJzc19wYWdlcyAqIHBhZ2Vfc2l6ZSkpCiAgcG9ydHM9JChhd2sgLXYg",
    "cD0iJHBpZCIgJyQxPT1wIHtwcmludCAkMn0nICIkcG9ydHNfdG1wIiAyPi9kZXYvbnVsbCB8IHNv",
    "cnQgLXVuIDI+L2Rldi9udWxsIHwgdHIgJ1wwMTInICcsJykKICBwb3J0cz0ke3BvcnRzJSx9CiAg",
    "cHJpbnRmICdUV1BST0NcdCVzXHQlc1x0JXNcdCVzXHQlc1xuJyAiJHBpZCIgIiRtZW0iICIkcG9y",
    "dHMiICIkbmFtZSIgIiRjbWRsaW5lIgpkb25lCnJtIC1mICIkcG9ydHNfdG1wIiAyPi9kZXYvbnVs",
    "bAplY2hvIFRXUFJPQ19FTkQK",
);

fn busybox_list_command() -> String {
    // Prefer BusyBox `base64 -d`; fall back to GNU `--decode` / openssl.
    format!(
        "echo {b64} | (base64 -d 2>/dev/null || base64 --decode 2>/dev/null || openssl base64 -d -A 2>/dev/null) | sh",
        b64 = LIST_PROCESSES_BUSYBOX_B64
    )
}

fn parse_busybox_process_list(stdout: &str) -> AppResult<ProcessListResult> {
    if !stdout.contains("TWPROC_BEGIN") {
        return Err(AppError::msg(format!(
            "busybox 进程采集无有效输出: {}",
            stdout.trim().chars().take(200).collect::<String>()
        )));
    }
    let mut processes = Vec::new();
    for line in stdout.lines() {
        let Some(rest) = line.strip_prefix("TWPROC\t") else {
            continue;
        };
        let mut fields = rest.splitn(5, '\t');
        let (Some(pid), Some(mem), Some(ports), Some(name), Some(cmdline)) = (
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
            fields.next(),
        ) else {
            continue;
        };
        let Ok(pid) = pid.trim().parse::<u32>() else {
            continue;
        };
        let memory_bytes = mem.trim().parse::<u64>().unwrap_or(0);
        let ports: Vec<u16> = ports
            .split(',')
            .filter_map(|p| p.trim().parse::<u16>().ok())
            .collect();
        processes.push(ProcessEntry {
            pid,
            name: name.trim().to_string(),
            command: Some(cmdline.trim().to_string()),
            cpu_percent: 0.0,
            memory_bytes,
            ports,
        });
    }
    Ok(normalize_processes(processes))
}

fn skip_process_name(name: &str) -> bool {
    let name = name.trim();
    name.is_empty() || name == "?" || name.starts_with('[') || name.starts_with("kworker")
}

fn parse_ps_basic(stdout: &str) -> ProcessListResult {
    let mut processes = Vec::new();
    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(pid) = parts.next().and_then(|s| s.parse::<u32>().ok()) else {
            continue;
        };
        if parts.next().and_then(|s| s.parse::<u32>().ok()).is_none() {
            continue;
        }
        let Some(cpu) = parts.next().and_then(|s| s.parse::<f32>().ok()) else {
            continue;
        };
        let Some(rss_kb) = parts.next().and_then(|s| s.parse::<u64>().ok()) else {
            continue;
        };
        let name = parts.collect::<Vec<_>>().join(" ");
        if skip_process_name(&name) {
            continue;
        }
        processes.push(ProcessEntry {
            pid,
            name,
            command: None,
            cpu_percent: cpu,
            memory_bytes: rss_kb.saturating_mul(1024),
            ports: Vec::new(),
        });
    }
    normalize_processes(processes)
}

fn parse_ss_listen(section: &str) -> Vec<(u32, u16)> {
    let mut found = Vec::new();
    for line in section.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        let mut cols = line.split_whitespace();
        let local = cols.nth(3).unwrap_or("");
        let Some(port) = local
            .rsplit(':')
            .next()
            .and_then(|s| s.parse::<u16>().ok())
            .filter(|port| *port > 0)
        else {
            continue;
        };
        for token in line.split("pid=").skip(1) {
            let digits: String = token.chars().take_while(|c| c.is_ascii_digit()).collect();
            if let Ok(pid) = digits.parse::<u32>() {
                if pid > 0 {
                    found.push((pid, port));
                }
            }
        }
    }
    found
}

fn parse_lsof_listen(section: &str) -> Vec<(u32, u16)> {
    let mut found = Vec::new();
    let mut pid = 0u32;
    for line in section.lines() {
        let line = line.trim();
        if let Some(rest) = line.strip_prefix('p') {
            if rest.chars().all(|c| c.is_ascii_digit()) {
                pid = rest.parse().unwrap_or(0);
                continue;
            }
        }
        if pid == 0 {
            continue;
        }
        let Some(addr) = line.strip_prefix('n') else { continue };
        if !addr.contains("TCP") && !line.contains("LISTEN") && !addr.contains(':') {
            continue;
        }
        let port = addr.rsplit(':').next().unwrap_or("").parse::<u16>().ok();
        if let Some(port) = port.filter(|p| *p > 0) {
            found.push((pid, port));
        }
    }
    found
}

fn is_lsof_section(section: &str) -> bool {
    section.lines().any(|line| {
        let line = line.trim();
        let Some(rest) = line.strip_prefix('p') else {
            return false;
        };
        !rest.is_empty() && rest.chars().all(|c| c.is_ascii_digit())
    })
}

fn parse_ppid_table(section: &str) -> HashMap<u32, u32> {
    let mut map = HashMap::new();
    for line in section.lines() {
        let mut parts = line.split_whitespace();
        let Some(pid) = parts.next().and_then(|s| s.parse::<u32>().ok()) else {
            continue;
        };
        let Some(ppid) = parts.next().and_then(|s| s.parse::<u32>().ok()) else {
            continue;
        };
        map.insert(pid, ppid);
    }
    map
}

fn attach_parent_ports(mut by_pid: HashMap<u32, Vec<u16>>, ppid: &HashMap<u32, u32>) -> HashMap<u32, Vec<u16>> {
    let seeds: Vec<(u32, Vec<u16>)> = by_pid.iter().map(|(pid, ports)| (*pid, ports.clone())).collect();
    for (pid, ports) in seeds {
        let mut parent = ppid.get(&pid).copied();
        let mut depth = 0;
        while let Some(current) = parent {
            if current <= 1 || depth >= 4 {
                break;
            }
            by_pid.entry(current).or_default().extend(ports.iter().copied());
            parent = ppid.get(&current).copied();
            depth += 1;
        }
    }
    by_pid
}

fn parse_ports_output(stdout: &str) -> ProcessListResult {
    let (listen, ppid_section) = stdout
        .split_once(PPID_MARK)
        .unwrap_or((stdout, ""));
    let pairs = if is_lsof_section(listen) {
        parse_lsof_listen(listen)
    } else {
        parse_ss_listen(listen)
    };
    let mut by_pid: HashMap<u32, Vec<u16>> = HashMap::new();
    for (pid, port) in pairs {
        by_pid.entry(pid).or_default().push(port);
    }
    let by_pid = attach_parent_ports(by_pid, &parse_ppid_table(ppid_section));
    let processes = by_pid
        .into_iter()
        .map(|(pid, ports)| ProcessEntry {
            pid,
            name: String::new(),
            command: None,
            cpu_percent: 0.0,
            memory_bytes: 0,
            ports,
        })
        .collect();
    normalize_processes(processes)
}

fn merge_ports(mut base: ProcessListResult, ports: &ProcessListResult) -> ProcessListResult {
    let map: HashMap<u32, Vec<u16>> = ports
        .processes
        .iter()
        .map(|entry| (entry.pid, entry.ports.clone()))
        .collect();
    for entry in &mut base.processes {
        if let Some(ports) = map.get(&entry.pid) {
            entry.ports = ports.clone();
        }
    }
    normalize_processes(base.processes)
}

fn is_kernel_process(entry: &ProcessEntry) -> bool {
    if entry.name.starts_with('[') || entry.name.starts_with("kworker") {
        return true;
    }
    if let Some(command) = &entry.command {
        let trimmed = command.trim();
        if trimmed.starts_with('[') {
            return true;
        }
    }
    false
}

fn normalize_processes(mut processes: Vec<ProcessEntry>) -> ProcessListResult {
    processes.retain(|entry| !is_kernel_process(entry));
    for entry in &mut processes {
        entry.ports.sort_unstable();
        entry.ports.dedup();
    }
    processes.sort_by(|a, b| b.cpu_percent.total_cmp(&a.cpu_percent));
    ProcessListResult { processes }
}

fn map_ssh_exec_error(err: AppError) -> AppError {
    let msg = err.to_string();
    if msg.contains("Channel send error")
        || msg.contains("connection reset")
        || msg.contains("broken pipe")
    {
        AppError::msg("SSH 连接已断开，无法获取进程列表")
    } else {
        err
    }
}

async fn list_processes_ps(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
) -> AppResult<ProcessListResult> {
    match exec_command(handle, PS_LIST_COMMAND).await {
        Ok(stdout) => {
            let result = parse_ps_basic(&stdout);
            if result.processes.is_empty() {
                match list_processes_busybox(handle).await {
                    Ok(fallback) if !fallback.processes.is_empty() => return Ok(fallback),
                    Ok(_) => {}
                    Err(fallback_err) => return Err(fallback_err),
                }
            }
            Ok(result)
        }
        Err(err) => match list_processes_busybox(handle).await {
            Ok(result) => Ok(result),
            Err(fallback_err) => Err(AppError::msg(format!(
                "{}; busybox fallback: {fallback_err}",
                map_ssh_exec_error(err)
            ))),
        },
    }
}

pub async fn list_processes(
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    mode: ProcessListMode,
) -> AppResult<ProcessListResult> {
    match mode {
        ProcessListMode::Basic => list_processes_ps(&handle).await,
        ProcessListMode::Ports => {
            let stdout = exec_command(&handle, PORTS_LIST_COMMAND)
                .await
                .map_err(map_ssh_exec_error)?;
            Ok(parse_ports_output(&stdout))
        }
        ProcessListMode::Full => {
            let base = list_processes_ps(&handle).await?;
            match exec_command(&handle, PORTS_LIST_COMMAND).await {
                Ok(stdout) => Ok(merge_ports(base, &parse_ports_output(&stdout))),
                Err(_) => Ok(base),
            }
        }
    }
}

async fn list_processes_busybox(
    handle: &Arc<Mutex<client::Handle<ClientHandler>>>,
) -> AppResult<ProcessListResult> {
    let stdout = exec_command(handle, &busybox_list_command())
        .await
        .map_err(map_ssh_exec_error)?;
    parse_busybox_process_list(&stdout)
}

pub async fn kill_process(
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    pid: u32,
    force: bool,
) -> AppResult<()> {
    if pid == 0 {
        return Err(AppError::msg("无效的进程 ID"));
    }

    let signal = if force { "-KILL" } else { "-TERM" };
    let cmd = format!("kill {signal} {pid} 2>&1");
    let output = exec_command(&handle, &cmd).await?;
    let trimmed = output.trim();
    if trimmed.is_empty() || trimmed.contains("No such process") {
        return Ok(());
    }
    if trimmed.contains("Operation not permitted") || trimmed.contains("not permitted") {
        return Err(AppError::msg(format!(
            "权限不足，无法结束进程 {pid}: {trimmed}"
        )));
    }
    Err(AppError::msg(format!("结束进程失败: {trimmed}")))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ps_rows_skip_kernel_names_and_scale_rss() {
        let parsed = parse_ps_basic(
            "  10 1 1.5 2048 systemd\n\
             20 2 0.0 4 [kthreadd]\n\
             30 1 9.0 100 kworker/0:1\n\
             40 1 0.2 8 ?\n\
             50 1 3.0 512 python3\n",
        );
        let names: Vec<_> = parsed.processes.iter().map(|p| p.name.as_str()).collect();
        assert!(names.contains(&"systemd"));
        assert!(names.contains(&"python3"));
        assert!(!names.iter().any(|n| n.starts_with('[') || n.starts_with("kworker") || *n == "?"));
        let python = parsed.processes.iter().find(|p| p.pid == 50).unwrap();
        assert_eq!(python.memory_bytes, 512 * 1024);
        assert!((python.cpu_percent - 3.0).abs() < 0.01);
    }

    #[test]
    fn ss_ports_climb_to_the_parent() {
        let stdout = "\
LISTEN 0 128 0.0.0.0:22 0.0.0.0:* users:((\"sshd\",pid=40,fd=3))\n\
LISTEN 0 128 127.0.0.1:8080 0.0.0.0:* users:((\"python\",pid=50,fd=4))\n\
--TW-PPID--\n\
40 10\n\
50 40\n\
10 1\n";
        let parsed = parse_ports_output(stdout);
        let ports = |pid: u32| {
            parsed
                .processes
                .iter()
                .find(|p| p.pid == pid)
                .map(|p| p.ports.clone())
                .unwrap_or_default()
        };
        assert_eq!(ports(50), vec![8080]);
        assert!(ports(40).contains(&22));
        assert!(ports(40).contains(&8080));
        assert!(ports(10).contains(&22));
        assert!(ports(1).is_empty());
    }
}
