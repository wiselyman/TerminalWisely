//! Compact bloated WebKit `localstorage.sqlite3` files left after large keys
//! (e.g. migrated AI chat) were deleted. WebKit quotas the file size, not live
//! payload — freelist holes keep throwing QuotaExceeded on any setItem.

use std::fs;
use std::path::{Path, PathBuf};

use rusqlite::Connection;

const MIN_FILE_BYTES: u64 = 1_500_000;
const MIN_DEAD_BYTES: u64 = 1_000_000;

/// Run before WKWebView opens so the DB is not locked.
pub fn compact_bloated_webkit_localstorage() {
    for root in webkit_website_data_roots() {
        if !root.is_dir() {
            continue;
        }
        for db in find_localstorage_dbs(&root) {
            match maybe_vacuum(&db) {
                Ok(Some(report)) => log::warn!("compacted webkit localStorage: {report}"),
                Ok(None) => {}
                Err(err) => log::warn!("webkit localStorage compact skipped {}: {err}", db.display()),
            }
        }
    }
}

fn webkit_website_data_roots() -> Vec<PathBuf> {
    let Some(home) = dirs::home_dir() else {
        return Vec::new();
    };
    // Tauri / WKWebView on macOS may use bundle name or reverse-DNS.
    [
        "Library/WebKit/TerminalWisely/WebsiteData",
        "Library/WebKit/com.wangyunfei.terminalwisely/WebsiteData",
        "Library/WebKit/WebsiteData",
    ]
    .into_iter()
    .map(|rel| home.join(rel))
    .collect()
}

fn find_localstorage_dbs(root: &Path) -> Vec<PathBuf> {
    let mut out = Vec::new();
    let mut stack = vec![root.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let entries = match fs::read_dir(&dir) {
            Ok(e) => e,
            Err(_) => continue,
        };
        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
                continue;
            }
            if path
                .file_name()
                .and_then(|n| n.to_str())
                .is_some_and(|n| n == "localstorage.sqlite3")
            {
                out.push(path);
            }
        }
    }
    out
}

fn maybe_vacuum(db: &Path) -> Result<Option<String>, String> {
    let meta = fs::metadata(db).map_err(|e| e.to_string())?;
    let before = meta.len();
    if before < MIN_FILE_BYTES {
        return Ok(None);
    }

    let conn = Connection::open(db).map_err(|e| e.to_string())?;
    let page_count: i64 = conn
        .query_row("PRAGMA page_count", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let freelist: i64 = conn
        .query_row("PRAGMA freelist_count", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let page_size: i64 = conn
        .query_row("PRAGMA page_size", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    let dead = (freelist.max(0) as u64).saturating_mul(page_size.max(0) as u64);
    let live_pages = page_count.saturating_sub(freelist).max(0) as u64;
    // Only shrink when almost all pages are free holes (post-delete bloat).
    if dead < MIN_DEAD_BYTES || live_pages > 64 {
        return Ok(None);
    }

    conn.execute_batch("VACUUM").map_err(|e| e.to_string())?;
    drop(conn);

    let after = fs::metadata(db).map(|m| m.len()).unwrap_or(before);
    if after + MIN_DEAD_BYTES / 4 < before {
        Ok(Some(format!(
            "{} {} -> {} bytes (freelist was {dead})",
            db.display(),
            before,
            after
        )))
    } else {
        Ok(None)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::params;

    #[test]
    fn vacuums_freelist_heavy_localstorage_shaped_db() {
        let dir = std::env::temp_dir().join(format!(
            "tw-ls-compact-{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let db = dir.join("localstorage.sqlite3");
        {
            let conn = Connection::open(&db).unwrap();
            conn.execute_batch(
                "CREATE TABLE ItemTable (key TEXT PRIMARY KEY NOT NULL, value BLOB NOT NULL);",
            )
            .unwrap();
            let big = vec![0u8; 2_500_000];
            conn.execute(
                "INSERT INTO ItemTable (key, value) VALUES (?1, ?2)",
                params!["tw.aiEngineer.chatByScope.v2", big],
            )
            .unwrap();
            conn.execute("DELETE FROM ItemTable", []).unwrap();
            // Leave freelist; do not vacuum yet.
        }
        let before = fs::metadata(&db).unwrap().len();
        assert!(before > MIN_FILE_BYTES, "before={before}");
        let report = maybe_vacuum(&db).unwrap();
        assert!(report.is_some(), "expected vacuum, before={before}");
        let after = fs::metadata(&db).unwrap().len();
        assert!(after < before / 2, "before={before} after={after}");
        let _ = fs::remove_dir_all(&dir);
    }
}
