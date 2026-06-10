use std::process::Command;
use std::thread;
use std::time::Duration;

use chrono::Local;
use sysinfo::{Disks, Networks, ProcessesToUpdate, System};

use crate::error::{AppError, AppResult};
use crate::types::{
    DiskUsageEntry, HostStatsSnapshot, LoggedInUser, NetworkCounter,
};

pub fn collect() -> AppResult<HostStatsSnapshot> {
    let mut sys = System::new_all();
    sys.refresh_all();
    thread::sleep(Duration::from_millis(500));
    sys.refresh_cpu_usage();

    let cpu_core_count = sys.cpus().len().max(1) as u32;
    let cpu_usage_percent = if sys.cpus().is_empty() {
        0.0
    } else {
        sys.cpus()
            .iter()
            .map(|cpu| cpu.cpu_usage())
            .sum::<f32>()
            / sys.cpus().len() as f32
    };

    let memory_total_bytes = sys.total_memory();
    let memory_used_bytes = sys.used_memory();
    let swap_total_bytes = sys.total_swap();
    let swap_used_bytes = sys.used_swap();

    let load = System::load_average();
    let load_avg = [load.one, load.five, load.fifteen];

    let hostname = System::host_name().unwrap_or_else(|| "localhost".to_string());
    let os_name = System::name().unwrap_or_else(|| "Unknown".to_string());
    let os_version = System::long_os_version();
    let kernel_version = System::kernel_version();
    let arch = System::cpu_arch();

    let timezone = Local::now().offset().to_string().into();

    sys.refresh_processes(ProcessesToUpdate::All, true);
    let process_count = sys.processes().len() as u32;

    let disks = collect_disks();
    let networks = collect_networks();
    let logged_in_users = collect_logged_in_users()?;

    Ok(HostStatsSnapshot {
        hostname,
        os_name,
        os_version,
        kernel_version,
        arch,
        timezone,
        cpu_usage_percent,
        cpu_core_count,
        memory_total_bytes,
        memory_used_bytes,
        swap_total_bytes,
        swap_used_bytes,
        load_avg,
        uptime_secs: System::uptime(),
        process_count,
        logged_in_users,
        disks,
        networks,
        sampled_at: chrono::Utc::now().timestamp_millis(),
    })
}

fn collect_disks() -> Vec<DiskUsageEntry> {
    let disks = Disks::new_with_refreshed_list();
    disks
        .list()
        .iter()
        .map(|disk| {
            let total = disk.total_space();
            let available = disk.available_space();
            let used = total.saturating_sub(available);
            DiskUsageEntry {
                mount_point: disk.mount_point().to_string_lossy().into_owned(),
                filesystem: Some(disk.file_system().to_string_lossy().into_owned()),
                total_bytes: total,
                used_bytes: used,
            }
        })
        .filter(|disk| disk.total_bytes > 0)
        .collect()
}

fn collect_networks() -> Vec<NetworkCounter> {
    let networks = Networks::new_with_refreshed_list();
    networks
        .iter()
        .filter(|(name, _)| !is_loopback(name))
        .map(|(name, data)| NetworkCounter {
            name: name.clone(),
            rx_bytes: data.total_received(),
            tx_bytes: data.total_transmitted(),
        })
        .collect()
}

fn is_loopback(name: &str) -> bool {
    let lower = name.to_ascii_lowercase();
    lower == "lo" || lower.starts_with("loopback")
}

fn collect_logged_in_users() -> AppResult<Vec<LoggedInUser>> {
    #[cfg(windows)]
    {
        return parse_windows_users();
    }
    #[cfg(not(windows))]
    {
        parse_unix_who()
    }
}

#[cfg(not(windows))]
fn parse_unix_who() -> AppResult<Vec<LoggedInUser>> {
    let output = Command::new("who")
        .output()
        .map_err(|err| AppError::msg(format!("无法执行 who: {err}")))?;
    if !output.status.success() {
        return Ok(Vec::new());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let users = text
        .lines()
        .filter_map(parse_who_line)
        .collect();
    Ok(users)
}

#[cfg(not(windows))]
fn parse_who_line(line: &str) -> Option<LoggedInUser> {
    let trimmed = line.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parts: Vec<&str> = trimmed.split_whitespace().collect();
    if parts.is_empty() {
        return None;
    }
    Some(LoggedInUser {
        username: parts[0].to_string(),
        terminal: parts.get(1).map(|s| s.to_string()),
        host: parts.get(2).map(|s| s.trim_start_matches('(').trim_end_matches(')').to_string()),
        login_time: if parts.len() >= 4 {
            Some(parts[3..].join(" "))
        } else {
            None
        },
    })
}

#[cfg(windows)]
fn parse_windows_users() -> AppResult<Vec<LoggedInUser>> {
    let output = Command::new("query")
        .args(["user"])
        .output()
        .map_err(|err| AppError::msg(format!("无法执行 query user: {err}")))?;
    if !output.status.success() {
        return Ok(Vec::new());
    }

    let text = String::from_utf8_lossy(&output.stdout);
    let mut users = Vec::new();
    for line in text.lines().skip(1) {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }
        let username = trimmed.split_whitespace().next().unwrap_or("").to_string();
        if username.is_empty() || username == "USERNAME" {
            continue;
        }
        users.push(LoggedInUser {
            username,
            terminal: None,
            host: None,
            login_time: None,
        });
    }
    Ok(users)
}
