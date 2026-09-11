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
if find "$DIR" -mindepth 1 -maxdepth 1 {find_filter}\( -xtype d -printf 'd\t0\t%f\n' -o ! -xtype d -printf 'f\t%s\t%f\n' \) 2>/dev/null; then
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
    let raw =
        list_remote_directory_entries(&ssh.handle(), &resolved, request.show_hidden).await?;

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
    })
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
    fn symlink_followed_as_directory_with_percent_y_upper() {
        // After switching to %Y, symlink→dir is reported as "d".
        let out = "d\t7\tdata\nf\t478\tstart-unsloth.sh\n";
        let entries = parse_directory_listing(out);
        assert!(entries[0].is_dir);
        assert_eq!(entries[0].name, "data");
        assert!(!entries[1].is_dir);
    }
}
