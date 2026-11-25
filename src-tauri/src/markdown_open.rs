#[cfg(test)]
mod tests {
    use super::{file_paths_from_args, is_markdown_path};
    use std::fs;
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static NEXT_DIR: AtomicUsize = AtomicUsize::new(0);

    fn fixture_dir() -> PathBuf {
        let path = std::env::temp_dir().join(format!(
            "terminal-wisely-file-open-{}-{}",
            std::process::id(),
            NEXT_DIR.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&path).unwrap();
        path
    }

    #[test]
    fn collects_existing_files_regardless_of_suffix_and_ignores_non_files() {
        let root = fixture_dir();
        fs::write(root.join("notes.md"), "# notes").unwrap();
        fs::write(root.join("config.conf"), "name = value").unwrap();
        fs::create_dir(root.join("folder.txt")).unwrap();
        let paths = file_paths_from_args(
            [
                "TerminalWisely",
                "--reuse-window",
                "notes.md",
                "config.conf",
                "folder.txt",
                "missing.txt",
            ],
            &root,
        );

        assert_eq!(paths, vec![root.join("notes.md"), root.join("config.conf")]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn resolves_relative_file_paths_against_the_launch_directory() {
        let root = fixture_dir();
        fs::create_dir_all(root.join("Notes")).unwrap();
        fs::write(root.join("Notes/draft.md"), "draft").unwrap();
        assert_eq!(file_paths_from_args(["./Notes/draft.md"], &root), vec![root.join("Notes/draft.md")]);
        fs::remove_dir_all(root).unwrap();
    }

    #[test]
    fn markdown_route_is_based_on_the_document_suffix() {
        assert!(is_markdown_path(&PathBuf::from("/tmp/设计 文档.MD")));
        assert!(!is_markdown_path(&PathBuf::from("/tmp/settings.conf")));
    }
}
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct LocalFileOpenQueue(Mutex<Vec<PathBuf>>);

pub fn file_paths_from_args<I, S>(args: I, cwd: impl AsRef<Path>) -> Vec<PathBuf>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .map(|arg| PathBuf::from(arg.as_ref()))
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                cwd.as_ref().join(path)
            }
        })
        .filter(|path| path.is_file())
        .collect()
}

pub fn is_markdown_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|extension| extension.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("md" | "markdown")
    )
}

pub fn enqueue(app: &AppHandle, paths: Vec<PathBuf>) {
    if paths.is_empty() {
        return;
    }
    if let Some(queue) = app.try_state::<LocalFileOpenQueue>() {
        queue
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .extend(paths);
        let _ = app.emit("tw://local-file-open", ());
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[command]
pub fn take_pending_file_opens(app: AppHandle) -> Vec<String> {
    let Some(queue) = app.try_state::<LocalFileOpenQueue>() else {
        return Vec::new();
    };
    let mut paths = queue
        .0
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    paths
        .drain(..)
        .map(|path| path.to_string_lossy().into_owned())
        .collect()
}
