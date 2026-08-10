use std::sync::Arc;

use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::ssh::client::{exec_command, ClientHandler};
use crate::types::HostStatsSnapshot;
use russh::client;

// POSIX sh script — must stay BusyBox/ash compatible (OpenWrt, embedded boxes):
// no bash, no [[ ]], no process substitution, no `ps -eo`, no `df -B1`.
const HOST_STATS_SCRIPT: &str = r#"sh -s <<'TW_HOST_STATS_EOF'
read_os_release() {
  if [ -f /etc/os-release ]; then
    . /etc/os-release
    TW_OS_NAME=${PRETTY_NAME:-${NAME:-Linux}}
    TW_OS_VERSION=${VERSION_ID:-}
  else
    TW_OS_NAME=$(uname -s 2>/dev/null || echo Linux)
    TW_OS_VERSION=
  fi
}

meminfo_kb() {
  printf '%s' "$1" | tr -d ' \t' | sed 's/[kK][bB]$//' | grep -E '^[0-9]+$' || echo 0
}

calc_cpu_usage() {
  read -r _ user nice system idle iowait irq softirq steal rest < /proc/stat
  idle1=$((idle + iowait))
  total1=$((user + nice + system + idle + iowait + irq + softirq + steal))
  sleep 0.2 2>/dev/null || sleep 1
  read -r _ user nice system idle iowait irq softirq steal rest < /proc/stat
  idle2=$((idle + iowait))
  total2=$((user + nice + system + idle + iowait + irq + softirq + steal))
  dt=$((total2 - total1))
  didle=$((idle2 - idle1))
  if [ "$dt" -le 0 ]; then
    echo 0
    return
  fi
  awk "BEGIN { printf \"%.1f\", (100.0 * ($dt - $didle) / $dt) }"
}

read_meminfo() {
  mem_total=0
  mem_avail=0
  mem_free=0
  swap_total=0
  swap_free=0
  while IFS=: read -r key value; do
    key=$(echo "$key" | tr -d ' ')
    value=$(meminfo_kb "$value")
    case "$key" in
      MemTotal) mem_total=$value ;;
      MemAvailable) mem_avail=$value ;;
      MemFree) mem_free=$value ;;
      SwapTotal) swap_total=$value ;;
      SwapFree) swap_free=$value ;;
    esac
  done < /proc/meminfo
  if [ "$mem_avail" -eq 0 ] && [ "$mem_free" -gt 0 ]; then
    mem_avail=$mem_free
  fi
  mem_used=$((mem_total - mem_avail))
  if [ "$mem_used" -lt 0 ]; then mem_used=0; fi
  swap_used=$((swap_total - swap_free))
  if [ "$swap_used" -lt 0 ]; then swap_used=0; fi
}

read_loadavg() {
  read -r load1 load5 load15 _ < /proc/loadavg
}

json_escape() {
  printf '%s' "$1" | sed 's/\\/\\\\/g; s/"/\\"/g'
}

read_os_release
TW_HOSTNAME=$(hostname 2>/dev/null || cat /proc/sys/kernel/hostname 2>/dev/null || echo unknown)
TW_KERNEL=$(uname -r 2>/dev/null || echo unknown)
TW_ARCH=$(uname -m 2>/dev/null || echo unknown)
TW_TZ=$(date +%Z 2>/dev/null || echo unknown)
TW_CPU_USAGE=$(calc_cpu_usage)
TW_CPU_USAGE=${TW_CPU_USAGE:-0}
TW_CPU_CORES=$(nproc 2>/dev/null || grep -c '^processor' /proc/cpuinfo 2>/dev/null || echo 1)
TW_CPU_CORES=${TW_CPU_CORES:-1}
read_meminfo
read_loadavg
TW_UPTIME=$(awk '{printf "%d", $1}' /proc/uptime 2>/dev/null || echo 0)
TW_PROCS=$(ls -d /proc/[0-9]* 2>/dev/null | wc -l | tr -d ' ')
TW_PROCS=${TW_PROCS:-0}

printf '{'
printf '"hostname":"%s",' "$(json_escape "$TW_HOSTNAME")"
printf '"os_name":"%s",' "$(json_escape "$TW_OS_NAME")"
if [ -n "$TW_OS_VERSION" ]; then
  printf '"os_version":"%s",' "$(json_escape "$TW_OS_VERSION")"
else
  printf '"os_version":null,'
fi
printf '"kernel_version":"%s",' "$(json_escape "$TW_KERNEL")"
printf '"arch":"%s",' "$(json_escape "$TW_ARCH")"
printf '"timezone":"%s",' "$(json_escape "$TW_TZ")"
printf '"cpu_usage_percent":%s,' "$TW_CPU_USAGE"
printf '"cpu_core_count":%s,' "$TW_CPU_CORES"
printf '"memory_total_bytes":%s,' "$((mem_total * 1024))"
printf '"memory_used_bytes":%s,' "$((mem_used * 1024))"
printf '"swap_total_bytes":%s,' "$((swap_total * 1024))"
printf '"swap_used_bytes":%s,' "$((swap_used * 1024))"
printf '"load_avg":[%s,%s,%s],' "$load1" "$load5" "$load15"
printf '"uptime_secs":%s,' "$TW_UPTIME"
printf '"process_count":%s,' "$TW_PROCS"

printf '"logged_in_users":['
who 2>/dev/null | {
  first=1
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    set -- $line
    user=$1
    term=${2:-}
    host=${3:-}
    host=${host#(}
    host=${host%)}
    login=${4:-}
    if [ -n "${5:-}" ]; then login="$login $5"; fi
    if [ -n "${6:-}" ]; then login="$login $6"; fi
    if [ "$first" -eq 0 ]; then printf ','; fi
    printf '{"username":"%s",' "$(json_escape "$user")"
    if [ -n "$term" ]; then printf '"terminal":"%s",' "$(json_escape "$term")"; else printf '"terminal":null,'; fi
    if [ -n "$host" ]; then printf '"host":"%s",' "$(json_escape "$host")"; else printf '"host":null,'; fi
    if [ -n "$login" ]; then printf '"login_time":"%s"}' "$(json_escape "$login")"; else printf '"login_time":null}'; fi
    first=0
  done
}
printf '],'

printf '"disks":['
{ df -kP 2>/dev/null || df -k 2>/dev/null; } | tail -n +2 | {
  first=1
  while IFS= read -r line; do
    [ -z "$line" ] && continue
    set -- $line
    fs=$1
    total=$2
    used=$3
    mount=$6
    case "$total" in ''|*[!0-9]*) continue ;; esac
    case "$used" in ''|*[!0-9]*) continue ;; esac
    if [ "$total" -le 0 ]; then continue; fi
    if [ "$first" -eq 0 ]; then printf ','; fi
    printf '{"mount_point":"%s","filesystem":"%s","total_bytes":%s,"used_bytes":%s}' \
      "$(json_escape "$mount")" "$(json_escape "$fs")" "$((total * 1024))" "$((used * 1024))"
    first=0
  done
}
printf '],'

printf '"networks":['
awk 'NR>2 {print}' /proc/net/dev 2>/dev/null | {
  first=1
  while IFS= read -r line; do
    iface=$(echo "$line" | awk '{print $1}' | tr -d ':')
    [ "$iface" = "lo" ] && continue
    rx=$(echo "$line" | awk '{print $2}')
    tx=$(echo "$line" | awk '{print $10}')
    [ -z "$rx" ] && continue
    if [ "$first" -eq 0 ]; then printf ','; fi
    printf '{"name":"%s","rx_bytes":%s,"tx_bytes":%s}' "$(json_escape "$iface")" "$rx" "$tx"
    first=0
  done
}
printf '],'

TW_DISK_READ_BYTES=0
TW_DISK_WRITE_BYTES=0
while read -r major minor name rio rmerge rsect ruse wio wmerge wsect rest; do
  case "$name" in
    loop*|ram*|fd*) continue ;;
    nvme*p*) continue ;;
    [shv]d[a-z][0-9]*) continue ;;
    xvd[a-z][0-9]*) continue ;;
    mmcblk*p*) continue ;;
  esac
  case "$rsect" in ''|*[!0-9]*) continue ;; esac
  case "$wsect" in ''|*[!0-9]*) continue ;; esac
  TW_DISK_READ_BYTES=$((TW_DISK_READ_BYTES + rsect * 512))
  TW_DISK_WRITE_BYTES=$((TW_DISK_WRITE_BYTES + wsect * 512))
done < /proc/diskstats 2>/dev/null

printf '"disk_io":{"read_bytes":%s,"write_bytes":%s},' "$TW_DISK_READ_BYTES" "$TW_DISK_WRITE_BYTES"

printf '"sampled_at":%s' "$(($(date +%s)*1000))"
printf '}\n'
TW_HOST_STATS_EOF"#;

fn extract_json_payload(stdout: &str) -> &str {
    let trimmed = stdout.trim();
    if let Some(start) = trimmed.find('{') {
        if let Some(end) = trimmed.rfind('}') {
            return &trimmed[start..=end];
        }
    }
    trimmed
}

pub async fn collect(
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
) -> AppResult<HostStatsSnapshot> {
    let stdout = exec_command(&handle, HOST_STATS_SCRIPT).await?;
    let payload = extract_json_payload(&stdout);
    if payload.is_empty() {
        return Err(AppError::msg("远程主机资源采集无输出"));
    }

    serde_json::from_str(payload).map_err(|err| {
        AppError::msg(format!("解析远程主机资源失败: {err}; 输出: {payload}"))
    })
}
