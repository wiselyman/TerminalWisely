use std::sync::Arc;

use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::ssh::client::{exec_command, ClientHandler};
use crate::types::{FindEntryKind, FindFileEntry, FindFilesRequest, FindFilesResult, FindTypeFilter};
use russh::client;

const FIND_SCRIPT: &str = r#"bash -s <<'TW_FIND_EOF'
set -eu
path=$TW_FIND_PATH
name=$TW_FIND_NAME
depth=$TW_FIND_DEPTH
type_filter=$TW_FIND_TYPE
case_mode=$TW_FIND_CASE
limit=$TW_FIND_LIMIT

if [ ! -e "$path" ]; then
  echo "TW_FIND_ERROR:路径不存在: $path" >&2
  exit 2
fi

name_flag=-name
if [ "$case_mode" = "1" ]; then
  name_flag=-iname
fi

type_args=""
case "$type_filter" in
  file) type_args="-type f" ;;
  directory) type_args="-type d" ;;
esac

printf '['
first=1
count=0
while IFS= read -r entry; do
  [ -z "$entry" ] && continue
  if [ "$count" -ge "$limit" ]; then
    break
  fi
  if [ -d "$entry" ]; then
    kind="directory"
    size="null"
  else
    kind="file"
    if size_bytes=$(stat -c%s "$entry" 2>/dev/null); then
      size="$size_bytes"
    elif size_bytes=$(stat -f%z "$entry" 2>/dev/null); then
      size="$size_bytes"
    else
      size="null"
    fi
  fi
  esc=${entry//\\/\\\\}
  esc=${esc//\"/\\\"}
  if [ "$first" -eq 0 ]; then printf ','; fi
  if [ "$size" = "null" ]; then
    printf '{"path":"%s","kind":"%s","size_bytes":null}' "$esc" "$kind"
  else
    printf '{"path":"%s","kind":"%s","size_bytes":%s}' "$esc" "$kind" "$size"
  fi
  first=0
  count=$((count + 1))
done < <(find "$path" -maxdepth "$depth" $type_args $name_flag "$name" 2>/dev/null | head -n "$limit")
printf ']\n'
TW_FIND_EOF"#;

fn shell_env_value(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

pub async fn find_files(
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    start_path: &str,
    request: FindFilesRequest,
    max_results: usize,
) -> AppResult<FindFilesResult> {
    let type_filter = match request.type_filter {
        FindTypeFilter::File => "file",
        FindTypeFilter::Directory => "directory",
        FindTypeFilter::All => "all",
    };
    let case_mode = if request.case_insensitive { "1" } else { "0" };

    let command = format!(
        "TW_FIND_PATH={} TW_FIND_NAME={} TW_FIND_DEPTH={} TW_FIND_TYPE={} TW_FIND_CASE={} TW_FIND_LIMIT={} {}",
        shell_env_value(start_path),
        shell_env_value(&request.name_pattern),
        request.max_depth,
        type_filter,
        case_mode,
        max_results,
        FIND_SCRIPT
    );

    let stdout = exec_command(&handle, &command).await?;
    let trimmed = stdout.trim();

    if trimmed.starts_with("TW_FIND_ERROR:") {
        return Err(AppError::msg(trimmed.trim_start_matches("TW_FIND_ERROR:").trim()));
    }

    if trimmed.is_empty() {
        return Ok(FindFilesResult {
            entries: Vec::new(),
            truncated: false,
            start_path: start_path.to_string(),
        });
    }

    let mut entries: Vec<FindFileEntry> =
        serde_json::from_str(trimmed).map_err(|err| {
            AppError::msg(format!("解析 find 结果失败: {err}; 输出: {trimmed}"))
        })?;

    for entry in &mut entries {
        if entry.kind == FindEntryKind::File && entry.size_bytes.is_none() {
            entry.size_bytes = Some(0);
        }
    }

    let truncated = entries.len() >= max_results;

    Ok(FindFilesResult {
        entries,
        truncated,
        start_path: start_path.to_string(),
    })
}
