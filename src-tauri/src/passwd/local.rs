use crate::error::AppResult;

pub fn list_passwd_accounts() -> AppResult<crate::types::PasswdAccountsResult> {
    #[cfg(not(target_os = "linux"))]
    {
        return Ok(crate::types::PasswdAccountsResult {
            users: Vec::new(),
            groups: Vec::new(),
        });
    }

    #[cfg(target_os = "linux")]
    {
        use std::io::Write;
        use std::process::{Command, Stdio};

        use crate::error::AppError;
        use crate::passwd::{parse_passwd_accounts, LIST_PASSWD_ACCOUNTS_SCRIPT};

        let mut child = Command::new("bash")
            .arg("-s")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| AppError::msg(format!("无法读取用户列表: {e}")))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(LIST_PASSWD_ACCOUNTS_SCRIPT.as_bytes())
                .map_err(|e| AppError::msg(e.to_string()))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| AppError::msg(e.to_string()))?;

        if !output.status.success() && output.stdout.is_empty() {
            return Ok(crate::types::PasswdAccountsResult {
                users: Vec::new(),
                groups: Vec::new(),
            });
        }

        parse_passwd_accounts(&String::from_utf8_lossy(&output.stdout))
    }
}
