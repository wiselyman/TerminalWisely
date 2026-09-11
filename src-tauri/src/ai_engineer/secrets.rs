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
    vec![]
}

fn is_placeholder_profile(p: &AiModelProfile) -> bool {
    p.id == "default" && p.model.trim().is_empty()
}

fn sanitize_profiles(mut s: StoredSettings) -> StoredSettings {
    s.profiles.retain(|p| p.model.trim().len() > 0 && !is_placeholder_profile(p));
    if s.active_profile_id.is_empty()
        || !s.profiles.iter().any(|p| p.id == s.active_profile_id)
    {
        s.active_profile_id = s.profiles.first().map(|p| p.id.clone()).unwrap_or_default();
    }
    s
}

fn load_stored(app: &AppHandle) -> AppResult<StoredSettings> {
    let store = app
        .store(STORE_FILE)
        .map_err(|e| AppError::msg(e.to_string()))?;
    let Some(value) = store.get("settings") else {
        return Ok(StoredSettings {
            active_profile_id: String::new(),
            profiles: vec![],
            security_mode: "safe".into(),
        });
    };
    let s: StoredSettings =
        serde_json::from_value(value).map_err(|e| AppError::msg(e.to_string()))?;
    let mut s = sanitize_profiles(s);
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
    s = sanitize_profiles(s);
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
        .filter(|p| !p.model.trim().is_empty())
        .ok_or_else(|| AppError::msg("No AI model profile configured".to_string()))?;
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

#[derive(Debug, Clone, Deserialize)]
pub struct AiListModelsRequest {
    pub provider: String,
    #[serde(default)]
    pub base_url: String,
    #[serde(default)]
    pub ollama_base_url: String,
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default)]
    pub api_key: Option<String>,
    #[serde(default)]
    pub configured_model: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AiListModelsResponse {
    pub models: Vec<String>,
    pub error: Option<String>,
    #[serde(default)]
    pub resolved_model: Option<String>,
    #[serde(default)]
    pub auto_corrected: bool,
}

/// Resolve stored API key (if any) and ask sidecar ModelGateway to list models.
pub fn list_ai_models(app: &AppHandle, request: AiListModelsRequest) -> AppResult<AiListModelsResponse> {
    let mut api_key = request.api_key.unwrap_or_default();
    if api_key.trim().is_empty() {
        if let Some(id) = request.profile_id.as_ref().filter(|s| !s.is_empty()) {
            let stored = load_stored(app)?;
            if let Some(prev) = stored.profiles.iter().find(|p| &p.id == id) {
                if let Some(k) = prev.api_key.as_ref().filter(|k| !k.is_empty()) {
                    api_key = k.clone();
                }
            }
        }
    }
    let body = serde_json::json!({
        "provider": request.provider,
        "base_url": request.base_url,
        "ollama_base_url": request.ollama_base_url,
        "api_key": api_key,
        "configured_model": request.configured_model,
    });
    let resp = crate::ai_engineer::sidecar_http(
        app,
        crate::ai_engineer::SidecarHttpRequest {
            method: "POST".into(),
            path: "/v1/models/list".into(),
            body: Some(body.to_string()),
            timeout_ms: Some(30_000),
        },
    )?;
    if resp.status == 0 || resp.status >= 400 {
        let detail = extract_sidecar_error_detail(&resp.body)
            .unwrap_or_else(|| resp.body.chars().take(400).collect::<String>());
        return Ok(AiListModelsResponse {
            models: vec![],
            error: Some(format!(
                "Model list failed (HTTP {}): {}",
                resp.status,
                if detail.is_empty() {
                    "no response body".into()
                } else {
                    detail
                }
            )),
            resolved_model: None,
            auto_corrected: false,
        });
    }
    #[derive(Deserialize)]
    struct Body {
        #[serde(default)]
        models: Vec<String>,
        #[serde(default)]
        error: Option<String>,
        #[serde(default)]
        resolved_model: Option<String>,
        #[serde(default)]
        auto_corrected: bool,
    }
    match serde_json::from_str::<Body>(&resp.body) {
        Ok(b) => {
            let error = if b.error.as_ref().map(|e| !e.is_empty()).unwrap_or(false) {
                b.error
            } else if b.models.is_empty() {
                Some(
                    "No models returned. Check Base URL / API key, then try Refresh again."
                        .into(),
                )
            } else {
                None
            };
            Ok(AiListModelsResponse {
                models: if error.is_some() { vec![] } else { b.models },
                error,
                resolved_model: b.resolved_model.filter(|s| !s.is_empty()),
                auto_corrected: b.auto_corrected,
            })
        }
        Err(e) => Ok(AiListModelsResponse {
            models: vec![],
            error: Some(format!(
                "Bad models list response: {e}. Body: {}",
                resp.body.chars().take(200).collect::<String>()
            )),
            resolved_model: None,
            auto_corrected: false,
        }),
    }
}

fn extract_sidecar_error_detail(body: &str) -> Option<String> {
    #[derive(Deserialize)]
    struct Detail {
        detail: serde_json::Value,
        #[serde(default)]
        error: Option<String>,
    }
    if let Ok(v) = serde_json::from_str::<Detail>(body) {
        if let Some(err) = v.error.filter(|s| !s.is_empty()) {
            return Some(err);
        }
        match v.detail {
            serde_json::Value::String(s) if !s.is_empty() => return Some(s),
            other if !other.is_null() => return Some(other.to_string()),
            _ => {}
        }
    }
    if let Ok(v) = serde_json::from_str::<serde_json::Value>(body) {
        if let Some(err) = v.get("error").and_then(|x| x.as_str()) {
            if !err.is_empty() {
                return Some(err.to_string());
            }
        }
    }
    None
}
