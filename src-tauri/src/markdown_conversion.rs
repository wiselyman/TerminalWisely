use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::Duration;

const MAX_OUTPUT_BYTES: usize = 32 * 1024 * 1024;
static ACTIVE_CONVERSIONS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> = OnceLock::new();

fn conversions() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    ACTIVE_CONVERSIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

pub fn register_conversion(id: &str) -> Result<Arc<AtomicBool>, String> {
    if id.is_empty() || id.len() > 128 {
        return Err("Invalid conversion identifier.".into());
    }
    let mut active = conversions()
        .lock()
        .map_err(|_| "Conversion registry is unavailable.")?;
    if active.contains_key(id) {
        return Err("Conversion identifier is already active.".into());
    }
    let token = Arc::new(AtomicBool::new(false));
    active.insert(id.to_string(), token.clone());
    Ok(token)
}

pub fn cancel_conversion(id: &str) -> bool {
    let Ok(active) = conversions().lock() else {
        return false;
    };
    let Some(token) = active.get(id) else {
        return false;
    };
    token.store(true, Ordering::SeqCst);
    true
}

pub fn finish_conversion(id: &str) {
    if let Ok(mut active) = conversions().lock() {
        active.remove(id);
    }
}

pub fn find_pandoc() -> Option<PathBuf> {
    let path_key = if cfg!(windows) { "Path" } else { "PATH" };
    let search = std::env::var_os(path_key)?;
    let names: &[&str] = if cfg!(windows) {
        &["pandoc.exe", "pandoc.cmd", "pandoc"]
    } else {
        &["pandoc"]
    };
    std::env::split_paths(&search)
        .flat_map(|directory| names.iter().map(move |name| directory.join(name)))
        .find(|candidate| candidate.is_file())
}

fn valid_format(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value.bytes().enumerate().all(|(index, byte)| {
            byte.is_ascii_alphanumeric() || (index > 0 && matches!(byte, b'+' | b'_' | b'.' | b'-'))
        })
}

pub fn list_formats() -> Vec<String> {
    let Some(executable) = find_pandoc() else {
        return Vec::new();
    };
    let Ok(output) = Command::new(executable)
        .arg("--list-output-formats")
        .output()
    else {
        return Vec::new();
    };
    if !output.status.success() || output.stdout.len() > 1024 * 1024 {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|format| valid_format(format))
        .map(str::to_string)
        .collect()
}

pub fn list_input_formats() -> Vec<String> {
    let Some(executable) = find_pandoc() else {
        return Vec::new();
    };
    let Ok(output) = Command::new(executable)
        .arg("--list-input-formats")
        .output()
    else {
        return Vec::new();
    };
    if !output.status.success() || output.stdout.len() > 1024 * 1024 {
        return Vec::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .map(str::trim)
        .filter(|format| valid_format(format))
        .map(str::to_string)
        .collect()
}

fn read_bounded<R: Read>(mut reader: R) -> std::io::Result<(Vec<u8>, bool)> {
    let mut kept = Vec::new();
    let mut chunk = [0_u8; 8192];
    let mut overflow = false;
    loop {
        let count = reader.read(&mut chunk)?;
        if count == 0 {
            break;
        }
        let available = MAX_OUTPUT_BYTES.saturating_sub(kept.len());
        let copy_count = count.min(available);
        kept.extend_from_slice(&chunk[..copy_count]);
        overflow |= copy_count < count;
    }
    Ok((kept, overflow))
}

pub fn convert(id: &str, from: &str, to: &str, input: &str) -> Result<String, String> {
    if !valid_format(from) || !valid_format(to) {
        return Err("Invalid Pandoc format name.".into());
    }
    if input.len() > MAX_OUTPUT_BYTES {
        return Err("Document exceeds the conversion size limit.".into());
    }
    let token = register_conversion(id)?;
    let result = (|| {
        let executable = find_pandoc().ok_or_else(|| "Pandoc is unavailable.".to_string())?;
        convert_with(
            &executable,
            from,
            to,
            Some(input.as_bytes()),
            None,
            token.as_ref(),
        )
    })();
    finish_conversion(id);
    result
}

pub fn import_file(id: &str, from: &str, path: &Path) -> Result<String, String> {
    if !valid_format(from) {
        return Err("Invalid Pandoc format name.".into());
    }
    let metadata =
        std::fs::metadata(path).map_err(|error| format!("Unable to read import file: {error}"))?;
    if !metadata.is_file() {
        return Err("The selected import path is not a file.".into());
    }
    if metadata.len() as usize > MAX_OUTPUT_BYTES {
        return Err("Document exceeds the conversion size limit.".into());
    }
    let token = register_conversion(id)?;
    let result = (|| {
        let executable = find_pandoc().ok_or_else(|| "Pandoc is unavailable.".to_string())?;
        convert_with(
            &executable,
            from,
            "markdown",
            None,
            Some(path),
            token.as_ref(),
        )
    })();
    finish_conversion(id);
    result
}

fn convert_with(
    executable: &Path,
    from: &str,
    to: &str,
    input: Option<&[u8]>,
    source_path: Option<&Path>,
    cancelled: &AtomicBool,
) -> Result<String, String> {
    let mut command = Command::new(executable);
    command
        .args([
            format!("--from={from}"),
            format!("--to={to}"),
            "--output=-".into(),
        ])
        .stdin(if input.is_some() {
            Stdio::piped()
        } else {
            Stdio::null()
        })
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    if let Some(path) = source_path {
        command.arg(path);
    }
    let mut child = command
        .spawn()
        .map_err(|error| format!("Unable to start Pandoc: {error}"))?;

    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Unable to read Pandoc output.".to_string())?;
    let stderr = child
        .stderr
        .take()
        .ok_or_else(|| "Unable to read Pandoc errors.".to_string())?;
    let stdout_reader = thread::spawn(move || read_bounded(stdout));
    let stderr_reader = thread::spawn(move || read_bounded(stderr));
    if let Some(input) = input {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "Unable to send input to Pandoc.".to_string())?;
        if let Err(error) = stdin.write_all(input) {
            let _ = child.kill();
            let _ = child.wait();
            return Err(format!("Unable to send input to Pandoc: {error}"));
        }
        drop(stdin);
    }

    let status = loop {
        if cancelled.load(Ordering::SeqCst) {
            let _ = child.kill();
            let _ = child.wait();
            let _ = stdout_reader.join();
            let _ = stderr_reader.join();
            return Err("Conversion cancelled.".into());
        }
        if let Some(status) = child
            .try_wait()
            .map_err(|error| format!("Unable to wait for Pandoc: {error}"))?
        {
            break status;
        }
        thread::sleep(Duration::from_millis(40));
    };
    let (stdout, stdout_overflow) = stdout_reader
        .join()
        .map_err(|_| "Pandoc output reader failed.".to_string())?
        .map_err(|error| format!("Unable to read Pandoc output: {error}"))?;
    let (stderr, stderr_overflow) = stderr_reader
        .join()
        .map_err(|_| "Pandoc error reader failed.".to_string())?
        .map_err(|error| format!("Unable to read Pandoc errors: {error}"))?;
    if stdout_overflow || stderr_overflow {
        return Err("Pandoc output exceeds the conversion size limit.".into());
    }
    if !status.success() {
        let message = String::from_utf8_lossy(&stderr).trim().to_string();
        return Err(if message.is_empty() {
            format!("Pandoc exited with status {status}.")
        } else {
            message
        });
    }
    let output = String::from_utf8(stdout)
        .map_err(|_| "Pandoc returned invalid UTF-8 output.".to_string())?;
    if output.contains('\0') {
        return Err("Pandoc returned invalid document output.".into());
    }
    Ok(output)
}

#[cfg(test)]
mod tests {
    use super::{valid_format, MAX_OUTPUT_BYTES};
    use std::io::Write;
    use std::process::Stdio;

    #[test]
    fn accepts_format_labels_but_rejects_argument_injection() {
        assert!(valid_format("markdown+raw_html"));
        assert!(valid_format("docx"));
        assert!(!valid_format("--lua=evil.lua"));
        assert!(!valid_format("html;rm"));
        assert!(!valid_format(&"a".repeat(65)));
    }

    #[test]
    fn conversion_limit_is_bounded() {
        assert_eq!(MAX_OUTPUT_BYTES, 32 * 1024 * 1024);
    }

    #[test]
    fn cancellation_registry_signals_and_removes_running_conversions() {
        let token = super::register_conversion("unit-cancel-test").unwrap();
        assert!(super::cancel_conversion("unit-cancel-test"));
        assert!(token.load(std::sync::atomic::Ordering::SeqCst));
        super::finish_conversion("unit-cancel-test");
        assert!(!super::cancel_conversion("unit-cancel-test"));
    }

    #[test]
    fn installed_pandoc_converts_markdown_and_imports_a_docx_file() {
        let Some(executable) = super::find_pandoc() else {
            return;
        };
        let markdown = "# Live Pandoc import\n\nA paragraph.";
        let path = std::env::temp_dir().join(format!(
            "terminal-wisely-pandoc-{}-{}.docx",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let mut child = std::process::Command::new(&executable)
            .args(["--from=markdown", "--to=docx"])
            .arg(format!("--output={}", path.display()))
            .stdin(Stdio::piped())
            .spawn()
            .unwrap();
        child
            .stdin
            .take()
            .unwrap()
            .write_all(markdown.as_bytes())
            .unwrap();
        assert!(child.wait().unwrap().success());

        let imported = super::import_file("live-pandoc-import", "docx", &path).unwrap();
        let _ = std::fs::remove_file(path);
        assert!(imported.contains("Live Pandoc import"));
        assert!(
            super::convert("live-pandoc-export", "markdown", "html", markdown)
                .unwrap()
                .contains("<h1")
        );
    }
}
