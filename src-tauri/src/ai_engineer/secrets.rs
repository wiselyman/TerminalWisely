//! Minimal AI settings store (model profiles). Secrets stay in Tauri plugin-store.

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};
use tauri_plugin_store::StoreExt;
use uuid::Uuid;

use crate::error::{AppError, AppResult};

const STORE_FILE: &str = "ai-engineer.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiModelProfile {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub ollama_base_url: String,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub has_api_key: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct StoredSettings {
    active_profile_id: String,
    profiles: Vec<AiModelProfile>,
    #[serde(default)]
    security_mode: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettingsView {
    pub active_profile_id: String,
    pub profiles: Vec<AiModelProfile>,
    pub security_mode: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiSettingsUpdate {
    pub active_profile_id: Option<String>,
    pub profiles: Option<Vec<AiModelProfile>>,
    pub security_mode: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct SidecarEnvSettings {
    pub provider: String,
    pub model: String,
    pub base_url: String,
    pub ollama_base_url: String,
    pub api_key: Option<String>,
    pub security_mode: String,
}

fn default_profiles() -> Vec<AiModelProfile> {
    vec![AiModelProfile {
        id: "default".into(),
        name: "Default".into(),
        provider: "openai".into(),
        model: String::new(),
        base_url: String::new(),
        ollama_base_url: "http://127.0.0.1:11434".into(),
        api_key: None,
        has_api_key: false,
    }]
}

fn load_stored(app: &AppHandle) -> AppResult<StoredSettings> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::msg(e.to_string()))?;
    let Some(value) = store.get("settings") else {
        let profiles = default_profiles();
        return Ok(StoredSettings {
            active_profile_id: profiles[0].id.clone(),
            profiles,
            security_mode: "safe".into(),
        });
    };
    let mut s: StoredSettings =
        serde_json::from_value(value).map_err(|e| AppError::msg(e.to_string()))?;
    if s.profiles.is_empty() {
        s.profiles = default_profiles();
        s.active_profile_id = s.profiles[0].id.clone();
    }
    if s.security_mode.is_empty() {
        s.security_mode = "safe".into();
    }
    Ok(s)
}

fn to_view(mut s: StoredSettings) -> AiSettingsView {
    for p in &mut s.profiles {
        p.has_api_key = p.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false);
        // Never send raw key to frontend.
        p.api_key = None;
    }
    AiSettingsView {
        active_profile_id: s.active_profile_id,
        profiles: s.profiles,
        security_mode: s.security_mode,
    }
}

pub fn get_ai_settings(app: &AppHandle) -> AppResult<AiSettingsView> {
    Ok(to_view(load_stored(app)?))
}

pub fn save_ai_settings(app: &AppHandle, update: AiSettingsUpdate) -> AppResult<AiSettingsView> {
    let mut s = load_stored(app)?;
    if let Some(mode) = update.security_mode {
        s.security_mode = mode;
    }
    if let Some(id) = update.active_profile_id {
        s.active_profile_id = id;
    }
    if let Some(profiles) = update.profiles {
        // Merge api keys: empty incoming key keeps previous.
        let mut merged = Vec::new();
        for mut p in profiles {
            if p.id.is_empty() {
                p.id = Uuid::new_v4().to_string();
            }
            let prev_key = s
                .profiles
                .iter()
                .find(|x| x.id == p.id)
                .and_then(|x| x.api_key.clone());
            if p.api_key.as_ref().map(|k| k.is_empty()).unwrap_or(true) {
                p.api_key = prev_key;
            }
            p.has_api_key = p.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false);
            merged.push(p);
        }
        s.profiles = merged;
    }
    if !s.profiles.iter().any(|p| p.id == s.active_profile_id) {
        s.active_profile_id = s.profiles.first().map(|p| p.id.clone()).unwrap_or_default();
    }
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::msg(e.to_string()))?;
    store.set(
        "settings",
        serde_json::to_value(&s).map_err(|e| AppError::msg(e.to_string()))?,
    );
    store.save().map_err(|e| AppError::msg(e.to_string()))?;
    // Reload sidecar env (API key / model / base URL) for the next chat.
    let _ = crate::ai_engineer::sidecar::restart_sidecar(app);
    Ok(to_view(s))
}

pub fn load_settings_for_sidecar(app: &AppHandle) -> AppResult<SidecarEnvSettings> {
    let s = load_stored(app)?;
    let profile = s
        .profiles
        .iter()
        .find(|p| p.id == s.active_profile_id)
        .cloned()
        .or_else(|| s.profiles.first().cloned())
        .unwrap_or_else(|| default_profiles().remove(0));
    Ok(SidecarEnvSettings {
        provider: profile.provider,
        model: profile.model,
        base_url: profile.base_url,
        ollama_base_url: profile.ollama_base_url,
        api_key: profile.api_key,
        security_mode: if s.security_mode.is_empty() {
            "safe".into()
        } else {
            s.security_mode
        },
    })
}
