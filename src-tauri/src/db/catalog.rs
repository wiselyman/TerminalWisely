//! Saved database connections. Metadata is persisted; passwords stay in a secret store.

use std::collections::HashMap;

use serde::{Deserialize, Serialize};
use serde_json::Value;
use uuid::Uuid;

use super::secrets::SecretStore;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct DbConnection {
    pub id: String,
    pub name: String,
    pub engine: String,
    pub host: String,
    pub port: u16,
    pub database: String,
    pub user: String,
    /// MongoDB authentication database. Empty means the server default `admin`.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub auth_database: String,
    /// `disabled` or `verify-full`.
    pub tls: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub ssh_session_id: Option<String>,
    pub revision: u64,
    pub secret_id: String,
}

#[derive(Debug, Clone)]
pub struct SaveDbConnection {
    pub id: Option<String>,
    pub name: String,
    pub engine: String,
    pub host: String,
    pub port: Option<u16>,
    pub database: String,
    pub user: String,
    pub auth_database: String,
    pub tls: String,
    pub ssh_session_id: Option<String>,
    /// `None` keeps the existing password. A new connection requires `Some`.
    pub password: Option<String>,
    /// Redis authentication "none" drops a stored password instead of keeping it.
    pub clear_secret: bool,
}

#[derive(Debug, Clone)]
pub struct SavedConnection {
    pub connection: DbConnection,
    pub secret_written: bool,
    pub previous_secret: Option<String>,
    /// Keychain id touched by this save. Empty when nothing was written.
    pub touched_secret_id: String,
}

#[derive(Debug, Default, Clone)]
pub struct DbCatalog {
    connections: Vec<DbConnection>,
}

impl DbCatalog {
    pub fn list(&self) -> Vec<DbConnection> {
        self.connections.clone()
    }

    pub fn get(&self, id: &str) -> Option<&DbConnection> {
        self.connections.iter().find(|item| item.id == id)
    }

    pub fn password(
        &self,
        connection_id: &str,
        secrets: &dyn SecretStore,
    ) -> Result<String, String> {
        let connection = self.get(connection_id).ok_or("connection not found")?;
        if connection.secret_id.is_empty() {
            return if connection.engine == "sqlite" || connection.engine == "redis" {
                Ok(String::new())
            } else {
                Err("password is missing".into())
            };
        }
        secrets
            .get(&connection.secret_id)?
            .ok_or_else(|| "password is missing".to_string())
    }

    pub fn save(
        &mut self,
        input: SaveDbConnection,
        secrets: &dyn SecretStore,
    ) -> Result<SavedConnection, String> {
        let engine = normalize_engine(&input.engine)?;
        let spec = engine_spec(&engine).expect("normalized engine");
        let tls = normalize_tls(&input.tls)?;
        let mut host = input.host.trim().to_string();
        let mut user = input.user.trim().to_string();
        let database = input.database.trim().to_string();
        let auth_database = stored_auth_database(&engine, &input.auth_database);
        let name = input.name.trim().to_string();
        let port = if spec.file {
            if name.is_empty() || database.is_empty() {
                return Err("name and database file are required".into());
            }
            host.clear();
            user.clear();
            0
        } else {
            if name.is_empty() || host.is_empty() || database.is_empty() || (user.is_empty() && engine != "redis") {
                return Err("name, host, database, and user are required".into());
            }
            if user.is_empty() {
                user = "default".into();
            }
            let port = input.port.unwrap_or(spec.port);
            if port == 0 {
                return Err("port is required".into());
            }
            port
        };
        let ssh_session_id = input
            .ssh_session_id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        let password = input.password.as_deref().filter(|value| !value.is_empty());

        if let Some(id) = input.id.as_deref().map(str::trim).filter(|value| !value.is_empty()) {
            let index = self
                .connections
                .iter()
                .position(|item| item.id == id)
                .ok_or("connection not found")?;
            let previous = self.connections[index].clone();
            let secret_id = if spec.file && previous.secret_id.is_empty() {
                String::new()
            } else {
                previous.secret_id.clone()
            };
            let previous_secret = if secret_id.is_empty() {
                None
            } else {
                secrets.get(&secret_id)?
            };
            let (secret_id, secret_written, touched_secret_id) = if let Some(next) = password {
                let secret_id = if secret_id.is_empty() {
                    format!("secret-{}", previous.id)
                } else {
                    secret_id
                };
                secrets.put(&secret_id, next)?;
                (secret_id.clone(), true, secret_id)
            } else if input.clear_secret && engine == "redis" {
                if secret_id.is_empty() {
                    (String::new(), false, String::new())
                } else {
                    secrets.delete(&secret_id)?;
                    (String::new(), true, secret_id)
                }
            } else if spec.file || (engine == "redis" && previous_secret.is_none()) {
                (secret_id, false, String::new())
            } else if previous_secret.is_none() {
                return Err("password is required".into());
            } else {
                (secret_id, false, String::new())
            };
            let updated = DbConnection {
                id: previous.id,
                name,
                engine,
                host,
                port,
                database,
                user,
                auth_database,
                tls,
                ssh_session_id,
                revision: previous.revision.saturating_add(1),
                secret_id,
            };
            self.connections[index] = updated.clone();
            return Ok(SavedConnection {
                connection: updated,
                secret_written,
                previous_secret,
                touched_secret_id,
            });
        }

        let id = Uuid::new_v4().to_string();
        let secret_id = if spec.file {
            if password.is_some() {
                return Err("sqlite does not store a password".into());
            }
            String::new()
        } else if engine == "redis" && password.is_none() {
            String::new()
        } else {
            let Some(password) = password else {
                return Err("password is required".into());
            };
            let secret_id = format!("secret-{id}");
            secrets.put(&secret_id, password)?;
            secret_id
        };
        let created = DbConnection {
            id,
            name,
            engine,
            host,
            port,
            database,
            user,
            auth_database,
            tls,
            ssh_session_id,
            revision: 1,
            secret_id: secret_id.clone(),
        };
        self.connections.push(created.clone());
        Ok(SavedConnection {
            connection: created,
            secret_written: !secret_id.is_empty(),
            previous_secret: None,
            touched_secret_id: secret_id,
        })
    }

    pub fn delete(&mut self, id: &str, secrets: &dyn SecretStore) -> Result<(), String> {
        let index = self
            .connections
            .iter()
            .position(|item| item.id == id)
            .ok_or("connection not found")?;
        let removed = self.connections.remove(index);
        if !removed.secret_id.is_empty() {
            secrets.delete(&removed.secret_id)?;
        }
        Ok(())
    }

    pub fn export(&self) -> StoredCatalog {
        StoredCatalog {
            connections: self.connections.clone(),
        }
    }
}

pub fn rollback_save(saved: &SavedConnection, secrets: &dyn SecretStore) -> Result<(), String> {
    if !saved.secret_written {
        return Ok(());
    }
    let id = if saved.touched_secret_id.is_empty() {
        saved.connection.secret_id.as_str()
    } else {
        saved.touched_secret_id.as_str()
    };
    if id.is_empty() {
        return Ok(());
    }
    match &saved.previous_secret {
        Some(previous) => secrets.put(id, previous),
        None => secrets.delete(id),
    }
}

fn stored_auth_database(engine: &str, value: &str) -> String {
    if engine != "mongodb" {
        return String::new();
    }
    let trimmed = value.trim();
    if trimmed.is_empty() {
        "admin".into()
    } else {
        trimmed.into()
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct LegacyCatalog {
    #[serde(default)]
    connections: Vec<DbConnection>,
    #[serde(default)]
    secrets: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct StoredCatalog {
    pub connections: Vec<DbConnection>,
}

/// Load metadata. Legacy files that still embed passwords are moved into the secret store.
pub fn catalog_from_value(
    value: Value,
    secrets: &dyn SecretStore,
) -> Result<(DbCatalog, bool), String> {
    let stored: LegacyCatalog = serde_json::from_value(value).map_err(|err| err.to_string())?;
    let migrated = !stored.secrets.is_empty();
    for (id, secret) in &stored.secrets {
        secrets.put(id, secret)?;
    }
    Ok((
        DbCatalog {
            connections: stored.connections,
        },
        migrated,
    ))
}

#[derive(Debug, Clone, Copy)]
pub struct EngineSpec {
    pub id: &'static str,
    pub offered: bool,
    pub file: bool,
    pub port: u16,
}

const ENGINES: &[EngineSpec] = &[
    EngineSpec { id: "postgres", offered: true, file: false, port: 5432 },
    EngineSpec { id: "mysql", offered: true, file: false, port: 3306 },
    EngineSpec { id: "mariadb", offered: true, file: false, port: 3306 },
    EngineSpec { id: "sqlite", offered: true, file: true, port: 0 },
    EngineSpec { id: "mongodb", offered: true, file: false, port: 27017 },
    EngineSpec { id: "redis", offered: true, file: false, port: 6379 },
    EngineSpec { id: "sqlserver", offered: true, file: false, port: 1433 },
    EngineSpec { id: "oracle", offered: true, file: false, port: 1521 },
];

pub fn engine_spec(engine: &str) -> Option<&'static EngineSpec> {
    ENGINES.iter().find(|item| item.id == engine)
}

pub fn offered_engines() -> Vec<&'static str> {
    ENGINES.iter().filter(|item| item.offered).map(|item| item.id).collect()
}

pub fn normalize_engine(engine: &str) -> Result<String, String> {
    let id = match engine.trim().to_ascii_lowercase().as_str() {
        "postgres" | "postgresql" => "postgres",
        "mysql" => "mysql",
        "mariadb" => "mariadb",
        "sqlite" => "sqlite",
        "mongodb" | "mongo" => "mongodb",
        "redis" => "redis",
        "sqlserver" | "mssql" => "sqlserver",
        "oracle" => "oracle",
        _ => return Err("engine is not available".into()),
    };
    let spec = engine_spec(id).expect("known engine");
    if !spec.offered {
        return Err("engine is not available".into());
    }
    Ok(id.to_string())
}

fn normalize_tls(tls: &str) -> Result<String, String> {
    match tls.trim() {
        "" | "disabled" => Ok("disabled".into()),
        "verify-full" => Ok("verify-full".into()),
        _ => Err("tls must be disabled or verify-full".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::secrets::MemorySecretStore;

    fn input(password: Option<&str>) -> SaveDbConnection {
        SaveDbConnection {
            id: None,
            name: "app".into(),
            engine: "postgres".into(),
            host: "db.internal".into(),
            port: Some(5432),
            database: "app".into(),
            user: "app".into(),
            auth_database: String::new(),
            tls: "verify-full".into(),
            ssh_session_id: None,
            password: password.map(str::to_string),
            clear_secret: false,
        }
    }

    #[test]
    fn persisted_json_has_no_secret() {
        let secrets = MemorySecretStore::default();
        let mut catalog = DbCatalog::default();
        catalog
            .save(input(Some(" s3cret ")), &secrets)
            .unwrap();
        let listed = serde_json::to_string(&catalog.export()).unwrap();
        assert!(!listed.contains("s3cret"));
        assert!(!listed.contains("\"password\""));
        assert!(!listed.contains("\"secrets\""));
        assert!(listed.contains("secret_id"));
        let id = catalog.list()[0].id.clone();
        assert_eq!(catalog.password(&id, &secrets).unwrap(), " s3cret ");
    }

    #[test]
    fn blank_password_keeps_secret_and_delete_removes_it() {
        let secrets = MemorySecretStore::default();
        let mut catalog = DbCatalog::default();
        let created = catalog.save(input(Some("s3cret")), &secrets).unwrap();
        let mut again = input(None);
        again.id = Some(created.connection.id.clone());
        again.host = "other.internal".into();
        let updated = catalog.save(again, &secrets).unwrap();
        assert!(!updated.secret_written);
        assert_eq!(
            catalog.password(&updated.connection.id, &secrets).unwrap(),
            "s3cret"
        );
        assert_eq!(updated.connection.revision, 2);
        catalog.delete(&updated.connection.id, &secrets).unwrap();
        assert!(secrets.get(&created.connection.secret_id).unwrap().is_none());
    }

    #[test]
    fn failed_persist_rolls_back_a_new_secret_and_restores_an_old_one() {
        let secrets = MemorySecretStore::default();
        let mut catalog = DbCatalog::default();
        let created = catalog.save(input(Some("s3cret")), &secrets).unwrap();
        rollback_save(&created, &secrets).unwrap();
        assert!(secrets.get(&created.connection.secret_id).unwrap().is_none());

        let created = catalog.save(input(Some("s3cret")), &secrets).unwrap();
        let mut again = input(Some(" next "));
        again.id = Some(created.connection.id.clone());
        let updated = catalog.save(again, &secrets).unwrap();
        assert_eq!(
            secrets.get(&updated.connection.secret_id).unwrap().as_deref(),
            Some(" next ")
        );
        rollback_save(&updated, &secrets).unwrap();
        assert_eq!(
            secrets.get(&updated.connection.secret_id).unwrap().as_deref(),
            Some("s3cret")
        );
    }

    #[test]
    fn legacy_json_moves_secrets_out_of_the_file() {
        let secrets = MemorySecretStore::default();
        let raw = serde_json::json!({
            "connections": [{
                "id": "db-1",
                "name": "app",
                "engine": "postgres",
                "host": "db.internal",
                "port": 5432,
                "database": "app",
                "user": "app",
                "tls": "disabled",
                "revision": 1,
                "secret_id": "secret-db-1"
            }],
            "secrets": {"secret-db-1": "s3cret"}
        });
        let (catalog, migrated) = catalog_from_value(raw, &secrets).unwrap();
        assert!(migrated);
        let exported = serde_json::to_string(&catalog.export()).unwrap();
        assert!(!exported.contains("s3cret"));
        assert_eq!(catalog.password("db-1", &secrets).unwrap(), "s3cret");
    }

    #[test]
    fn direct_save_leaves_ssh_empty() {
        let secrets = MemorySecretStore::default();
        let mut catalog = DbCatalog::default();
        let created = catalog.save(input(Some("s3cret")), &secrets).unwrap();
        assert!(created.connection.ssh_session_id.is_none());
    }

    #[test]
    fn mariadb_stays_distinct_and_blocked_engines_cannot_be_saved() {
        assert_eq!(normalize_engine("MariaDB").unwrap(), "mariadb");
        assert_eq!(normalize_engine("postgresql").unwrap(), "postgres");
        assert_eq!(normalize_engine("sqlserver").unwrap(), "sqlserver");
        assert_eq!(normalize_engine("mssql").unwrap(), "sqlserver");
        assert_eq!(normalize_engine("oracle").unwrap(), "oracle");
        assert!(normalize_engine("clickhouse").is_err());
        assert!(normalize_engine("snowflake").is_err());
        let offered = offered_engines();
        assert!(offered.contains(&"mariadb"));
        assert!(offered.contains(&"sqlite"));
        assert!(offered.contains(&"sqlserver"));
        assert!(offered.contains(&"oracle"));
        assert!(!offered.contains(&"clickhouse"));
    }

    #[test]
    fn redis_without_a_password_stores_no_secret_and_mongo_defaults_the_auth_database() {
        let secrets = MemorySecretStore::default();
        let mut catalog = DbCatalog::default();
        let redis = catalog
            .save(
                SaveDbConnection {
                    id: None,
                    name: "cache".into(),
                    engine: "redis".into(),
                    host: "db.internal".into(),
                    port: Some(6379),
                    database: "0".into(),
                    user: String::new(),
                    auth_database: String::new(),
                    tls: "disabled".into(),
                    ssh_session_id: None,
                    password: None,
                    clear_secret: false,
                },
                &secrets,
            )
            .unwrap();
        assert!(redis.connection.secret_id.is_empty());
        assert_eq!(redis.connection.user, "default");
        assert_eq!(catalog.password(&redis.connection.id, &secrets).unwrap(), "");
        let mongo = catalog
            .save(
                SaveDbConnection {
                    id: None,
                    name: "docs".into(),
                    engine: "mongodb".into(),
                    host: "db.internal".into(),
                    port: Some(27017),
                    database: "app".into(),
                    user: "app".into(),
                    auth_database: String::new(),
                    tls: "disabled".into(),
                    ssh_session_id: None,
                    password: Some("s3cret".into()),
                    clear_secret: false,
                },
                &secrets,
            )
            .unwrap();
        assert_eq!(mongo.connection.auth_database, "admin");
        let exported = serde_json::to_string(&catalog.export()).unwrap();
        assert!(!exported.contains("s3cret"));
        let mut clear = SaveDbConnection {
            id: Some(mongo.connection.id.clone()),
            name: "cache".into(),
            engine: "redis".into(),
            host: "db.internal".into(),
            port: Some(6379),
            database: "0".into(),
            user: String::new(),
            auth_database: String::new(),
            tls: "disabled".into(),
            ssh_session_id: None,
            password: None,
            clear_secret: true,
        };
        clear.id = Some(redis.connection.id.clone());
        let cleared = catalog.save(clear, &secrets).unwrap();
        assert!(cleared.connection.secret_id.is_empty());
    }

    #[test]
    fn sqlite_save_keeps_only_the_file_path() {
        let secrets = MemorySecretStore::default();
        let mut catalog = DbCatalog::default();
        let created = catalog
            .save(
                SaveDbConnection {
                    id: None,
                    name: "local".into(),
                    engine: "sqlite".into(),
                    host: "ignored".into(),
                    port: Some(1),
                    database: "/tmp/app.db".into(),
                    user: "ignored".into(),
                    auth_database: String::new(),
                    tls: "disabled".into(),
                    ssh_session_id: None,
                    password: None,
                    clear_secret: false,
                },
                &secrets,
            )
            .unwrap();
        assert!(created.connection.secret_id.is_empty());
        assert!(created.connection.host.is_empty());
        assert_eq!(created.connection.port, 0);
        assert_eq!(created.connection.database, "/tmp/app.db");
        assert!(!created.secret_written);
        let exported = serde_json::to_string(&catalog.export()).unwrap();
        assert!(!exported.contains("password"));
        assert_eq!(catalog.password(&created.connection.id, &secrets).unwrap(), "");
        let denied = catalog.save(
            SaveDbConnection {
                id: None,
                name: "local".into(),
                engine: "sqlite".into(),
                host: String::new(),
                port: None,
                database: "/tmp/app.db".into(),
                user: String::new(),
                auth_database: String::new(),
                tls: "disabled".into(),
                ssh_session_id: None,
                password: Some("secret".into()),
                clear_secret: false,
            },
            &secrets,
        );
        assert!(denied.is_err());
    }
}
