use std::sync::Arc;

use russh::client;
use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::session::SessionManager;
use crate::shell::shell_quote_remote_path;
use crate::ssh::client::exec_command_capture;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum RemoteEntryKind {
    File,
    Directory,
    Other,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteFsEntry {
    pub name: String,
    pub path: String,
    pub kind: RemoteEntryKind,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified_ms: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub permissions: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub owner: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub group: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListRemoteDirectoryResult {
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent: Option<String>,
    pub entries: Vec<RemoteFsEntry>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListRemoteDirectoryRequest {
    pub session_id: String,
    pub path: Option<String>,
    #[serde(default)]
    pub show_hidden: bool,
}

#[derive(Debug, Clone)]
pub struct RemoteDirEntry {
    pub name: String,
    pub is_dir: bool,
    pub size_bytes: Option<u64>,
    pub modified_ms: Option<i64>,
    pub permissions: Option<String>,
    pub owner: Option<String>,
    pub group: Option<String>,
}

/// List a remote directory via the existing SSH connection (same path as `ls`, no SFTP handshake).
pub async fn list_remote_directory_entries(
    handle: &Arc<Mutex<client::Handle<crate::ssh::client::ClientHandler>>>,
    resolved: &str,
    show_hidden: bool,
) -> AppResult<Vec<RemoteDirEntry>> {
    let quoted = shell_quote_remote_path(resolved);
    let find_filter = if show_hidden {
        String::new()
    } else {
        "! -name '.*' ".to_string()
    };
    // One-shot GNU find: -xtype follows symlinks for type only (symlink→dir → d).
    // Skip `find --version` (extra RTT). Fall back to fast ls without per-file stat.
    let command = format!(
        r#"DIR={quoted}
test -d "$DIR" || {{ echo "Not a directory" >&2; exit 1; }}
if find "$DIR" -mindepth 1 -maxdepth 1 {find_filter}\( -xtype d -printf 'd\0%M\0%u\0%g\0\0%T@\0%f\0' -o ! -xtype d -printf 'f\0%M\0%u\0%g\0%s\0%T@\0%f\0' \) 2>/dev/null; then
  :
else
  ls -1A "$DIR" 2>/dev/null | while IFS= read -r name || [ -n "$name" ]; do
    [ -z "$name" ] && continue
    {hide}
    if [ -d "$DIR/$name" ]; then
      printf 'd\t0\t%s\n' "$name"
    else
      printf 'f\t0\t%s\n' "$name"
    fi
  done
fi"#,
        hide = if show_hidden {
            ""
        } else {
            r#"case "$name" in .*) continue ;; esac
"#
        }
    );

    let (stdout, stderr, code) = exec_command_capture(handle, &command, None).await?;
    if code != 0 {
        let detail = if !stderr.trim().is_empty() {
            stderr.trim()
        } else {
            stdout.trim()
        };
        return Err(AppError::msg(if detail.is_empty() {
            "Failed to list directory".to_string()
        } else {
            detail.to_string()
        }));
    }

    Ok(parse_directory_listing(&stdout))
}

pub async fn list_remote_directory(
    sessions: &SessionManager,
    request: ListRemoteDirectoryRequest,
) -> AppResult<ListRemoteDirectoryResult> {
    let ssh = sessions.ssh_snapshot(&request.session_id).await?;
    let resolved = match request.path.as_deref() {
        Some(path) if !path.trim().is_empty() => ssh.resolve_remote_path(path).await?,
        _ => ssh.resolve_remote_path(".").await?,
    };

    let parent = remote_parent_path(&resolved).ok();
    let raw = list_remote_directory_entries(&ssh.handle(), &resolved, request.show_hidden).await?;

    let mut entries = Vec::new();
    for item in raw {
        let kind = if item.is_dir {
            RemoteEntryKind::Directory
        } else {
            RemoteEntryKind::File
        };
        entries.push(RemoteFsEntry {
            name: item.name.clone(),
            path: remote_join_path(&resolved, &item.name),
            kind,
            size_bytes: item.size_bytes,
            modified_ms: item.modified_ms,
            permissions: item.permissions,
            owner: item.owner,
            group: item.group,
        });
    }

    entries.sort_by_cached_key(|e| {
        use RemoteEntryKind::*;
        let rank: u8 = match e.kind {
            Directory => 0,
            File => 1,
            Other => 2,
        };
        (rank, e.name.to_lowercase())
    });

    Ok(ListRemoteDirectoryResult {
        path: resolved,
        parent,
        entries,
    })
}

fn parse_directory_listing(stdout: &str) -> Vec<RemoteDirEntry> {
    if stdout.contains('\0') {
        return parse_metadata_listing(stdout);
    }
    let mut entries = Vec::new();
    for line in stdout.lines() {
        let line = line.trim_end_matches('\r');
        if line.is_empty() {
            continue;
        }
        let Some(entry) = parse_directory_listing_line(line) else {
            continue;
        };
        entries.push(entry);
    }
    entries
}

fn parse_directory_listing_line(line: &str) -> Option<RemoteDirEntry> {
    let mut parts = line.splitn(3, '\t');
    let kind = parts.next()?;
    let size_raw = parts.next()?;
    let name = parts.next()?.to_string();
    if name.is_empty() || name == "." || name == ".." {
        return None;
    }
    // GNU find %Y follows symlinks (symlink → directory reports as "d").
    let is_dir = kind == "d";
    let size_bytes = if is_dir {
        None
    } else {
        size_raw.parse::<u64>().ok()
    };
    Some(RemoteDirEntry {
        name,
        is_dir,
        size_bytes,
        modified_ms: None,
        permissions: None,
        owner: None,
        group: None,
    })
}

fn parse_metadata_listing(stdout: &str) -> Vec<RemoteDirEntry> {
    let fields: Vec<&str> = stdout.split('\0').collect();
    fields
        .chunks_exact(7)
        .filter_map(|record| {
            let kind = record[0];
            let name = record[6];
            if name.is_empty() || name == "." || name == ".." {
                return None;
            }
            let is_dir = kind == "d";
            let modified_ms = record[5]
                .parse::<f64>()
                .ok()
                .filter(|seconds| seconds.is_finite())
                .map(|seconds| (seconds * 1000.0).round() as i64);
            Some(RemoteDirEntry {
                name: name.to_string(),
                is_dir,
                size_bytes: if is_dir { None } else { record[4].parse().ok() },
                modified_ms,
                permissions: non_empty(record[1]),
                owner: non_empty(record[2]),
                group: non_empty(record[3]),
            })
        })
        .collect()
}

fn non_empty(value: &str) -> Option<String> {
    (!value.is_empty()).then(|| value.to_string())
}

fn remote_parent_path(path: &str) -> AppResult<String> {
    let trimmed = path.trim_end_matches('/');
    if trimmed.is_empty() || trimmed == "/" {
        return Err(AppError::msg("At filesystem root"));
    }
    if let Some((parent, _)) = trimmed.rsplit_once('/') {
        Ok(if parent.is_empty() {
            "/".to_string()
        } else {
            parent.to_string()
        })
    } else {
        Err(AppError::msg("Invalid path"))
    }
}

fn remote_join_path(base: &str, segment: &str) -> String {
    format!(
        "{}/{}",
        base.trim_end_matches('/'),
        segment.trim_matches('/')
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_gnu_find_lines() {
        let out = "d\t4096\tlab\nf\t1234\treadme.txt\n";
        let entries = parse_directory_listing(out);
        assert_eq!(entries.len(), 2);
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "lab");
        assert!(!entries[1].is_dir);
        assert_eq!(entries[1].size_bytes, Some(1234));
    }

    #[test]
    fn parses_metadata_records_and_preserves_spaces_and_tabs_in_names() {
        let out = concat!(
            "d\0drwxr-x---\0alice\0staff\00\01729700000.125\0folder with\ttab\0",
            "f\0-rw-r-----\0bob\0users\0123\01729700001.5\0file name.txt\0",
        );
        let entries = parse_directory_listing(out);
        assert_eq!(entries.len(), 2);
        assert_eq!(entries[0].name, "folder with\ttab");
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].permissions.as_deref(), Some("drwxr-x---"));
        assert_eq!(entries[0].owner.as_deref(), Some("alice"));
        assert_eq!(entries[0].group.as_deref(), Some("staff"));
        assert_eq!(entries[0].modified_ms, Some(1_729_700_000_125));
        assert_eq!(entries[1].name, "file name.txt");
        assert_eq!(entries[1].size_bytes, Some(123));
        assert_eq!(entries[1].modified_ms, Some(1_729_700_001_500));
    }

    #[test]
    fn legacy_listing_entries_keep_metadata_optional() {
        let entries = parse_directory_listing("f\t123\told name.txt\n");
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].name, "old name.txt");
        assert_eq!(entries[0].permissions, None);
        assert_eq!(entries[0].owner, None);
        assert_eq!(entries[0].group, None);
        assert_eq!(entries[0].modified_ms, None);
    }

    #[test]
    fn symlink_followed_as_directory_with_percent_y_upper() {
        // After switching to %Y, symlink→dir is reported as "d".
        let out = "d\t7\tdata\nf\t478\tstart-unsloth.sh\n";
        let entries = parse_directory_listing(out);
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "data");
        assert!(!entries[1].is_dir);
    }
}
