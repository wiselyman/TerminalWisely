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
pub struct LocalCreateRequest {
    pub parent: String,
    pub name: String,
    pub kind: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalTextWriteRequest {
    pub path: String,
    pub content: String,
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
    roots.dedup();
    Ok(roots)
}

pub fn list_local_directory(path: Option<String>, show_hidden: bool) -> AppResult<ListLocalDirectoryResult> {
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
        if !show_hidden && name.starts_with('.') {
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

pub fn create_local_path(request: LocalCreateRequest) -> AppResult<String> {
    let name = request.name.trim();
    if name.is_empty() || name == "." || name == ".." || name.contains('/') || name.contains('\\') {
        return Err(AppError::msg("Invalid name"));
    }
    let parent = normalize_path(&request.parent)?;
    let parent = parent.canonicalize().map_err(AppError::from)?;
    if !parent.is_dir() {
        return Err(AppError::msg("Parent is not a directory"));
    }
    let path = parent.join(name);
    match request.kind.as_str() {
        "directory" => std::fs::create_dir(&path).map_err(AppError::from)?,
        "file" => {
            std::fs::OpenOptions::new()
                .write(true)
                .create_new(true)
                .open(&path)
                .map_err(AppError::from)?;
        }
        _ => return Err(AppError::msg("Unsupported entry type")),
    }
    Ok(path_to_string(&path))
}

pub fn read_local_text(request: LocalPathRequest) -> AppResult<String> {
    let path = normalize_path(&request.path)?.canonicalize().map_err(AppError::from)?;
    if !path.is_file() {
        return Err(AppError::msg("Not a file"));
    }
    std::fs::read_to_string(path).map_err(|e| AppError::msg(format!("Cannot read text file: {e}")))
}

pub fn write_local_text(request: LocalTextWriteRequest) -> AppResult<()> {
    let path = normalize_path(&request.path)?;
    if !path.is_file() {
        return Err(AppError::msg("Not a file"));
    }
    std::fs::write(path, request.content).map_err(AppError::from)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_DIR: AtomicUsize = AtomicUsize::new(0);

    fn temp_dir(label: &str) -> PathBuf {
        let id = NEXT_DIR.fetch_add(1, Ordering::Relaxed);
        let path = std::env::temp_dir().join(format!("terminalwisely-{label}-{}-{id}", std::process::id()));
        std::fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn creates_reads_writes_renames_moves_and_deletes_local_files() {
        let root = temp_dir("local-fs-lifecycle");
        let folder = create_local_path(LocalCreateRequest {
            parent: path_to_string(&root),
            name: "资料 folder".into(),
            kind: "directory".into(),
        }).unwrap();
        let file = create_local_path(LocalCreateRequest {
            parent: folder.clone(),
            name: "notes.md".into(),
            kind: "file".into(),
        }).unwrap();
        write_local_text(LocalTextWriteRequest {
            path: file.clone(),
            content: "本机内容".into(),
        }).unwrap();
        assert_eq!(read_local_text(LocalPathRequest { path: file.clone() }).unwrap(), "本机内容");

        let renamed = rename_local_path(LocalRenameRequest {
            path: file,
            new_name: "renamed.md".into(),
        }).unwrap();
        let destination = root.join("destination");
        std::fs::create_dir(&destination).unwrap();
        let moved = move_local_path(LocalMoveRequest {
            path: renamed,
            dest_dir: path_to_string(&destination),
        }).unwrap();
        assert!(Path::new(&moved).is_file());
        delete_local_path(LocalPathRequest { path: moved.clone() }).unwrap();
        assert!(!Path::new(&moved).exists());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn rejects_names_that_escape_the_selected_directory() {
        let root = temp_dir("local-fs-invalid-name");
        let result = create_local_path(LocalCreateRequest {
            parent: path_to_string(&root),
            name: "../outside.txt".into(),
            kind: "file".into(),
        });
        assert!(result.is_err());
        assert_eq!(std::fs::read_dir(&root).unwrap().count(), 0);
        std::fs::remove_dir_all(root).unwrap();
    }
}
