use std::sync::Arc;

use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::ssh::client::{exec_command, ClientHandler};
use crate::types::{ProcessEntry, ProcessListMode, ProcessListResult};
use russh::client;

const LIST_PROCESSES_BASIC_SCRIPT: &str = r#"bash --noprofile --norc -s <<'TW_BASIC_EOF'
set -eu
ps_file=$(mktemp)
trap 'rm -f "$ps_file"' EXIT
ps --no-headers -eo pid=,pcpu=,rss=,comm= --sort=-pcpu 2>/dev/null | head -n 250 > "$ps_file" || \
  ps -eo pid=,pcpu=,rss=,comm= --sort=-pcpu 2>/dev/null | head -n 250 > "$ps_file" || true
printf '['
first=1
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pid=$(printf '%s\n' "$line" | awk '{print $1}')
  pcpu=$(printf '%s\n' "$line" | awk '{print $2}')
  rss=$(printf '%s\n' "$line" | awk '{print $3}')
  comm=$(printf '%s\n' "$line" | awk '{print $4}')
  case "$comm" in ""|"?"|\[*|kworker*) continue ;; esac
  name=${comm//\\/\\\\}
  name=${name//\"/\\\"}
  mem=$((rss * 1024))
  if [ "$first" -eq 0 ]; then printf ','; fi
  printf '{"pid":%s,"name":"%s","cpu_percent":%s,"memory_bytes":%s,"ports":[]}' \
    "$pid" "$name" "$pcpu" "$mem"
  first=0
done < "$ps_file"
printf ']\n'
TW_BASIC_EOF"#;

const LIST_PROCESS_PORTS_SCRIPT: &str = r#"bash --noprofile --norc -s <<'TW_PORTS_EOF'
set -eu
ports_file=$(mktemp)
ps_file=$(mktemp)
orphan_ports=$(mktemp)
trap 'rm -f "$ports_file" "$ps_file" "$orphan_ports"' EXIT

append_port_pid() {
  local pid=$1 port=$2
  if [ -n "$pid" ] && [ -n "$port" ] && [ "$port" -gt 0 ] 2>/dev/null; then
    printf '%s %s\n' "$pid" "$port" >> "$ports_file"
  fi
}

parse_lsof_listen_ports() {
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  local current_pid=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
      p*) current_pid=${line#p} ;;
      n*)
        case "$line" in
          *TCP*LISTEN*)
            local port=${line##*:}
            append_port_pid "$current_pid" "$port"
            ;;
        esac
        ;;
    esac
  done < <(lsof -nP -iTCP -sTCP:LISTEN -F pcn 2>/dev/null || true)
}

parse_lsof_listen_ports

if command -v ss >/dev/null 2>&1; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    pid=$(printf '%s\n' "$line" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p')
    port=$(printf '%s\n' "$line" | awk '{print $4}' | awk -F: '{print $NF}')
    [ -n "$pid" ] && append_port_pid "$pid" "$port"
  done < <(ss -H -tlnp 2>/dev/null || true)
elif command -v netstat >/dev/null 2>&1; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    port=$(printf '%s\n' "$line" | awk '{print $4}' | awk -F: '{print $NF}')
    pid=$(printf '%s\n' "$line" | sed -n 's/.*\/\([0-9][0-9]*\)$/\1/p')
    [ -n "$pid" ] && append_port_pid "$pid" "$port"
  done < <(netstat -tlnp 2>/dev/null | tail -n +3 || true)
fi

if command -v ss >/dev/null 2>&1; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    pid=$(printf '%s\n' "$line" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p')
    port=$(printf '%s\n' "$line" | awk '{print $4}' | awk -F: '{print $NF}')
    if [ -z "$pid" ] && [ -n "$port" ] && [ "$port" -gt 0 ] 2>/dev/null; then
      printf '%s\n' "$port" >> "$orphan_ports"
    fi
  done < <(ss -H -tlnp 2>/dev/null || true)
fi
sort -u "$orphan_ports" -o "$orphan_ports" 2>/dev/null || true

if [ -s "$ports_file" ]; then
  propagated=$(mktemp)
  cp "$ports_file" "$propagated"
  while read -r pid port; do
    [ -z "$pid" ] && continue
    parent=$(
      awk '/^PPid:/ {print $2; exit}' "/proc/$pid/status" 2>/dev/null || true
    )
    depth=0
    while [ -n "$parent" ] && [ "$parent" -gt 1 ] 2>/dev/null && [ "$depth" -lt 4 ]; do
      printf '%s %s\n' "$parent" "$port" >> "$propagated"
      parent=$(
        awk '/^PPid:/ {print $2; exit}' "/proc/$parent/status" 2>/dev/null || true
      )
      depth=$((depth + 1))
    done
  done < "$ports_file"
  sort -u "$propagated" -o "$ports_file"
  rm -f "$propagated"
fi

ps --no-headers -eo pid=,pcpu=,rss=,comm=,args= 2>/dev/null > "$ps_file" || \
  ps -eo pid=,pcpu=,rss=,comm=,args= 2>/dev/null > "$ps_file" || true

printf '['
first=1
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pid=$(printf '%s\n' "$line" | awk '{print $1}')
  args=$(printf '%s\n' "$line" | awk '{$1=$2=$3=$4=""; sub(/^[ \t]+/, ""); print}')
  exe=$(printf '%s\n' "$args" | awk '{print $1}')
  case "$exe" in \[*) continue ;; esac
  ports_list=""
  add_port() {
    local p=$1
    [ -z "$p" ] && return 0
    case ",$ports_list," in
      *,"$p",*) ;;
      *)
        if [ -z "$ports_list" ]; then ports_list="$p"; else ports_list="$ports_list,$p"; fi
        ;;
    esac
  }
  while read -r hinted_port; do
    [ -n "$hinted_port" ] && add_port "$hinted_port"
  done < <(printf '%s' "$args" | awk '{
    for (i = 1; i <= NF; i++) {
      if ($i ~ /^(--port|--listen-port|-p)=[0-9]+$/) {
        split($i, parts, "=");
        print parts[2];
      } else if ($i ~ /^(--port|--listen-port|-p)$/ && i < NF && $(i + 1) ~ /^[0-9]+$/) {
        print $(i + 1);
      }
    }
  }')
  if [ -f "$ports_file" ]; then
    while read -r listen_port; do
      [ -n "$listen_port" ] && add_port "$listen_port"
    done < <(grep -E "^${pid} " "$ports_file" 2>/dev/null | awk '{print $2}' || true)
  fi
  if [ -s "$orphan_ports" ]; then
    while read -r orphan_port; do
      [ -z "$orphan_port" ] && continue
      if printf '%s' "$args" | grep -qE "(^|[[:space:]])(--port|--listen-port|-p)(=${orphan_port}| ${orphan_port})([^0-9]|$)"; then
        add_port "$orphan_port"
      fi
    done < "$orphan_ports"
  fi
  if [ -n "$ports_list" ]; then
    ports="[$ports_list]"
  else
    ports='[]'
  fi
  if [ "$ports" = '[]' ]; then
    continue
  fi
  if [ "$first" -eq 0 ]; then printf ','; fi
  printf '{"pid":%s,"name":"","cpu_percent":0,"memory_bytes":0,"ports":%s}' "$pid" "$ports"
  first=0
done < "$ps_file"
printf ']\n'
TW_PORTS_EOF"#;

const LIST_PROCESSES_SCRIPT: &str = r#"bash --noprofile --norc -s <<'TW_LIST_EOF'
set -eu
ports_file=$(mktemp)
ps_file=$(mktemp)
orphan_ports=$(mktemp)
trap 'rm -f "$ports_file" "$ps_file" "$orphan_ports"' EXIT

append_port_pid() {
  local pid=$1 port=$2
  if [ -n "$pid" ] && [ -n "$port" ] && [ "$port" -gt 0 ] 2>/dev/null; then
    printf '%s %s\n' "$pid" "$port" >> "$ports_file"
  fi
}

parse_lsof_listen_ports() {
  if ! command -v lsof >/dev/null 2>&1; then
    return 0
  fi
  local current_pid=""
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    case "$line" in
      p*) current_pid=${line#p} ;;
      n*)
        case "$line" in
          *TCP*LISTEN*)
            local port=${line##*:}
            append_port_pid "$current_pid" "$port"
            ;;
        esac
        ;;
    esac
  done < <(lsof -nP -iTCP -sTCP:LISTEN -F pcn 2>/dev/null || true)
}

parse_lsof_listen_ports

if command -v ss >/dev/null 2>&1; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    pid=$(printf '%s\n' "$line" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p')
    port=$(printf '%s\n' "$line" | awk '{print $4}' | awk -F: '{print $NF}')
    [ -n "$pid" ] && append_port_pid "$pid" "$port"
  done < <(ss -H -tlnp 2>/dev/null || true)
elif command -v netstat >/dev/null 2>&1; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    port=$(printf '%s\n' "$line" | awk '{print $4}' | awk -F: '{print $NF}')
    pid=$(printf '%s\n' "$line" | sed -n 's/.*\/\([0-9][0-9]*\)$/\1/p')
    [ -n "$pid" ] && append_port_pid "$pid" "$port"
  done < <(netstat -tlnp 2>/dev/null | tail -n +3 || true)
fi

if command -v ss >/dev/null 2>&1; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    pid=$(printf '%s\n' "$line" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p')
    port=$(printf '%s\n' "$line" | awk '{print $4}' | awk -F: '{print $NF}')
    if [ -z "$pid" ] && [ -n "$port" ] && [ "$port" -gt 0 ] 2>/dev/null; then
      printf '%s\n' "$port" >> "$orphan_ports"
    fi
  done < <(ss -H -tlnp 2>/dev/null || true)
fi
sort -u "$orphan_ports" -o "$orphan_ports" 2>/dev/null || true

if [ -s "$ports_file" ]; then
  propagated=$(mktemp)
  cp "$ports_file" "$propagated"
  while read -r pid port; do
    [ -z "$pid" ] && continue
    parent=$(
      awk '/^PPid:/ {print $2; exit}' "/proc/$pid/status" 2>/dev/null || true
    )
    depth=0
    while [ -n "$parent" ] && [ "$parent" -gt 1 ] 2>/dev/null && [ "$depth" -lt 4 ]; do
      printf '%s %s\n' "$parent" "$port" >> "$propagated"
      parent=$(
        awk '/^PPid:/ {print $2; exit}' "/proc/$parent/status" 2>/dev/null || true
      )
      depth=$((depth + 1))
    done
  done < "$ports_file"
  sort -u "$propagated" -o "$ports_file"
  rm -f "$propagated"
fi

ps --no-headers -eo pid=,pcpu=,rss=,comm=,args= 2>/dev/null > "$ps_file" || \
  ps -eo pid=,pcpu=,rss=,comm=,args= 2>/dev/null > "$ps_file" || true

printf '['
first=1
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pid=$(printf '%s\n' "$line" | awk '{print $1}')
  pcpu=$(printf '%s\n' "$line" | awk '{print $2}')
  rss=$(printf '%s\n' "$line" | awk '{print $3}')
  comm=$(printf '%s\n' "$line" | awk '{print $4}')
  args=$(printf '%s\n' "$line" | awk '{$1=$2=$3=$4=""; sub(/^[ \t]+/, ""); print}')
  exe=$(printf '%s\n' "$args" | awk '{print $1}')
  case "$exe" in \[*) continue ;; esac
  case "$comm" in \[*|kworker*) continue ;; esac
  if [ -n "$comm" ] && [ "$comm" != "?" ]; then
    name=$comm
  else
    name=$(basename "$exe" 2>/dev/null || printf '%s' "$exe")
  fi
  name=${name:-?}
  name=${name//\\/\\\\}
  name=${name//\"/\\\"}
  command=${args//\\/\\\\}
  command=${command//\"/\\\"}
  mem=$((rss * 1024))
  ports_list=""
  add_port() {
    local p=$1
    [ -z "$p" ] && return 0
    case ",$ports_list," in
      *,"$p",*) ;;
      *)
        if [ -z "$ports_list" ]; then ports_list="$p"; else ports_list="$ports_list,$p"; fi
        ;;
    esac
  }
  if [ -f "$ports_file" ]; then
    while read -r listen_port; do
      [ -n "$listen_port" ] && add_port "$listen_port"
    done < <(grep -E "^${pid} " "$ports_file" 2>/dev/null | awk '{print $2}' || true)
  fi
  while read -r hinted_port; do
    [ -n "$hinted_port" ] && add_port "$hinted_port"
  done < <(printf '%s' "$args" | awk '{
    for (i = 1; i <= NF; i++) {
      if ($i ~ /^(--port|--listen-port|-p)=[0-9]+$/) {
        split($i, parts, "=");
        print parts[2];
      } else if ($i ~ /^(--port|--listen-port|-p)$/ && i < NF && $(i + 1) ~ /^[0-9]+$/) {
        print $(i + 1);
      }
    }
  }')
  if [ -s "$orphan_ports" ]; then
    while read -r orphan_port; do
      [ -z "$orphan_port" ] && continue
      if printf '%s' "$args" | grep -qE "(^|[[:space:]])(--port|--listen-port|-p)(=${orphan_port}| ${orphan_port})([^0-9]|$)"; then
        add_port "$orphan_port"
      fi
    done < "$orphan_ports"
  fi
  if [ -n "$ports_list" ]; then
    ports="[$ports_list]"
  else
    ports='[]'
  fi
  if [ "$first" -eq 0 ]; then printf ','; fi
  printf '{"pid":%s,"name":"%s","command":"%s","cpu_percent":%s,"memory_bytes":%s,"ports":%s}' \
    "$pid" "$name" "$command" "$pcpu" "$mem" "$ports"
  first=0
done < "$ps_file"
printf ']\n'
TW_LIST_EOF"#;

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

fn extract_json_array(stdout: &str) -> Option<&str> {
    let trimmed = stdout.trim();
    let start = trimmed.find('[')?;
    let end = trimmed.rfind(']')?;
    if end < start {
        return None;
    }
    Some(&trimmed[start..=end])
}

fn parse_process_list(stdout: &str, context: &str) -> AppResult<ProcessListResult> {
    let payload = extract_json_array(stdout).unwrap_or(stdout.trim());
    if payload.is_empty() {
        return Ok(ProcessListResult {
            processes: Vec::new(),
        });
    }

    let processes: Vec<ProcessEntry> = serde_json::from_str(payload)
        .map_err(|err| AppError::msg(format!("{context}: {err}; 输出: {payload}")))?;

    Ok(normalize_processes(processes))
}

pub async fn list_processes(
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    mode: ProcessListMode,
) -> AppResult<ProcessListResult> {
    let script = match mode {
        ProcessListMode::Basic => LIST_PROCESSES_BASIC_SCRIPT,
        ProcessListMode::Ports => LIST_PROCESS_PORTS_SCRIPT,
        ProcessListMode::Full => LIST_PROCESSES_SCRIPT,
    };
    let allow_busybox_fallback = !matches!(mode, ProcessListMode::Ports);

    match exec_command(&handle, script).await {
        Ok(stdout) => {
            let result = parse_process_list(&stdout, "解析远程进程列表失败")?;
            // bash exists but GNU ps flags unsupported → empty list; retry via /proc.
            if allow_busybox_fallback && result.processes.is_empty() {
                match list_processes_busybox(&handle).await {
                    Ok(fallback) if !fallback.processes.is_empty() => return Ok(fallback),
                    Ok(_) => {}
                    Err(fallback_err) => {
                        // Prefer busybox error — more actionable on OpenWrt-class hosts.
                        return Err(fallback_err);
                    }
                }
            }
            Ok(result)
        }
        // No bash on host (BusyBox/ash, e.g. OpenWrt) → POSIX fallback.
        Err(err) => {
            if !allow_busybox_fallback {
                return Err(map_ssh_exec_error(err));
            }
            match list_processes_busybox(&handle).await {
                Ok(result) => Ok(result),
                Err(fallback_err) => Err(AppError::msg(format!(
                    "{}; busybox fallback: {fallback_err}",
                    map_ssh_exec_error(err)
                ))),
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
