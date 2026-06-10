use std::path::{Path, PathBuf};
use std::process::Command;

use crate::error::{AppError, AppResult};
use crate::types::{FindEntryKind, FindFileEntry, FindFilesRequest, FindFilesResult, FindTypeFilter};

pub fn find_files(
    start_path: &str,
    request: FindFilesRequest,
    max_results: usize,
) -> AppResult<FindFilesResult> {
    let resolved = resolve_local_start_path(start_path, &request.path)?;
    if !resolved.exists() {
        return Err(AppError::msg(format!("路径不存在: {}", request.path)));
    }

    let mut command = Command::new("find");
    command.arg(&resolved);
    command.arg("-maxdepth").arg(request.max_depth.to_string());
    match request.type_filter {
        FindTypeFilter::File => {
            command.arg("-type").arg("f");
        }
        FindTypeFilter::Directory => {
            command.arg("-type").arg("d");
        }
        FindTypeFilter::All => {}
    }
    if request.case_insensitive {
        command.arg("-iname");
    } else {
        command.arg("-name");
    }
    command.arg(&request.name_pattern);

    let output = command
        .output()
        .map_err(|err| AppError::msg(format!("无法执行 find 命令: {err}")))?;

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
        let path_buf = PathBuf::from(path);
        let kind = if path_buf.is_dir() {
            FindEntryKind::Directory
        } else {
            FindEntryKind::File
        };
        let size_bytes = if kind == FindEntryKind::File {
            std::fs::metadata(&path_buf).ok().map(|meta| meta.len())
        } else {
            None
        };
        entries.push(FindFileEntry {
            path: path.to_string(),
            kind,
            size_bytes,
        });
        if entries.len() >= max_results {
            truncated = true;
            break;
        }
    }

    Ok(FindFilesResult {
        entries,
        truncated,
        start_path: resolved.to_string_lossy().to_string(),
    })
}

fn resolve_local_start_path(session_start: &str, user_path: &str) -> AppResult<PathBuf> {
    let trimmed = user_path.trim();
    let base = if trimmed == "." || trimmed.is_empty() {
        PathBuf::from(session_start)
    } else if trimmed == "~" {
        dirs::home_dir().ok_or_else(|| AppError::msg("无法解析用户目录"))?
    } else if trimmed.starts_with("~/") {
        let home = dirs::home_dir().ok_or_else(|| AppError::msg("无法解析用户目录"))?;
        home.join(trimmed.trim_start_matches("~/"))
    } else if Path::new(trimmed).is_absolute() {
        PathBuf::from(trimmed)
    } else {
        PathBuf::from(session_start).join(trimmed)
    };

    Ok(base)
}
