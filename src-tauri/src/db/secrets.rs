//! Passwords live in an app-data file encrypted with AES-GCM.
//! The login keychain is read at most once, to copy secrets that were stored there before.

use std::collections::{BTreeMap, HashMap};
use std::fs::{self, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};

use aes_gcm::aead::Aead;
use aes_gcm::{Aes256Gcm, KeyInit, Nonce};
use once_cell::sync::Lazy;
use rand::RngCore;

pub const DB_KEYCHAIN_SERVICE: &str = "com.wangyunfei.terminalwisely.db";
pub const SSH_KEYCHAIN_SERVICE: &str = "com.wangyunfei.terminalwisely.ssh";
pub const AI_KEYCHAIN_SERVICE: &str = "com.wangyunfei.terminalwisely.ai";

pub trait SecretStore: Send + Sync {
    fn put(&self, id: &str, secret: &str) -> Result<(), String>;
    fn get(&self, id: &str) -> Result<Option<String>, String>;
    fn delete(&self, id: &str) -> Result<(), String>;
}

#[derive(Default)]
pub struct MemorySecretStore {
    values: Mutex<HashMap<String, String>>,
}

impl SecretStore for MemorySecretStore {
    fn put(&self, id: &str, secret: &str) -> Result<(), String> {
        self.values
            .lock()
            .map_err(|err| err.to_string())?
            .insert(id.to_string(), secret.to_string());
        Ok(())
    }

    fn get(&self, id: &str) -> Result<Option<String>, String> {
        Ok(self
            .values
            .lock()
            .map_err(|err| err.to_string())?
            .get(id)
            .cloned())
    }

    fn delete(&self, id: &str) -> Result<(), String> {
        self.values
            .lock()
            .map_err(|err| err.to_string())?
            .remove(id);
        Ok(())
    }
}

pub struct KeyringSecretStore {
    service: &'static str,
}

impl KeyringSecretStore {
    pub const fn new(service: &'static str) -> Self {
        Self { service }
    }

    pub const fn db() -> Self {
        Self::new(DB_KEYCHAIN_SERVICE)
    }

    pub const fn ssh() -> Self {
        Self::new(SSH_KEYCHAIN_SERVICE)
    }

    pub const fn ai() -> Self {
        Self::new(AI_KEYCHAIN_SERVICE)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn platform_keychain_is_not_the_in_memory_mock() {
        // keyring has no default features. Without the platform feature it
        // stores each password on a throwaway mock entry, so the next read
        // reports that the password is missing.
        #[cfg(target_os = "macos")]
        let _builder = keyring::macos::default_credential_builder;
        #[cfg(target_os = "linux")]
        let _builder = keyring::keyutils::default_credential_builder;
        #[cfg(target_os = "windows")]
        let _builder = keyring::windows::default_credential_builder;
    }

    struct CountingStore {
        inner: MemorySecretStore,
        hits: std::sync::atomic::AtomicUsize,
    }

    impl SecretStore for CountingStore {
        fn put(&self, id: &str, secret: &str) -> Result<(), String> {
            self.inner.put(id, secret)
        }

        fn get(&self, id: &str) -> Result<Option<String>, String> {
            self.hits.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
            self.inner.get(id)
        }

        fn delete(&self, id: &str) -> Result<(), String> {
            self.inner.delete(id)
        }
    }

    #[test]
    fn file_vault_round_trip_and_one_legacy_import() {
        let dir = std::env::temp_dir().join(format!("tw-vault-{}", uuid::Uuid::new_v4()));
        let vault = FileVault::open(&dir, "db").unwrap();
        vault.put("a", "s3cret-value").unwrap();
        assert_eq!(vault.get("a").unwrap().as_deref(), Some("s3cret-value"));
        assert_eq!(FileVault::open(&dir, "db").unwrap().get("a").unwrap().as_deref(), Some("s3cret-value"));
        assert!(FileVault::open(&dir, "ssh").unwrap().get("a").unwrap().is_none());
        let stored = std::fs::read(dir.join("vault.bin")).unwrap();
        assert!(!stored.windows(b"s3cret-value".len()).any(|window| window == b"s3cret-value"));
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mode = std::fs::metadata(dir.join("vault.key")).unwrap().permissions().mode();
            assert_eq!(mode & 0o777, 0o600);
        }

        let legacy = CountingStore {
            inner: MemorySecretStore::default(),
            hits: std::sync::atomic::AtomicUsize::new(0),
        };
        legacy.put("b", "from-keychain").unwrap();
        FileVault::import_legacy_once(&dir, "db", &["b".into(), "missing".into()], &legacy).unwrap();
        assert_eq!(FileVault::open(&dir, "db").unwrap().get("b").unwrap().as_deref(), Some("from-keychain"));
        let hits = legacy.hits.load(std::sync::atomic::Ordering::SeqCst);
        FileVault::import_legacy_once(&dir, "db", &["b".into()], &legacy).unwrap();
        assert_eq!(legacy.hits.load(std::sync::atomic::Ordering::SeqCst), hits);
        let _ = std::fs::remove_dir_all(dir);
    }
}

impl Default for KeyringSecretStore {
    fn default() -> Self {
        Self::db()
    }
}

impl SecretStore for KeyringSecretStore {
    fn put(&self, id: &str, secret: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(self.service, id).map_err(|err| err.to_string())?;
        entry.set_password(secret).map_err(|err| err.to_string())
    }

    fn get(&self, id: &str) -> Result<Option<String>, String> {
        let entry = keyring::Entry::new(self.service, id).map_err(|err| err.to_string())?;
        match entry.get_password() {
            Ok(secret) => Ok(Some(secret)),
            Err(keyring::Error::NoEntry) => Ok(None),
            Err(err) => Err(err.to_string()),
        }
    }

    fn delete(&self, id: &str) -> Result<(), String> {
        let entry = keyring::Entry::new(self.service, id).map_err(|err| err.to_string())?;
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(err) => Err(err.to_string()),
        }
    }
}

struct VaultMemory {
    key: [u8; 32],
    entries: BTreeMap<String, BTreeMap<String, String>>,
    bin_path: PathBuf,
}

struct VaultSlot {
    memory: Mutex<VaultMemory>,
}

static VAULTS: Lazy<Mutex<HashMap<PathBuf, Arc<VaultSlot>>>> = Lazy::new(|| Mutex::new(HashMap::new()));

#[derive(Clone)]
pub struct FileVault {
    slot: Arc<VaultSlot>,
    service: &'static str,
}

impl FileVault {
    pub fn open(dir: &Path, service: &'static str) -> Result<Self, String> {
        fs::create_dir_all(dir).map_err(|err| err.to_string())?;
        let dir = fs::canonicalize(dir).unwrap_or_else(|_| dir.to_path_buf());
        let mut open = VAULTS.lock().map_err(|err| err.to_string())?;
        if let Some(slot) = open.get(&dir) {
            return Ok(Self {
                slot: slot.clone(),
                service,
            });
        }
        let memory = load_or_create(&dir)?;
        let slot = Arc::new(VaultSlot {
            memory: Mutex::new(memory),
        });
        open.insert(dir, slot.clone());
        Ok(Self { slot, service })
    }

    /// Copy missing ids out of the previous store once. Later calls do not touch it.
    pub fn import_legacy_once(
        dir: &Path,
        service: &'static str,
        ids: &[String],
        legacy: &dyn SecretStore,
    ) -> Result<(), String> {
        let marker = dir.join(format!("vault.imported.{service}"));
        if marker.is_file() {
            return Ok(());
        }
        let vault = Self::open(dir, service)?;
        for id in ids {
            if id.is_empty() || vault.get(id)?.is_some() {
                continue;
            }
            match legacy.get(id) {
                Ok(Some(secret)) => vault.put(id, &secret)?,
                Ok(None) | Err(_) => {}
            }
        }
        write_private(&marker, b"ok")?;
        Ok(())
    }
}

impl SecretStore for FileVault {
    fn put(&self, id: &str, secret: &str) -> Result<(), String> {
        let mut memory = self.slot.memory.lock().map_err(|err| err.to_string())?;
        memory
            .entries
            .entry(self.service.to_string())
            .or_default()
            .insert(id.to_string(), secret.to_string());
        let bytes = seal(&memory.key, &memory.entries)?;
        write_private(&memory.bin_path, &bytes)
    }

    fn get(&self, id: &str) -> Result<Option<String>, String> {
        let memory = self.slot.memory.lock().map_err(|err| err.to_string())?;
        Ok(memory
            .entries
            .get(self.service)
            .and_then(|items| items.get(id))
            .cloned())
    }

    fn delete(&self, id: &str) -> Result<(), String> {
        let mut memory = self.slot.memory.lock().map_err(|err| err.to_string())?;
        if let Some(items) = memory.entries.get_mut(self.service) {
            items.remove(id);
        }
        let bytes = seal(&memory.key, &memory.entries)?;
        write_private(&memory.bin_path, &bytes)
    }
}

fn load_or_create(dir: &Path) -> Result<VaultMemory, String> {
    let key_path = dir.join("vault.key");
    let bin_path = dir.join("vault.bin");
    let key = if key_path.is_file() {
        let bytes = fs::read(&key_path).map_err(|err| err.to_string())?;
        let mut key = [0u8; 32];
        if bytes.len() != key.len() {
            return Err("secret key file is unreadable".into());
        }
        key.copy_from_slice(&bytes);
        key
    } else {
        let mut key = [0u8; 32];
        rand::thread_rng().fill_bytes(&mut key);
        write_private(&key_path, &key)?;
        key
    };
    let entries = if bin_path.is_file() {
        let bytes = fs::read(&bin_path).map_err(|err| err.to_string())?;
        open_sealed(&key, &bytes)?
    } else {
        BTreeMap::new()
    };
    Ok(VaultMemory { key, entries, bin_path })
}

fn seal(key: &[u8; 32], entries: &BTreeMap<String, BTreeMap<String, String>>) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "secret key file is unreadable".to_string())?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let plain = serde_json::to_vec(entries).map_err(|err| err.to_string())?;
    let ciphertext = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plain.as_ref())
        .map_err(|_| "could not write the secret file".to_string())?;
    let mut out = nonce_bytes.to_vec();
    out.extend(ciphertext);
    Ok(out)
}

fn open_sealed(key: &[u8; 32], bytes: &[u8]) -> Result<BTreeMap<String, BTreeMap<String, String>>, String> {
    if bytes.len() < 12 {
        return Err("could not read the secret file".into());
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| "secret key file is unreadable".to_string())?;
    let (nonce_bytes, ciphertext) = bytes.split_at(12);
    let plain = cipher
        .decrypt(Nonce::from_slice(nonce_bytes), ciphertext)
        .map_err(|_| "could not read the secret file".to_string())?;
    serde_json::from_slice(&plain).map_err(|_| "could not read the secret file".into())
}

fn write_private(path: &Path, bytes: &[u8]) -> Result<(), String> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|err| err.to_string())?;
    }
    let tmp = path.with_extension("tmp");
    {
        let mut options = OpenOptions::new();
        options.write(true).create(true).truncate(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options.open(&tmp).map_err(|err| err.to_string())?;
        file.write_all(bytes).map_err(|err| err.to_string())?;
    }
    fs::rename(&tmp, path).map_err(|err| err.to_string())?;
    Ok(())
}
