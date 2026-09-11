use std::path::{Component, Path, PathBuf};
use std::time::UNIX_EPOCH;

use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum LocalEntryKind {
    File,
    Directory,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalFsEntry {
    pub name: String,
    pub path: String,
    pub kind: LocalEntryKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListLocalDirectoryResult {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    pub entries: Vec<LocalFsEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalPathRequest {
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalRenameRequest {
    pub path: String,
    pub new_name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalMoveRequest {
    pub path: String,
    pub dest_dir: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalPathSizeResult {
    pub path: String,
    pub kind: String,
    pub size_bytes: u64,
}

fn path_to_string(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn normalize_path(path: &str) -> AppResult<PathBuf> {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return default_start_path().map(PathBuf::from);
    }
    let p = PathBuf::from(trimmed);
    if p.components().any(|c| matches!(c, Component::ParentDir)) {
        return Err(AppError::msg("Invalid path"));
    }
    Ok(p)
}

pub fn default_start_path() -> AppResult<String> {
    dirs::home_dir()
        .map(|p| path_to_string(p.as_path()))
        .ok_or_else(|| AppError::msg("Home directory not found"))
}

pub fn list_local_roots() -> AppResult<Vec<String>> {
    let mut roots = Vec::new();
    if let Ok(home) = default_start_path() {
        roots.push(home);
    }
    #[cfg(windows)]
    {
        for letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", letter as char);
            if Path::new(&drive).exists() {
                roots.push(drive);
            }
        }
    }
    #[cfg(not(windows))]
    {
        roots.push("/".to_string());
    }
    roots.sort();
    roots.dedup();
    Ok(roots)
}

pub fn list_local_directory(path: Option<String>) -> AppResult<ListLocalDirectoryResult> {
    let dir = match path {
        Some(p) => normalize_path(&p)?,
        None => PathBuf::from(default_start_path()?),
    };
    let canonical = dir
        .canonicalize()
        .map_err(|e| AppError::msg(format!("Cannot read directory: {e}")))?;
    if !canonical.is_dir() {
        return Err(AppError::msg("Not a directory"));
    }

    let parent = canonical.parent().map(path_to_string);

    let mut entries = Vec::new();
    let read = std::fs::read_dir(&canonical)
        .map_err(|e| AppError::msg(format!("Cannot read directory: {e}")))?;
    for item in read {
        let item = item.map_err(|e| AppError::msg(format!("Read dir entry failed: {e}")))?;
        let meta = item.metadata().ok();
        let entry_path = item.path();
        let name = item.file_name().to_string_lossy().into_owned();
        if name.starts_with('.') {
            continue;
        }
        let kind = match meta.as_ref().map(|m| m.is_dir()) {
            Some(true) => LocalEntryKind::Directory,
            Some(false) => LocalEntryKind::File,
            None => LocalEntryKind::Other,
        };
        let size_bytes = meta
            .as_ref()
            .filter(|m| m.is_file())
            .map(|m| m.len());
        let modified_ms = meta.and_then(|m| {
            m.modified()
                .ok()
                .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64)
        });
        entries.push(LocalFsEntry {
            name,
            path: path_to_string(&entry_path),
            kind,
            size_bytes,
            modified_ms,
        });
    }

    entries.sort_by(|a, b| {
        use LocalEntryKind::*;
        let rank = |k: &LocalEntryKind| match k {
            Directory => 0,
            File => 1,
            Other => 2,
        };
        rank(&a.kind)
            .cmp(&rank(&b.kind))
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });

    Ok(ListLocalDirectoryResult {
        path: path_to_string(&canonical),
        parent,
        entries,
    })
}

pub fn rename_local_path(request: LocalRenameRequest) -> AppResult<String> {
    let src = PathBuf::from(&request.path);
    let new_name = request.new_name.trim();
    if new_name.is_empty() || new_name.contains('/') || new_name.contains('\\') {
        return Err(AppError::msg("Invalid name"));
    }
    let parent = src
        .parent()
        .ok_or_else(|| AppError::msg("Invalid path"))?;
    let dest = parent.join(new_name);
    std::fs::rename(&src, &dest).map_err(AppError::from)?;
    Ok(path_to_string(&dest))
}

pub fn move_local_path(request: LocalMoveRequest) -> AppResult<String> {
    let src = PathBuf::from(&request.path);
    let dest_dir = PathBuf::from(&request.dest_dir);
    if !dest_dir.is_dir() {
        return Err(AppError::msg("Destination is not a directory"));
    }
    let file_name = src
        .file_name()
        .ok_or_else(|| AppError::msg("Invalid source path"))?;
    let dest = dest_dir.join(file_name);
    std::fs::rename(&src, &dest).map_err(AppError::from)?;
    Ok(path_to_string(&dest))
}

pub fn delete_local_path(request: LocalPathRequest) -> AppResult<()> {
    let path = PathBuf::from(&request.path);
    let meta = std::fs::metadata(&path).map_err(AppError::from)?;
    if meta.is_dir() {
        std::fs::remove_dir_all(&path).map_err(AppError::from)?;
    } else {
        std::fs::remove_file(&path).map_err(AppError::from)?;
    }
    Ok(())
}

fn dir_size_recursive(path: &Path, total: &mut u64) -> AppResult<()> {
    if path.is_symlink() {
        return Ok(());
    }
    if path.is_file() {
        *total = total.saturating_add(std::fs::metadata(path)?.len());
        return Ok(());
    }
    if !path.is_dir() {
        return Ok(());
    }
    for entry in std::fs::read_dir(path).map_err(AppError::from)? {
        let entry = entry.map_err(AppError::from)?;
        dir_size_recursive(&entry.path(), total)?;
    }
    Ok(())
}

pub fn get_local_path_size(request: LocalPathRequest) -> AppResult<LocalPathSizeResult> {
    let path = PathBuf::from(&request.path);
    let meta = std::fs::metadata(&path).map_err(AppError::from)?;
    if meta.is_file() {
        return Ok(LocalPathSizeResult {
            path: request.path,
            kind: "file".to_string(),
            size_bytes: meta.len(),
        });
    }
    if meta.is_dir() {
        let mut total = 0u64;
        dir_size_recursive(&path, &mut total)?;
        return Ok(LocalPathSizeResult {
            path: request.path,
            kind: "directory".to_string(),
            size_bytes: total,
        });
    }
    Err(AppError::msg("Unsupported path type"))
}
