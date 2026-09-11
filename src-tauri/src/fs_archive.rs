use crate::error::AppResult;
use crate::shell::shell_quote_remote_path;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArchiveKind {
    TarGz,
    TarBz2,
    TarXz,
    Tar,
    Zip,
    Gzip,
}

pub fn archive_kind_from_name(name: &str) -> Option<ArchiveKind> {
    let lower = name.to_ascii_lowercase();
    if lower.ends_with(".tar.gz") || lower.ends_with(".tgz") {
        Some(ArchiveKind::TarGz)
    } else if lower.ends_with(".tar.bz2") || lower.ends_with(".tbz2") || lower.ends_with(".tbz") {
        Some(ArchiveKind::TarBz2)
    } else if lower.ends_with(".tar.xz") || lower.ends_with(".txz") {
        Some(ArchiveKind::TarXz)
    } else if lower.ends_with(".tar") {
        Some(ArchiveKind::Tar)
    } else if lower.ends_with(".zip") {
        Some(ArchiveKind::Zip)
    } else if lower.ends_with(".gz") {
        Some(ArchiveKind::Gzip)
    } else {
        None
    }
}

pub fn remote_compress_command(parent: &str, basename: &str, archive_path: &str) -> String {
    format!(
        "tar czf {} -C {} {}",
        shell_quote_remote_path(archive_path),
        shell_quote_remote_path(parent),
        shell_quote_remote_path(basename),
    )
}

pub fn remote_extract_command(
    kind: ArchiveKind,
    archive_path: &str,
    parent: &str,
) -> AppResult<String> {
    let archive = shell_quote_remote_path(archive_path);
    let dest = shell_quote_remote_path(parent);
    let cmd = match kind {
        ArchiveKind::TarGz => format!("tar xzf {archive} -C {dest}"),
        ArchiveKind::TarBz2 => format!("tar xjf {archive} -C {dest}"),
        ArchiveKind::TarXz => format!("tar xJf {archive} -C {dest}"),
        ArchiveKind::Tar => format!("tar xf {archive} -C {dest}"),
        ArchiveKind::Zip => format!(
            "(command -v unzip >/dev/null 2>&1 && unzip -o {archive} -d {dest}) || tar xf {archive} -C {dest}"
        ),
        ArchiveKind::Gzip => {
            // Keep the .gz file; write decompressed sibling in the same directory.
            format!("gzip -dkf {archive}")
        }
    };
    Ok(cmd)
}

pub fn archive_output_path(parent: &str, basename: &str) -> String {
    let archive_name = format!("{basename}.tar.gz");
    if parent == "/" {
        format!("/{archive_name}")
    } else {
        format!(
            "{}/{}",
            parent.trim_end_matches('/'),
            archive_name
        )
    }
}
