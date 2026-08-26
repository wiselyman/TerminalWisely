mod remote;

pub use remote::list_systemd_units as list_remote_systemd_units;

pub(crate) const LIST_SYSTEMD_UNITS_SCRIPT: &str = r#"bash -s <<'TW_SYSTEMD_EOF'
set -eu
if ! command -v systemctl >/dev/null 2>&1; then
  printf '[]\n'
  exit 0
fi
tmp=$(mktemp)
trap 'rm -f "$tmp"' EXIT
{
  systemctl list-unit-files --type=service --no-pager --no-legend 2>/dev/null | awk '{print $1}'
  systemctl list-units --type=service --all --no-pager --no-legend 2>/dev/null | awk '{print $1}'
} | sed 's/\.service$//' | grep -v '^$' | sort -u | head -n 500 > "$tmp"
printf '['
first=1
while IFS= read -r unit; do
  [ -z "$unit" ] && continue
  esc=${unit//\\/\\\\}
  esc=${esc//\"/\\\"}
  if [ "$first" -eq 0 ]; then printf ','; fi
  printf '"%s"' "$esc"
  first=0
done < "$tmp"
printf ']\n'
TW_SYSTEMD_EOF"#;

pub(crate) fn parse_systemd_units(stdout: &str) -> crate::error::AppResult<Vec<String>> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    serde_json::from_str(trimmed)
        .map_err(|err| crate::error::AppError::msg(format!("解析 systemd 单元列表失败: {err}")))
}
