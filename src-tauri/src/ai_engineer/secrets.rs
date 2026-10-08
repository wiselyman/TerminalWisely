//! AI settings catalog. API keys stay in the OS keychain.

use serde::{Deserialize, Serialize};
use tauri::AppHandle;
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
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(default)]
    pub has_api_key: bool,
    /// Keychain account. The API key itself is not stored in the catalog.
    #[serde(default, skip_serializing_if = "String::is_empty")]
    pub secret_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct StoredSettings {
    active_profile_id: String,
    profiles: Vec<AiModelProfile>,
    #[serde(default)]
    security_mode: String,
    /// Composer agent: builtin | cursor | codex | claude (same persistence as model).
    #[serde(default)]
    agent_runtime: String,
    /// Legacy field — ignored. Local Cursor CLI uses `cursor-agent login`.
    #[serde(default, skip_serializing)]
    cursor_api_key: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiSettingsView {
    pub active_profile_id: String,
    pub profiles: Vec<AiModelProfile>,
    pub security_mode: String,
    #[serde(default = "default_agent_runtime")]
    pub agent_runtime: String,
}

fn default_agent_runtime() -> String {
    "builtin".into()
}

#[derive(Debug, Clone, Deserialize)]
pub struct AiSettingsUpdate {
    pub active_profile_id: Option<String>,
    pub profiles: Option<Vec<AiModelProfile>>,
    pub security_mode: Option<String>,
    pub agent_runtime: Option<String>,
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

fn is_placeholder_profile(p: &AiModelProfile) -> bool {
    p.id == "default" && p.model.trim().is_empty()
}

fn normalize_agent_runtime(raw: &str) -> String {
    match raw.trim() {
        "cursor" | "codex" | "claude" => raw.trim().to_string(),
        _ => "builtin".into(),
    }
}

fn sanitize_profiles(mut s: StoredSettings) -> StoredSettings {
    s.profiles.retain(|p| p.model.trim().len() > 0 && !is_placeholder_profile(p));
    if s.active_profile_id.is_empty()
        || !s.profiles.iter().any(|p| p.id == s.active_profile_id)
    {
        s.active_profile_id = s.profiles.first().map(|p| p.id.clone()).unwrap_or_default();
    }
    s.agent_runtime = normalize_agent_runtime(&s.agent_runtime);
    // Drop legacy Cursor API key from disk on next save.
    s.cursor_api_key = None;
    s
}

fn empty_settings() -> StoredSettings {
    StoredSettings {
        active_profile_id: String::new(),
        profiles: vec![],
        security_mode: "safe".into(),
        agent_runtime: "builtin".into(),
        cursor_api_key: None,
    }
}

fn seal_profile_secrets(
    settings: &mut StoredSettings,
    secrets: &dyn crate::db::secrets::SecretStore,
) -> Result<(), String> {
    for profile in &mut settings.profiles {
        if let Some(key) = profile.api_key.clone().filter(|value| !value.is_empty()) {
            if profile.secret_id.is_empty() {
                profile.secret_id = format!("ai-{}", profile.id);
            }
            secrets.put(&profile.secret_id, &key)?;
        }
        profile.api_key = None;
    }
    settings.cursor_api_key = None;
    Ok(())
}

fn open_profile_secrets(
    settings: &mut StoredSettings,
    secrets: &dyn crate::db::secrets::SecretStore,
) -> Result<bool, String> {
    let mut migrated = false;
    for profile in &mut settings.profiles {
        if let Some(key) = profile.api_key.clone().filter(|value| !value.is_empty()) {
            if profile.secret_id.is_empty() {
                profile.secret_id = format!("ai-{}", profile.id);
            }
            secrets.put(&profile.secret_id, &key)?;
            migrated = true;
        }
        if !profile.secret_id.is_empty() {
            profile.api_key = secrets.get(&profile.secret_id)?;
        }
        profile.has_api_key = profile
            .api_key
            .as_ref()
            .map(|key| !key.is_empty())
            .unwrap_or(false);
    }
    Ok(migrated)
}

fn load_stored(app: &AppHandle) -> AppResult<StoredSettings> {
    let roots = crate::durable::app_roots(app);
    let document = crate::durable::load_value(&roots, STORE_FILE).map_err(AppError::msg)?;
    let Some(value) = document.get("settings") else {
        return Ok(empty_settings());
    };
    let mut s: StoredSettings =
        serde_json::from_value(value.clone()).map_err(|e| AppError::msg(e.to_string()))?;
    s = sanitize_profiles(s);
    if s.security_mode.is_empty() {
        s.security_mode = "safe".into();
    }
    let dir = crate::durable::app_roots(app).primary;
    let ids = s
        .profiles
        .iter()
        .filter(|profile| !profile.secret_id.is_empty())
        .map(|profile| profile.secret_id.clone())
        .collect::<Vec<_>>();
    crate::db::secrets::FileVault::import_legacy_once(
        &dir,
        crate::db::secrets::AI_KEYCHAIN_SERVICE,
        &ids,
        &crate::db::secrets::KeyringSecretStore::ai(),
    )
    .map_err(AppError::msg)?;
    let secrets = crate::db::secrets::FileVault::open(&dir, crate::db::secrets::AI_KEYCHAIN_SERVICE)
        .map_err(AppError::msg)?;
    let migrated = open_profile_secrets(&mut s, &secrets).map_err(AppError::msg)?;
    if migrated {
        store_settings(app, &s, crate::durable::WriteMode::KeepRecords)?;
    }
    Ok(s)
}

fn store_settings(
    app: &AppHandle,
    settings: &StoredSettings,
    mode: crate::durable::WriteMode,
) -> AppResult<()> {
    let mut disk = settings.clone();
    let secrets = crate::db::secrets::FileVault::open(
        &crate::durable::app_roots(app).primary,
        crate::db::secrets::AI_KEYCHAIN_SERVICE,
    )
    .map_err(AppError::msg)?;
    seal_profile_secrets(&mut disk, &secrets)
        .map_err(AppError::msg)?;
    let value = serde_json::json!({ "settings": disk });
    crate::durable::save_value(&crate::durable::app_roots(app), STORE_FILE, &value, mode)
        .map_err(AppError::msg)
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
        agent_runtime: normalize_agent_runtime(&s.agent_runtime),
    }
}

pub fn get_ai_settings(app: &AppHandle) -> AppResult<AiSettingsView> {
    Ok(to_view(load_stored(app)?))
}

pub fn current_security_mode(app: &AppHandle) -> AppResult<String> {
    Ok(load_stored(app)?.security_mode)
}

pub fn save_ai_settings(app: &AppHandle, update: AiSettingsUpdate) -> AppResult<AiSettingsView> {
    let mut s = load_stored(app)?;
    if let Some(mode) = update.security_mode {
        s.security_mode = mode;
    }
    if let Some(id) = update.active_profile_id {
        s.active_profile_id = id;
    }
    if let Some(runtime) = update.agent_runtime {
        s.agent_runtime = normalize_agent_runtime(&runtime);
    }
    let profiles_were_set = update.profiles.is_some();
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
    let mode = if profiles_were_set {
        crate::durable::WriteMode::AllowEmpty
    } else {
        crate::durable::WriteMode::KeepRecords
    };
    store_settings(app, &s, mode)?;
    let view = to_view(s);
    // Model switch used to call restart_sidecar synchronously here — that blocked
    // the UI for seconds (Python cold start). Hot-reload env on the live process
    // in the background; fall back to restart only if reload fails.
    let app2 = app.clone();
    std::thread::spawn(move || {
        let _ = crate::ai_engineer::sidecar::apply_settings_to_sidecar(&app2);
    });
    Ok(view)
}

/// Attach stored profile credentials for a chat start.
/// Drops any client-supplied `model_binding` so the webview cannot inject a key.
pub fn inject_profile_binding(app: &AppHandle, path: &str, body: String) -> String {
    if body.is_empty() {
        return body;
    }
    let inject = path.ends_with("/v1/chat/start");
    if !inject {
        return body;
    }
    let Ok(mut value) = serde_json::from_str::<serde_json::Value>(&body) else {
        return body;
    };
    let Some(obj) = value.as_object_mut() else {
        return body;
    };
    obj.remove("model_binding");
    let profile_id = obj
        .get("profile_id")
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .trim()
        .to_string();
    if profile_id.is_empty() {
        return serde_json::to_string(&value).unwrap_or(body);
    }
    let Ok(stored) = load_stored(app) else {
        return serde_json::to_string(&value).unwrap_or(body);
    };
    let Some(profile) = stored.profiles.iter().find(|p| p.id == profile_id) else {
        return serde_json::to_string(&value).unwrap_or(body);
    };
    obj.insert(
        "model_binding".into(),
        serde_json::json!({
            "provider": profile.provider,
            "model": profile.model,
            "base_url": profile.base_url,
            "ollama_base_url": profile.ollama_base_url,
            "api_key": profile.api_key.clone().unwrap_or_default(),
        }),
    );
    serde_json::to_string(&value).unwrap_or(body)
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
    if api_key.is_empty() {
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

#[cfg(test)]
mod tests {
    use super::normalize_agent_runtime;

    #[test]
    fn agent_runtime_normalizes() {
        assert_eq!(normalize_agent_runtime("cursor"), "cursor");
        assert_eq!(normalize_agent_runtime("codex"), "codex");
        assert_eq!(normalize_agent_runtime("claude"), "claude");
        assert_eq!(normalize_agent_runtime("builtin"), "builtin");
        assert_eq!(normalize_agent_runtime(""), "builtin");
        assert_eq!(normalize_agent_runtime("gpt"), "builtin");
    }

    #[test]
    fn api_key_moves_to_secret_store_without_trimming() {
        use crate::db::secrets::{MemorySecretStore, SecretStore};
        let secrets = MemorySecretStore::default();
        let mut settings = super::StoredSettings {
            active_profile_id: "p".into(),
            profiles: vec![super::AiModelProfile {
                id: "p".into(),
                name: "n".into(),
                provider: "openai".into(),
                model: "m".into(),
                base_url: String::new(),
                ollama_base_url: String::new(),
                api_key: Some(" sk ".into()),
                has_api_key: true,
                secret_id: String::new(),
            }],
            security_mode: "safe".into(),
            agent_runtime: "builtin".into(),
            cursor_api_key: None,
        };
        assert!(super::open_profile_secrets(&mut settings, &secrets).unwrap());
        assert_eq!(settings.profiles[0].api_key.as_deref(), Some(" sk "));
        super::seal_profile_secrets(&mut settings, &secrets).unwrap();
        let raw = serde_json::to_string(&settings).unwrap();
        assert!(!raw.contains(" sk "));
        assert!(raw.contains("secret_id"));
        assert_eq!(secrets.get("ai-p").unwrap().as_deref(), Some(" sk "));
    }
}
