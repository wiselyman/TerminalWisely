#[cfg(test)]
mod tests {
    use super::markdown_paths_from_args;
    use std::path::PathBuf;

    #[test]
    fn accepts_markdown_paths_and_ignores_other_arguments() {
        let paths = markdown_paths_from_args(
            [
                "TerminalWisely",
                "--reuse-window",
                "/tmp/Notes/设计 文档.MD",
                "/tmp/readme.markdown",
                "/tmp/image.png",
            ],
            "/tmp",
        );

        assert_eq!(
            paths,
            vec![
                PathBuf::from("/tmp/Notes/设计 文档.MD"),
                PathBuf::from("/tmp/readme.markdown")
            ]
        );
    }

    #[test]
    fn resolves_relative_markdown_paths_against_the_launch_directory() {
        assert_eq!(
            markdown_paths_from_args(["./draft.md"], "/Users/wang/Notes"),
            vec![PathBuf::from("/Users/wang/Notes/draft.md")]
        );
    }
}
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::{command, AppHandle, Emitter, Manager};

#[derive(Default)]
pub struct MarkdownOpenQueue(Mutex<Vec<PathBuf>>);

pub fn markdown_paths_from_args<I, S>(args: I, cwd: impl AsRef<Path>) -> Vec<PathBuf>
where
    I: IntoIterator<Item = S>,
    S: AsRef<str>,
{
    args.into_iter()
        .map(|arg| PathBuf::from(arg.as_ref()))
        .filter(|path| is_markdown_path(path))
        .map(|path| {
            if path.is_absolute() {
                path
            } else {
                cwd.as_ref().join(path)
            }
        })
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
    if let Some(queue) = app.try_state::<MarkdownOpenQueue>() {
        queue
            .0
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .extend(paths);
        let _ = app.emit("tw://markdown-open-files", ());
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[command]
pub fn take_pending_markdown_opens(app: AppHandle) -> Vec<String> {
    let Some(queue) = app.try_state::<MarkdownOpenQueue>() else {
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
