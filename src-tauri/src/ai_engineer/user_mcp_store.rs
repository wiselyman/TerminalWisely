//! Persist user-attached MCP server config next to AI engineer data.

use crate::error::{AppError, AppResult};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;
use tauri::AppHandle;
use tauri::Manager;

const FILE_NAME: &str = "user_mcp.json";

fn data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::msg(e.to_string()))?
        .join("ai-engineer");
    fs::create_dir_all(&dir).map_err(AppError::from)?;
    Ok(dir)
}

pub fn user_mcp_path(app: &AppHandle) -> AppResult<PathBuf> {
    Ok(data_dir(app)?.join(FILE_NAME))
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct UserMcpFile {
    #[serde(rename = "mcpServers", default)]
    pub mcp_servers: BTreeMap<String, UserMcpServerSpec>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMcpServerSpec {
    pub command: String,
    #[serde(default)]
    pub args: Vec<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub env: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UserMcpView {
    pub path: String,
    pub text: String,
    pub servers: Vec<UserMcpServerRow>,
}

#[derive(Debug, Clone, Serialize)]
pub struct UserMcpServerRow {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub env: BTreeMap<String, String>,
}

pub fn get_user_mcp(app: &AppHandle) -> AppResult<UserMcpView> {
    let path = user_mcp_path(app)?;
    let text = if path.exists() {
        fs::read_to_string(&path).map_err(AppError::from)?
    } else {
        "{\n  \"mcpServers\": {}\n}\n".to_string()
    };
    let parsed: UserMcpFile = serde_json::from_str(&text).unwrap_or_default();
    let mut servers: Vec<UserMcpServerRow> = parsed
        .mcp_servers
        .into_iter()
        .filter(|(_, spec)| !spec.command.trim().is_empty())
        .map(|(name, spec)| UserMcpServerRow {
            name,
            command: spec.command,
            args: spec.args,
            env: spec.env,
        })
        .collect();
    servers.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(UserMcpView {
        path: path.display().to_string(),
        text,
        servers,
    })
}

pub fn save_user_mcp(app: &AppHandle, text: &str) -> AppResult<UserMcpView> {
    let path = user_mcp_path(app)?;
    let trimmed = text.trim();
    let body = if trimmed.is_empty() {
        "{\n  \"mcpServers\": {}\n}\n".to_string()
    } else {
        // Validate JSON before writing.
        let _: UserMcpFile = serde_json::from_str(trimmed)
            .map_err(|e| AppError::msg(format!("invalid user_mcp.json: {e}")))?;
        if trimmed.ends_with('\n') {
            trimmed.to_string()
        } else {
            format!("{trimmed}\n")
        }
    };
    fs::write(&path, body).map_err(AppError::from)?;
    get_user_mcp(app)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_env_map() {
        let raw = r#"{"mcpServers":{"x":{"command":"npx","args":["-y"],"env":{"A":"1"}}}}"#;
        let file: UserMcpFile = serde_json::from_str(raw).unwrap();
        assert_eq!(file.mcp_servers["x"].env.get("A").map(String::as_str), Some("1"));
    }
}
