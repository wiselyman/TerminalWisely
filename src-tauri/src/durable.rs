//! Catalog files: one app-data directory, a home-directory mirror, and no empty overwrite.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde_json::Value;
use tauri::{AppHandle, Manager};

const IDENTIFIER: &str = "com.wangyunfei.terminalwisely";
const NOTICE_FILE: &str = "catalog-restore-notice.json";

pub const CATALOGS: &[&str] = &[
    "connections.json",
    "device-history.json",
    "db-connections.json",
    "ai-engineer.json",
    "k8s-kubeconfig-paths.json",
    "k8s-ssh-bindings.json",
    "entity-layout.json",
    "browser-history.json",
    "browser-bookmarks.json",
    "db-queries.json",
];

pub const ENTITY_LAYOUT_SCOPES: &[&str] = &["hosts", "k8s", "db"];

pub fn is_entity_layout_scope(scope: &str) -> bool {
    ENTITY_LAYOUT_SCOPES.contains(&scope)
}

static PRIMARY_OVERRIDE: OnceLock<PathBuf> = OnceLock::new();

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum WriteMode {
    /// Refuse when the new document has no records and the current file does.
    KeepRecords,
    /// Caller is an explicit user delete of the last record.
    AllowEmpty,
}

#[derive(Clone, Debug)]
pub struct CatalogRoots {
    pub primary: PathBuf,
    pub mirror: PathBuf,
}

pub fn install_primary(path: PathBuf) {
    let _ = PRIMARY_OVERRIDE.set(path);
}

pub fn primary_dir() -> PathBuf {
    if let Some(path) = PRIMARY_OVERRIDE.get() {
        return path.clone();
    }
    if let Ok(path) = std::env::var("TW_DATA_DIR") {
        if !path.is_empty() {
            return PathBuf::from(path);
        }
    }
    dirs::data_dir()
        .or_else(dirs::home_dir)
        .unwrap_or_else(|| PathBuf::from("."))
        .join(IDENTIFIER)
}

pub fn mirror_dir() -> PathBuf {
    if let Ok(path) = std::env::var("TW_CATALOG_MIRROR") {
        if !path.is_empty() {
            return PathBuf::from(path);
        }
    }
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".terminal-wisely")
        .join("catalog")
}

pub fn app_roots(app: &AppHandle) -> CatalogRoots {
    let primary = app
        .path()
        .app_data_dir()
        .unwrap_or_else(|_| primary_dir());
    CatalogRoots {
        primary,
        mirror: mirror_dir(),
    }
}

pub fn fallback_roots() -> CatalogRoots {
    CatalogRoots {
        primary: primary_dir(),
        mirror: mirror_dir(),
    }
}

/// Python rebuild may delete only a child of `ai-engineer`, never a catalog root.
pub fn python_env_dir_allowed(dir: &Path) -> bool {
    let name = dir.file_name().and_then(|s| s.to_str()).unwrap_or("");
    if !matches!(name, "venv" | "runtime" | "site-packages") {
        return false;
    }
    let under_ai = dir
        .ancestors()
        .skip(1)
        .any(|anc| anc.file_name().and_then(|s| s.to_str()) == Some("ai-engineer"));
    if !under_ai {
        return false;
    }
    for component in dir.components() {
        if component.as_os_str() == ".terminal-wisely" {
            return false;
        }
    }
    true
}

pub fn record_count(value: &Value) -> usize {
    if let Some(items) = value.as_array() {
        return items.len();
    }
    let Some(obj) = value.as_object() else {
        return 0;
    };
    let mut count = 0;
    for key in ["connections", "devices", "entries", "bookmarks"] {
        if let Some(items) = obj.get(key).and_then(|item| item.as_array()) {
            count += items.len();
        }
    }
    if let Some(items) = obj
        .get("catalog")
        .and_then(|item| item.get("connections"))
        .and_then(|item| item.as_array())
    {
        count += items.len();
    }
    if let Some(items) = obj
        .get("settings")
        .and_then(|item| item.get("profiles"))
        .and_then(|item| item.as_array())
    {
        count += items.len();
    }
    for scope in ENTITY_LAYOUT_SCOPES {
        if let Some(items) = obj
            .get(*scope)
            .and_then(|item| item.get("groups"))
            .and_then(|item| item.as_array())
        {
            count += items.len();
        }
    }
    count
}

fn document_path(dir: &Path, name: &str) -> Result<PathBuf, String> {
    if name.is_empty()
        || name.contains('/')
        || name.contains('\\')
        || name.contains("..")
    {
        return Err("invalid catalog name".into());
    }
    Ok(dir.join(name))
}

fn bak_path(path: &Path) -> PathBuf {
    let mut name = path
        .file_name()
        .map(|value| value.to_os_string())
        .unwrap_or_default();
    name.push(".bak");
    path.with_file_name(name)
}

fn read_value(path: &Path) -> Option<Value> {
    let bytes = fs::read(path).ok()?;
    serde_json::from_slice(&bytes).ok()
}

fn atomic_write(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let tmp_name = format!(
        ".{}.{}.tmp",
        path.file_name()
            .and_then(|value| value.to_str())
            .unwrap_or("catalog"),
        std::process::id()
    );
    let tmp = path.with_file_name(tmp_name);
    {
        let mut file = File::create(&tmp).map_err(|err| err.to_string())?;
        file.write_all(bytes).map_err(|err| err.to_string())?;
        file.sync_all().map_err(|err| err.to_string())?;
    }
    if path.is_file() {
        fs::copy(path, bak_path(path)).map_err(|err| err.to_string())?;
    }
    replace_file(&tmp, path)
}

fn replace_file(tmp: &Path, dest: &Path) -> Result<(), String> {
    if dest.exists() {
        fs::remove_file(dest).map_err(|err| err.to_string())?;
    }
    fs::rename(tmp, dest).map_err(|err| err.to_string())
}

fn strip_secrets(value: &Value) -> Value {
    match value {
        Value::Array(items) => Value::Array(items.iter().map(strip_secrets).collect()),
        Value::Object(map) => {
            let mut next = serde_json::Map::new();
            for (key, item) in map {
                if matches!(
                    key.as_str(),
                    "password" | "api_key" | "passphrase" | "cursor_api_key"
                ) {
                    continue;
                }
                next.insert(key.clone(), strip_secrets(item));
            }
            Value::Object(next)
        }
        other => other.clone(),
    }
}

pub fn load_value(roots: &CatalogRoots, name: &str) -> Result<Value, String> {
    let _ = restore_if_needed(roots, name);
    let path = document_path(&roots.primary, name)?;
    Ok(read_value(&path).unwrap_or_else(|| Value::Object(serde_json::Map::new())))
}

pub fn save_value(
    roots: &CatalogRoots,
    name: &str,
    value: &Value,
    mode: WriteMode,
) -> Result<(), String> {
    let path = document_path(&roots.primary, name)?;
    let current = read_value(&path).unwrap_or(Value::Null);
    if mode == WriteMode::KeepRecords && record_count(value) == 0 && record_count(&current) > 0 {
        return Err(format!(
            "refusing to replace catalog {name} with an empty document"
        ));
    }
    let bytes = serde_json::to_vec_pretty(value).map_err(|err| err.to_string())?;
    atomic_write(&path, &bytes)?;
    let mirror = document_path(&roots.mirror, name)?;
    let mirror_bytes =
        serde_json::to_vec_pretty(&strip_secrets(value)).map_err(|err| err.to_string())?;
    atomic_write(&mirror, &mirror_bytes)?;
    Ok(())
}

pub fn restore_if_needed(roots: &CatalogRoots, name: &str) -> bool {
    let path = match document_path(&roots.primary, name) {
        Ok(path) => path,
        Err(_) => return false,
    };
    let primary_bytes = fs::read(&path).ok();
    let primary_value = primary_bytes
        .as_deref()
        .and_then(|bytes| serde_json::from_slice::<Value>(bytes).ok());
    if primary_value.as_ref().map(record_count).unwrap_or(0) > 0 {
        return false;
    }
    let mirror_value = document_path(&roots.mirror, name)
        .ok()
        .and_then(|path| read_value(&path));
    // A valid empty primary together with an empty mirror is an explicit delete.
    // `.bak` is only for a missing or unreadable primary.
    let chosen = if mirror_value.as_ref().map(record_count).unwrap_or(0) > 0 {
        mirror_value
    } else if primary_value.is_none() {
        read_value(&bak_path(&path)).filter(|value| record_count(value) > 0)
    } else {
        None
    };
    let Some(value) = chosen else {
        return false;
    };
    let Ok(bytes) = serde_json::to_vec_pretty(&value) else {
        return false;
    };
    atomic_write(&path, &bytes).is_ok()
}

fn persist_notice(roots: &CatalogRoots, names: &[String]) -> Result<(), String> {
    let path = roots.primary.join(NOTICE_FILE);
    let bytes = serde_json::to_vec_pretty(names).map_err(|err| err.to_string())?;
    atomic_write(&path, &bytes)
}

pub fn take_notice(roots: &CatalogRoots) -> Vec<String> {
    let path = roots.primary.join(NOTICE_FILE);
    let names = read_value(&path)
        .and_then(|value| serde_json::from_value::<Vec<String>>(value).ok())
        .unwrap_or_default();
    if !names.is_empty() {
        let _ = atomic_write(&path, b"[]");
    }
    names
}

pub fn startup(app: &AppHandle) -> Vec<String> {
    let roots = app_roots(app);
    install_primary(roots.primary.clone());
    let mut names = migrate_legacy(&roots);
    for name in CATALOGS {
        if restore_if_needed(&roots, name) {
            names.push((*name).to_string());
        }
    }
    if !names.is_empty() {
        let _ = persist_notice(&roots, &names);
    }
    names
}

fn legacy_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    for base in [dirs::data_local_dir(), dirs::data_dir()]
        .into_iter()
        .flatten()
    {
        let path = base.join("TerminalWisely");
        if !dirs.iter().any(|item: &PathBuf| item == &path) {
            dirs.push(path);
        }
    }
    dirs
}

fn migrate_legacy(roots: &CatalogRoots) -> Vec<String> {
    let marker = roots.primary.join(".legacy-product-dir-migrated");
    if marker.is_file() {
        return Vec::new();
    }
    let _ = fs::create_dir_all(&roots.primary);
    let mut copied = Vec::new();
    for legacy in legacy_dirs() {
        copied.extend(migrate_legacy_dir(roots, &legacy));
    }
    let _ = fs::write(&marker, b"ok");
    copied
}

fn migrate_legacy_dir(roots: &CatalogRoots, legacy: &Path) -> Vec<String> {
    if !legacy.is_dir() {
        return Vec::new();
    }
    let _ = fs::create_dir_all(&roots.primary);
    let mut copied = Vec::new();
    for name in ["k8s-kubeconfig-paths.json", "k8s-ssh-bindings.json"] {
        let src = legacy.join(name);
        let dest = roots.primary.join(name);
        let src_count = read_value(&src).as_ref().map(record_count).unwrap_or(0);
        let dest_count = read_value(&dest).as_ref().map(record_count).unwrap_or(0);
        if src_count > 0 && dest_count == 0 && fs::copy(&src, &dest).is_ok() {
            copied.push(name.to_string());
        }
    }
    for folder in ["kubeconfigs", "bin"] {
        if copy_tree_if_dest_empty(&legacy.join(folder), &roots.primary.join(folder)) {
            copied.push(folder.to_string());
        }
    }
    copied
}

fn copy_tree_if_dest_empty(src: &Path, dest: &Path) -> bool {
    if !src.is_dir() {
        return false;
    }
    let dest_has_files = dest.is_dir()
        && fs::read_dir(dest)
            .map(|mut entries| entries.next().is_some())
            .unwrap_or(false);
    if dest_has_files {
        return false;
    }
    let _ = fs::create_dir_all(dest);
    let mut copied = false;
    let Ok(entries) = fs::read_dir(src) else {
        return false;
    };
    for entry in entries.flatten() {
        let from = entry.path();
        let Some(name) = from.file_name() else {
            continue;
        };
        let to = dest.join(name);
        if from.is_dir() {
            copied |= copy_tree_if_dest_empty(&from, &to);
        } else if fs::copy(&from, &to).is_ok() {
            copied = true;
        }
    }
    copied
}

pub fn mirror_file(primary: &Path, source: &Path) {
    let Ok(relative) = source.strip_prefix(primary) else {
        return;
    };
    let dest = mirror_dir().join(relative);
    if let Some(parent) = dest.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::copy(source, dest);
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn temp_roots(label: &str) -> CatalogRoots {
        let root = std::env::temp_dir().join(format!(
            "tw-durable-{label}-{}",
            std::process::id()
        ));
        let _ = fs::remove_dir_all(&root);
        CatalogRoots {
            primary: root.join("primary"),
            mirror: root.join("mirror"),
        }
    }

    #[test]
    fn db_is_an_entity_layout_scope() {
        assert!(is_entity_layout_scope("db"));
        assert!(!is_entity_layout_scope("mysql"));
    }

    #[test]
    fn refuses_empty_overwrite_and_keeps_mirror() {
        let roots = temp_roots("keep");
        let full = json!({"connections": [{"id": "h1", "password": "secret"}]});
        save_value(&roots, "connections.json", &full, WriteMode::KeepRecords).unwrap();
        let err = save_value(
            &roots,
            "connections.json",
            &json!({"connections": []}),
            WriteMode::KeepRecords,
        )
        .unwrap_err();
        assert!(err.contains("refusing"));
        let loaded = load_value(&roots, "connections.json").unwrap();
        assert_eq!(record_count(&loaded), 1);
        let mirror = fs::read_to_string(roots.mirror.join("connections.json")).unwrap();
        assert!(!mirror.contains("secret"));
        assert!(mirror.contains("h1"));
        let _ = fs::remove_dir_all(roots.primary.parent().unwrap());
    }

    #[test]
    fn restores_primary_from_mirror_when_primary_is_empty() {
        let roots = temp_roots("restore");
        let full = json!({"connections": [{"id": "h1"}]});
        save_value(&roots, "connections.json", &full, WriteMode::KeepRecords).unwrap();
        fs::write(roots.primary.join("connections.json"), b"{}").unwrap();
        assert!(restore_if_needed(&roots, "connections.json"));
        let loaded = load_value(&roots, "connections.json").unwrap();
        assert_eq!(record_count(&loaded), 1);
        save_value(
            &roots,
            "connections.json",
            &json!({"connections": []}),
            WriteMode::AllowEmpty,
        )
        .unwrap();
        assert_eq!(
            record_count(&load_value(&roots, "connections.json").unwrap()),
            0
        );
        let _ = fs::remove_dir_all(roots.primary.parent().unwrap());
    }

    #[test]
    fn python_env_dir_cannot_be_a_catalog_root() {
        assert!(python_env_dir_allowed(Path::new(
            "/tmp/app/ai-engineer/venv"
        )));
        assert!(python_env_dir_allowed(Path::new(
            "/tmp/app/ai-engineer/runtime"
        )));
        assert!(python_env_dir_allowed(Path::new(
            "/tmp/app/ai-engineer/site-packages"
        )));
        assert!(!python_env_dir_allowed(Path::new(
            "/tmp/app/ai-engineer"
        )));
        assert!(!python_env_dir_allowed(Path::new(
            "/Users/me/Library/Application Support/com.wangyunfei.terminalwisely"
        )));
        assert!(!python_env_dir_allowed(Path::new(
            "/Users/me/.terminal-wisely/catalog"
        )));
        assert!(!python_env_dir_allowed(Path::new(
            "/Users/me/.terminal-wisely/catalog/ai-engineer/venv"
        )));
    }

    #[test]
    fn legacy_kubeconfig_index_is_copied_once() {
        let roots = temp_roots("legacy");
        let legacy = roots.primary.parent().unwrap().join("TerminalWisely");
        fs::create_dir_all(legacy.join("kubeconfigs")).unwrap();
        fs::write(
            legacy.join("k8s-kubeconfig-paths.json"),
            br#"[{"path":"/tmp/kube.yaml","display_name":"lab"}]"#,
        )
        .unwrap();
        fs::write(legacy.join("kubeconfigs").join("lab.yaml"), b"apiVersion: v1").unwrap();
        let copied = migrate_legacy_dir(&roots, &legacy);
        assert!(copied.iter().any(|name| name == "k8s-kubeconfig-paths.json"));
        assert!(copied.iter().any(|name| name == "kubeconfigs"));
        assert!(roots.primary.join("kubeconfigs").join("lab.yaml").is_file());
        assert!(migrate_legacy_dir(&roots, &legacy).is_empty());
        let _ = fs::remove_dir_all(roots.primary.parent().unwrap());
    }
}
