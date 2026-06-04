use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionKind {
    Local,
    Ssh,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub kind: SessionKind,
    pub remote_home: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgressPayload {
    pub session_id: String,
    pub filename: String,
    pub transferred: u64,
    pub total: u64,
    pub direction: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferCompletePayload {
    pub session_id: String,
    pub message: String,
    pub success: bool,
    pub direction: String,
    pub filenames: Vec<String>,
    pub local_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadFileResult {
    pub filename: String,
    pub remote_path: String,
    pub local_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthMethod {
    Password,
    PrivateKey,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectRequest {
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub password: Option<String>,
    pub private_key_path: Option<String>,
    pub passphrase: Option<String>,
    #[serde(default)]
    pub session_title: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedConnection {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub private_key_path: Option<String>,
    #[serde(default)]
    pub password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SavedConnectionView {
    pub id: String,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub private_key_path: Option<String>,
    pub has_password: bool,
}

impl From<&SavedConnection> for SavedConnectionView {
    fn from(saved: &SavedConnection) -> Self {
        Self {
            id: saved.id.clone(),
            name: saved.name.clone(),
            host: saved.host.clone(),
            port: saved.port,
            username: saved.username.clone(),
            auth_method: saved.auth_method.clone(),
            private_key_path: saved.private_key_path.clone(),
            has_password: saved.password.is_some(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceRecord {
    pub id: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub auth_method: AuthMethod,
    pub private_key_path: Option<String>,
    pub last_connected_at: String,
    pub connect_count: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UploadFilesRequest {
    pub session_id: String,
    pub local_paths: Vec<String>,
    pub remote_dir: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadFileRequest {
    pub session_id: String,
    pub remote_path: String,
    pub local_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnterDirectoryRequest {
    pub session_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertLocalPathsRequest {
    pub session_id: String,
    pub local_paths: Vec<String>,
}
