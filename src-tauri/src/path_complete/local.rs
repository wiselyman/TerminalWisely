use std::fs;
use std::path::Path;

use crate::error::{AppError, AppResult};
use crate::path_complete::{build_completions, split_path_prefix};

pub fn complete_local_path(
    dir_part: &str,
    prefix: &str,
    cwd: &str,
    home: &str,
) -> AppResult<Vec<String>> {
    let resolved_dir = crate::shell::resolve_directory_path(dir_part, home, cwd);
    let path = Path::new(&resolved_dir);
    if !path.is_dir() {
        return Ok(Vec::new());
    }

    let entries = fs::read_dir(path)
        .map_err(|e| AppError::msg(format!("无法读取目录: {e}")))?
        .filter_map(|entry| {
            let entry = entry.ok()?;
            let name = entry.file_name().to_string_lossy().into_owned();
            let is_dir = entry.file_type().ok()?.is_dir();
            Some((name, is_dir))
        })
        .collect::<Vec<_>>();

    Ok(build_completions(dir_part, &entries, prefix))
}

pub fn complete_local_path_from_partial(
    partial: &str,
    cwd: &str,
    home: &str,
) -> AppResult<Vec<String>> {
    let (dir_part, prefix) = split_path_prefix(partial);
    complete_local_path(&dir_part, &prefix, cwd, home)
}
