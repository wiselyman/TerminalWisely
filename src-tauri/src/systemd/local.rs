use crate::error::AppResult;

pub fn list_systemd_units() -> AppResult<Vec<String>> {
    #[cfg(not(target_os = "linux"))]
    {
        return Ok(Vec::new());
    }

    #[cfg(target_os = "linux")]
    {
        use std::io::Write;
        use std::process::{Command, Stdio};

        use crate::error::AppError;
        use crate::systemd::{parse_systemd_units, LIST_SYSTEMD_UNITS_SCRIPT};

        let mut child = Command::new("bash")
            .arg("-s")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .spawn()
            .map_err(|e| AppError::msg(format!("无法执行 systemctl: {e}")))?;

        if let Some(mut stdin) = child.stdin.take() {
            stdin
                .write_all(LIST_SYSTEMD_UNITS_SCRIPT.as_bytes())
                .map_err(|e| AppError::msg(e.to_string()))?;
        }

        let output = child
            .wait_with_output()
            .map_err(|e| AppError::msg(e.to_string()))?;

        if !output.status.success() && output.stdout.is_empty() {
            return Ok(Vec::new());
        }

        parse_systemd_units(&String::from_utf8_lossy(&output.stdout))
    }
}
