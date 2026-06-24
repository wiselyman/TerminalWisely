mod local;
mod remote;

pub use local::list_passwd_accounts as list_local_passwd_accounts;
pub use remote::list_passwd_accounts as list_remote_passwd_accounts;

pub(crate) const LIST_PASSWD_ACCOUNTS_SCRIPT: &str = r#"bash -s <<'TW_PASSWD_EOF'
set -eu
json_escape() {
  local s=$1
  s=${s//\\/\\\\}
  s=${s//\"/\\\"}
  s=${s//$'\n'/ }
  s=${s//$'\r'/}
  printf '%s' "$s"
}
read_passwd() {
  if command -v getent >/dev/null 2>&1; then
    getent passwd 2>/dev/null || true
  elif [ -r /etc/passwd ]; then
    cat /etc/passwd
  fi
}
read_group() {
  if command -v getent >/dev/null 2>&1; then
    getent group 2>/dev/null || true
  elif [ -r /etc/group ]; then
    cat /etc/group
  fi
}
printf '{"users":['
first=1
while IFS=: read -r name _ uid gid gecos home shell; do
  [ -z "${name:-}" ] && continue
  esc_name=$(json_escape "$name")
  esc_gecos=$(json_escape "${gecos:-}")
  if [ "$first" -eq 0 ]; then printf ','; fi
  printf '{"name":"%s","uid":%s,"description":"%s"}' "$esc_name" "${uid:-0}" "$esc_gecos"
  first=0
done < <(read_passwd | head -n 800)
printf '],"groups":['
first=1
while IFS=: read -r name _ gid members; do
  [ -z "${name:-}" ] && continue
  esc_name=$(json_escape "$name")
  if [ "$first" -eq 0 ]; then printf ','; fi
  printf '{"name":"%s","gid":%s}' "$esc_name" "${gid:-0}"
  first=0
done < <(read_group | head -n 800)
printf ']}\n'
TW_PASSWD_EOF"#;

pub(crate) fn parse_passwd_accounts(
    stdout: &str,
) -> crate::error::AppResult<crate::types::PasswdAccountsResult> {
    let trimmed = stdout.trim();
    if trimmed.is_empty() {
        return Ok(crate::types::PasswdAccountsResult {
            users: Vec::new(),
            groups: Vec::new(),
        });
    }
    serde_json::from_str(trimmed)
        .map_err(|err| crate::error::AppError::msg(format!("解析用户/用户组列表失败: {err}")))
}
