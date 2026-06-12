use std::sync::Arc;

use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::ssh::client::{exec_command, ClientHandler};
use crate::types::{ProcessEntry, ProcessListResult};
use russh::client;

const LIST_PROCESSES_SCRIPT: &str = r#"bash -s <<'TW_LIST_EOF'
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

resolve_listen_pid_for_port() {
  local port=$1 pid=""
  if command -v lsof >/dev/null 2>&1; then
    pid=$(lsof -nP -iTCP:"$port" -sTCP:LISTEN -t 2>/dev/null | head -n1 || true)
  fi
  if [ -z "$pid" ] && command -v fuser >/dev/null 2>&1; then
    pid=$(fuser -n tcp "$port" 2>/dev/null | tr -s ' ' '\n' | grep -E '^[0-9]+$' | head -n1 || true)
  fi
  printf '%s' "$pid"
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

if command -v ss >/dev/null 2>&1; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    pid=$(printf '%s\n' "$line" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p')
    port=$(printf '%s\n' "$line" | awk '{print $4}' | awk -F: '{print $NF}')
    if [ -z "$pid" ] && [ -n "$port" ]; then
      pid=$(resolve_listen_pid_for_port "$port")
    fi
    append_port_pid "$pid" "$port"
  done < <(ss -H -tlnp 2>/dev/null || true)
elif command -v netstat >/dev/null 2>&1; then
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    port=$(printf '%s\n' "$line" | awk '{print $4}' | awk -F: '{print $NF}')
    pid=$(printf '%s\n' "$line" | sed -n 's/.*\/\([0-9][0-9]*\)$/\1/p')
    if [ -z "$pid" ] && [ -n "$port" ]; then
      pid=$(resolve_listen_pid_for_port "$port")
    fi
    append_port_pid "$pid" "$port"
  done < <(netstat -tlnp 2>/dev/null | tail -n +3 || true)
fi

parse_lsof_listen_ports

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

ps --no-headers -eo pid=,pcpu=,rss=,args= 2>/dev/null > "$ps_file" || \
  ps -eo pid=,pcpu=,rss=,args= 2>/dev/null > "$ps_file" || true

printf '['
first=1
while IFS= read -r line; do
  [ -z "$line" ] && continue
  set -- $line
  pid=$1
  pcpu=$2
  rss=$3
  shift 3
  args="$*"
  exe=$(printf '%s' "$args" | awk '{print $1}')
  name=$(basename "$exe" 2>/dev/null || printf '%s' "$exe")
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

pub async fn list_processes(
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
) -> AppResult<ProcessListResult> {
    let stdout = exec_command(&handle, LIST_PROCESSES_SCRIPT).await?;
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(ProcessListResult {
            processes: Vec::new(),
        });
    }

    let mut processes: Vec<ProcessEntry> =
        serde_json::from_str(trimmed).map_err(|err| {
            AppError::msg(format!("解析远程进程列表失败: {err}; 输出: {trimmed}"))
        })?;

    for entry in &mut processes {
        entry.ports.sort_unstable();
        entry.ports.dedup();
    }

    Ok(ProcessListResult { processes })
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
