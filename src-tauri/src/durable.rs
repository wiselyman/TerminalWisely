//! Catalog files: one app-data directory, a home-directory mirror, and no empty overwrite.

use std::fs::{self, File};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use serde_json::Value;
use tauri::{AppHandle, Manager};
use crate::secrets::{FileVault, KeyringSecretStore, SecretStore, DB_KEYCHAIN_SERVICE};

const IDENTIFIER: &str = "com.wangyunfei.terminalwisely";
const NOTICE_FILE: &str = "catalog-restore-notice.json";
const REMOVED_FEATURE_MARKER: &str = ".removed-k8s-database-v1";
const PENDING_DB_SECRET_IDS: &str = "removed-database-secret-ids.json";

pub const CATALOGS: &[&str] = &[
    "connections.json",
    "device-history.json",
    "ai-engineer.json",
    "entity-layout.json",
    "browser-history.json",
    "browser-bookmarks.json",
];

pub const ENTITY_LAYOUT_SCOPES: &[&str] = &["hosts"];

#[derive(Debug, Default, PartialEq, Eq)]
pub struct RemovedFeatureCleanupReport {
    pub removed: Vec<String>,
    pub failures: Vec<String>,
}

/// Removes only files/directories owned by the retired K8s and database features.
/// User kubeconfig paths outside these app roots are deliberately never followed.
pub fn cleanup_removed_feature_data(
    roots: &CatalogRoots,
    legacy_roots: &[PathBuf],
    db_vaults: &[FileVault],
    legacy_keyring: &dyn SecretStore,
) -> RemovedFeatureCleanupReport {
    let mut report = RemovedFeatureCleanupReport::default();
    let mut roots_to_clean = vec![roots.primary.clone(), roots.mirror.clone()];
    roots_to_clean.extend(legacy_roots.iter().cloned());
    roots_to_clean.sort();
    roots_to_clean.dedup();

    let pending_path = roots.primary.join(PENDING_DB_SECRET_IDS);
    let mut secret_ids = read_value(&pending_path)
        .and_then(|value| serde_json::from_value::<Vec<String>>(value).ok())
        .unwrap_or_default()
        .into_iter()
        .collect::<std::collections::BTreeSet<_>>();
    for root in &roots_to_clean {
        if let Some(value) = read_value(&root.join("db-connections.json")) {
            collect_secret_ids(&value, &mut secret_ids);
        }
    }

    for id in &secret_ids {
        if let Err(err) = legacy_keyring.delete(id) {
            report.failures.push(format!("database keychain entry {id}: {err}"));
        }
    }
    for vault in db_vaults {
        if let Err(err) = vault.clear_service() {
            report.failures.push(format!("database secret vault: {err}"));
        }
    }
    if report.failures.iter().any(|failure| failure.starts_with("database keychain entry")) {
        if let Err(err) = serde_json::to_vec(&secret_ids)
            .map_err(|err| err.to_string())
            .and_then(|bytes| atomic_write(&pending_path, &bytes))
        {
            report.failures.push(format!("{}: {err}", pending_path.display()));
        }
    } else {
        let _ = fs::remove_file(&pending_path);
    }

    for root in roots_to_clean {
        for name in [
            "db-connections.json",
            "db-queries.json",
            "k8s-kubeconfig-paths.json",
            "k8s-ssh-bindings.json",
        ] {
            let path = root.join(name);
            for target in [path.clone(), bak_path(&path)] {
                match fs::remove_file(&target) {
                    Ok(()) => report.removed.push(target.display().to_string()),
                    Err(err) if err.kind() == std::io::ErrorKind::NotFound => {}
                    Err(err) => report.failures.push(format!("{}: {err}", target.display())),
                }
            }
        }

        let layout_path = root.join("entity-layout.json");
        if let Some(mut layout) = read_value(&layout_path) {
            if let Some(object) = layout.as_object_mut() {
                let removed_k8s = object.remove("k8s").is_some();
                let removed_db = object.remove("db").is_some();
                if removed_k8s || removed_db {
                    match serde_json::to_vec_pretty(&layout)
                        .map_err(|err| err.to_string())
                        .and_then(|bytes| fs::write(&layout_path, bytes).map_err(|err| err.to_string()))
                    {
                        Ok(()) => report.removed.push(layout_path.display().to_string()),
                        Err(err) => report.failures.push(format!("{}: {err}", layout_path.display())),
                    }
                }
            }
        }

        for name in ["kubeconfigs", "bin"] {
            let path = root.join(name);
            if !path.exists() {
                continue;
            }
            match fs::remove_dir_all(&path) {
                Ok(()) => report.removed.push(path.display().to_string()),
                Err(err) => report.failures.push(format!("{}: {err}", path.display())),
            }
        }
    }
    report
}

fn run_removed_feature_cleanup(
    roots: &CatalogRoots,
    legacy_roots: &[PathBuf],
    legacy_keyring: &dyn SecretStore,
) -> RemovedFeatureCleanupReport {
    if roots.primary.join(REMOVED_FEATURE_MARKER).is_file() {
        return RemovedFeatureCleanupReport::default();
    }
    if let Err(err) = fs::create_dir_all(&roots.primary) {
        return RemovedFeatureCleanupReport {
            removed: Vec::new(),
            failures: vec![format!("{}: {err}", roots.primary.display())],
        };
    }
    let mut all_roots = vec![roots.primary.clone(), roots.mirror.clone()];
    all_roots.extend(legacy_roots.iter().cloned());
    all_roots.sort();
    all_roots.dedup();

    let mut report = RemovedFeatureCleanupReport::default();
    let mut vaults = Vec::new();
    for root in all_roots {
        if !root.join("vault.key").exists() && !root.join("vault.bin").exists() {
            continue;
        }
        match FileVault::open(&root, DB_KEYCHAIN_SERVICE) {
            Ok(vault) => vaults.push(vault),
            Err(err) => report.failures.push(format!("database secret vault {}: {err}", root.display())),
        }
    }
    let cleanup = cleanup_removed_feature_data(roots, legacy_roots, &vaults, legacy_keyring);
    report.removed.extend(cleanup.removed);
    report.failures.extend(cleanup.failures);
    if report.failures.is_empty() {
        if let Err(err) = fs::write(roots.primary.join(REMOVED_FEATURE_MARKER), b"ok") {
            report.failures.push(format!("{}: {err}", roots.primary.join(REMOVED_FEATURE_MARKER).display()));
        }
    }
    report
}

fn collect_secret_ids(value: &Value, ids: &mut std::collections::BTreeSet<String>) {
    match value {
        Value::Object(object) => {
            if let Some(id) = object.get("secret_id").and_then(Value::as_str) {
                if !id.is_empty() {
                    ids.insert(id.to_string());
                }
            }
            for child in object.values() {
                collect_secret_ids(child, ids);
            }
        }
        Value::Array(items) => {
            for child in items {
                collect_secret_ids(child, ids);
            }
        }
        _ => {}
    }
}

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
    let legacy = legacy_dirs();
    let mut notices = Vec::new();
    let cleanup = run_removed_feature_cleanup(&roots, &legacy, &KeyringSecretStore::db());
    notices.extend(cleanup.failures.into_iter().map(|failure| format!("cleanup-failed: {failure}")));
    let mut names = migrate_legacy(&roots);
    for name in CATALOGS {
        if restore_if_needed(&roots, name) {
            names.push((*name).to_string());
        }
    }
    notices.extend(names.drain(..));
    if !notices.is_empty() {
        let _ = persist_notice(&roots, &notices);
    }
    notices
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
    fn only_hosts_is_an_entity_layout_scope() {
        assert!(is_entity_layout_scope("hosts"));
        assert!(!is_entity_layout_scope("db"));
        assert!(!is_entity_layout_scope("k8s"));
    }

    #[test]
    fn feature_cleanup_removes_only_app_owned_k8s_and_database_data() {
        let roots = temp_roots("feature-cleanup");
        let legacy = roots.primary.parent().unwrap().join("TerminalWisely");
        fs::create_dir_all(&roots.primary).unwrap();
        fs::create_dir_all(&roots.mirror).unwrap();
        fs::create_dir_all(legacy.join("kubeconfigs")).unwrap();
        fs::write(roots.primary.join("db-connections.json"), br#"{"catalog":{"connections":[{"secret_id":"db-secret"}]}}"#).unwrap();
        fs::write(roots.mirror.join("db-connections.json"), br#"{"catalog":{"connections":[{"secret_id":"db-secret"}]}}"#).unwrap();
        fs::write(roots.primary.join("db-queries.json"), b"{}").unwrap();
        fs::write(roots.primary.join("k8s-ssh-bindings.json"), b"[]").unwrap();
        fs::write(roots.primary.join("connections.json"), br#"{"connections":[{"id":"ssh-host"}]}"#).unwrap();
        fs::write(roots.primary.join("entity-layout.json"), br#"{"hosts":{"expanded":true},"k8s":{"expanded":true},"db":{"expanded":true}}"#).unwrap();
        fs::write(legacy.join("kubeconfigs/lab.yaml"), b"apiVersion: v1").unwrap();
        let external_kubeconfig = roots.primary.parent().unwrap().join("user-kubeconfig.yaml");
        fs::write(&external_kubeconfig, b"user-owned").unwrap();

        let db_vault = FileVault::open(&roots.primary, DB_KEYCHAIN_SERVICE).unwrap();
        let keyring = KeyringSecretStore::db();
        let report = cleanup_removed_feature_data(&roots, &[legacy.clone()], &[db_vault], &keyring);

        assert!(report.failures.is_empty(), "unexpected cleanup failures: {:?}", report.failures);
        assert!(!roots.primary.join("db-connections.json").exists());
        assert!(!roots.mirror.join("db-connections.json").exists());
        assert!(!roots.primary.join("db-queries.json").exists());
        assert!(!roots.primary.join("k8s-ssh-bindings.json").exists());
        assert!(!roots.primary.join("kubeconfigs").exists());
        assert!(!legacy.join("kubeconfigs").exists());
        assert_eq!(record_count(&load_value(&roots, "connections.json").unwrap()), 1);
        let layout = load_value(&roots, "entity-layout.json").unwrap();
        assert!(layout.get("hosts").is_some());
        assert!(layout.get("k8s").is_none());
        assert!(layout.get("db").is_none());
        assert_eq!(fs::read(&external_kubeconfig).unwrap(), b"user-owned");
        let _ = fs::remove_dir_all(roots.primary.parent().unwrap());
    }

    #[test]
    fn feature_cleanup_reports_failures_and_can_retry() {
        let roots = temp_roots("feature-cleanup-retry");
        fs::create_dir_all(&roots.primary).unwrap();
        fs::create_dir_all(roots.primary.join("db-queries.json")).unwrap();
        let first = cleanup_removed_feature_data(&roots, &[], &[], &KeyringSecretStore::db());
        assert!(!first.failures.is_empty());
        fs::remove_dir_all(roots.primary.join("db-queries.json")).unwrap();
        fs::write(roots.primary.join("db-queries.json"), b"{}").unwrap();
        let second = cleanup_removed_feature_data(&roots, &[], &[], &KeyringSecretStore::db());
        assert!(second.failures.is_empty());
        assert!(!roots.primary.join("db-queries.json").exists());
        let _ = fs::remove_dir_all(roots.primary.parent().unwrap());
    }

    #[test]
    fn feature_cleanup_deletes_database_secret_ids_but_preserves_ssh_vault_entries() {
        let roots = temp_roots("feature-cleanup-secrets");
        fs::create_dir_all(&roots.primary).unwrap();
        let catalog = br#"{"catalog":{"connections":[{"secret_id":"db-secret"}]}}"#;
        fs::write(roots.primary.join("db-connections.json"), catalog).unwrap();
        let db_vault = FileVault::open(&roots.primary, DB_KEYCHAIN_SERVICE).unwrap();
        let ssh_vault = FileVault::open(&roots.primary, "com.wangyunfei.terminalwisely.ssh").unwrap();
        db_vault.put("db-secret", "database-password").unwrap();
        db_vault.put("db-orphan", "orphaned-database-password").unwrap();
        ssh_vault.put("ssh-secret", "ssh-password").unwrap();

        let keyring = crate::secrets::MemorySecretStore::default();
        keyring.put("db-secret", "legacy-db-password").unwrap();
        let report = cleanup_removed_feature_data(&roots, &[], &[db_vault.clone()], &keyring);

        assert!(report.failures.is_empty());
        assert_eq!(db_vault.get("db-secret").unwrap(), None);
        assert_eq!(db_vault.get("db-orphan").unwrap(), None);
        assert_eq!(ssh_vault.get("ssh-secret").unwrap().as_deref(), Some("ssh-password"));
        assert_eq!(keyring.get("db-secret").unwrap(), None);
        let _ = fs::remove_dir_all(roots.primary.parent().unwrap());
    }

    #[test]
    fn startup_feature_cleanup_retries_keychain_failure_before_marking_complete() {
        struct FailingDelete;
        impl SecretStore for FailingDelete {
            fn put(&self, _: &str, _: &str) -> Result<(), String> { Ok(()) }
            fn get(&self, _: &str) -> Result<Option<String>, String> { Ok(None) }
            fn delete(&self, _: &str) -> Result<(), String> { Err("temporarily unavailable".into()) }
        }

        let roots = temp_roots("feature-cleanup-keychain-retry");
        fs::create_dir_all(&roots.primary).unwrap();
        fs::write(roots.primary.join("db-connections.json"), br#"{"catalog":{"connections":[{"secret_id":"db-secret"}]}}"#).unwrap();
        let failed = run_removed_feature_cleanup(&roots, &[], &FailingDelete);
        assert!(!failed.failures.is_empty());
        assert!(!roots.primary.join(REMOVED_FEATURE_MARKER).exists());
        assert!(roots.primary.join(PENDING_DB_SECRET_IDS).exists());

        let recovered_keyring = crate::secrets::MemorySecretStore::default();
        recovered_keyring.put("db-secret", "legacy-password").unwrap();
        let retried = run_removed_feature_cleanup(&roots, &[], &recovered_keyring);
        assert!(retried.failures.is_empty(), "unexpected failures: {:?}", retried.failures);
        assert_eq!(recovered_keyring.get("db-secret").unwrap(), None);
        assert!(roots.primary.join(REMOVED_FEATURE_MARKER).is_file());
        assert!(!roots.primary.join(PENDING_DB_SECRET_IDS).exists());
        let _ = fs::remove_dir_all(roots.primary.parent().unwrap());
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
    fn legacy_kubeconfig_data_is_not_migrated_after_feature_removal() {
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
        assert!(copied.is_empty());
        assert!(!roots.primary.join("k8s-kubeconfig-paths.json").exists());
        assert!(!roots.primary.join("kubeconfigs").exists());
        let _ = fs::remove_dir_all(roots.primary.parent().unwrap());
    }
}
