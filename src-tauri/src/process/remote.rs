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
trap 'rm -f "$ports_file" "$ps_file"' EXIT

if command -v ss >/dev/null 2>&1; then
  ss -H -tlnp 2>/dev/null | while IFS= read -r line; do
    pid=$(printf '%s\n' "$line" | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p')
    port=$(printf '%s\n' "$line" | awk '{for(i=1;i<=NF;i++) if($i ~ /:[0-9]+$/) {split($i,a,":"); print a[2]; exit}}')
    if [ -n "$pid" ] && [ -n "$port" ]; then
      printf '%s %s\n' "$pid" "$port" >> "$ports_file"
    fi
  done
elif command -v netstat >/dev/null 2>&1; then
  netstat -tlnp 2>/dev/null | tail -n +3 | while IFS= read -r line; do
    port=$(printf '%s\n' "$line" | awk '{print $4}' | awk -F: '{print $NF}')
    pid=$(printf '%s\n' "$line" | sed -n 's/.*\/\([0-9][0-9]*\)$/\1/p')
    if [ -n "$pid" ] && [ -n "$port" ]; then
      printf '%s %s\n' "$pid" "$port" >> "$ports_file"
    fi
  done
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
  name=$(basename "$args" 2>/dev/null || printf '%s' "$args")
  name=${name:-?}
  name=${name//\\/\\\\}
  name=${name//\"/\\\"}
  mem=$((rss * 1024))
  ports='[]'
  if [ -f "$ports_file" ]; then
    matched=$(grep -E "^${pid} " "$ports_file" 2>/dev/null | awk '{print $2}' | paste -sd, -)
    if [ -n "$matched" ]; then
      ports="[$matched]"
    fi
  fi
  if [ "$first" -eq 0 ]; then printf ','; fi
  printf '{"pid":%s,"name":"%s","cpu_percent":%s,"memory_bytes":%s,"ports":%s}' \
    "$pid" "$name" "$pcpu" "$mem" "$ports"
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
