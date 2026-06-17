use std::path::Path;
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::types::{FindEntryKind, FindFileEntry, FindFilesRequest, FindFilesResult, FindTypeFilter};

pub fn find_files(
    bash_exe: &str,
    start_path: &str,
    request: FindFilesRequest,
    max_results: usize,
) -> AppResult<FindFilesResult> {
    let mut parts = vec![
        "find".to_string(),
        crate::shell::shell_quote_remote_path(start_path).to_string(),
        "-maxdepth".to_string(),
        request.max_depth.to_string(),
    ];
    match request.type_filter {
        FindTypeFilter::File => {
            parts.push("-type".to_string());
            parts.push("f".to_string());
        }
        FindTypeFilter::Directory => {
            parts.push("-type".to_string());
            parts.push("d".to_string());
        }
        FindTypeFilter::All => {}
    }
    parts.push(if request.case_insensitive {
        "-iname".to_string()
    } else {
        "-name".to_string()
    });
    parts.push(crate::shell::shell_quote_remote_path(&request.name_pattern));

    let script = parts.join(" ");
    let output = Command::new(bash_exe)
        .args(["-lc", &script])
        .output()
        .map_err(|err| AppError::msg(format!("无法执行 find: {err}")))?;

    if !output.status.success() && !output.status.code().is_some_and(|code| code == 1) {
        let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
        if stderr.is_empty() {
            return Err(AppError::msg("find 命令执行失败"));
        }
        return Err(AppError::msg(stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();
    let mut truncated = false;

    for line in stdout.lines() {
        let path = line.trim();
        if path.is_empty() {
            continue;
        }
        if entries.len() >= max_results {
            truncated = true;
            break;
        }
        let kind = if request.type_filter == FindTypeFilter::Directory {
            FindEntryKind::Directory
        } else if path.ends_with('/') {
            FindEntryKind::Directory
        } else {
            FindEntryKind::File
        };
        let size_bytes = if kind == FindEntryKind::File {
            crate::msys::metadata(Path::new(bash_exe), path)
                .ok()
                .map(|(_, size)| size)
        } else {
            None
        };
        entries.push(FindFileEntry {
            path: path.to_string(),
            kind,
            size_bytes,
        });
    }

    Ok(FindFilesResult {
        entries,
        truncated,
        start_path: start_path.to_string(),
    })
}
