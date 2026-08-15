use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum SessionKind {
    Ssh,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionInfo {
    pub id: String,
    pub title: String,
    pub kind: SessionKind,
    pub remote_home: Option<String>,
    /// Stable server identity for shortcuts: `user@host:port`.
    #[serde(default)]
    pub server_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub os_id: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub os_name: Option<String>,
    /// SSH host key fingerprint (sha256) recorded at connect.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host_fingerprint: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalOutputPayload {
    pub session_id: String,
    pub data: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionLifecyclePayload {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferProgressPayload {
    pub transfer_id: String,
    pub session_id: String,
    pub filename: String,
    pub transferred: u64,
    pub total: u64,
    pub direction: String,
    /// `scp` = server-to-server scp, `stream` = cat relay via app, `sftp` = sftp relay
    #[serde(default)]
    pub method: Option<String>,
    #[serde(default)]
    pub destination_path: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferCompletePayload {
    pub transfer_id: String,
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
    #[serde(default)]
    pub os_id: Option<String>,
    #[serde(default)]
    pub os_name: Option<String>,
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
    #[serde(default)]
    pub os_id: Option<String>,
    #[serde(default)]
    pub os_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SshConnectResult {
    pub session: SessionInfo,
    pub os_id: Option<String>,
    pub os_name: Option<String>,
}

/// Emitted after background SSH metadata probe (OS logo, home dir) completes.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionMetadataUpdated {
    pub session_id: String,
    pub os_id: Option<String>,
    pub os_name: Option<String>,
    pub remote_home: Option<String>,
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
            os_id: saved.os_id.clone(),
            os_name: saved.os_name.clone(),
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
    #[serde(default)]
    pub transfer_id: Option<String>,
    #[serde(default)]
    pub sudo_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadFileRequest {
    pub session_id: String,
    pub remote_path: String,
    pub local_path: Option<String>,
    #[serde(default)]
    pub transfer_id: Option<String>,
    #[serde(default)]
    pub sudo_password: Option<String>,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InsertTerminalCommandRequest {
    pub session_id: String,
    pub command: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbeRemotePathRequest {
    pub session_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewOpenRequest {
    pub session_id: String,
    pub path: String,
    #[serde(default)]
    pub sudo_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewCloseRequest {
    pub handle_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OpenPreviewHandleRequest {
    pub handle_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewSaveRequest {
    pub handle_id: String,
    pub content: String,
    #[serde(default)]
    pub sudo_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewOpenResult {
    pub handle_id: String,
    pub kind: String,
    pub session_id: String,
    pub resolved_path: String,
    pub filename: String,
    pub extension: String,
    pub total_size: u64,
    pub truncated: bool,
    pub editable: bool,
    #[serde(default)]
    pub text_content: Option<String>,
    #[serde(default)]
    pub local_cache_path: Option<String>,
    #[serde(default)]
    pub uses_sudo: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathSizeRequest {
    pub session_id: String,
    pub path: String,
    #[serde(default)]
    pub sudo_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PathSizeResult {
    pub path: String,
    pub kind: String,
    pub size_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProbePathRequest {
    pub session_id: String,
    pub path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsPathRequest {
    pub session_id: String,
    pub path: String,
    #[serde(default)]
    pub sudo_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsRenameRequest {
    pub session_id: String,
    pub path: String,
    pub new_name: String,
    #[serde(default)]
    pub sudo_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FsMoveRequest {
    pub session_id: String,
    pub path: String,
    pub dest_dir: String,
    #[serde(default)]
    pub sudo_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TransferRemoteRequest {
    pub from_session_id: String,
    pub remote_path: String,
    pub to_session_id: String,
    pub remote_dir: Option<String>,
    #[serde(default)]
    pub transfer_id: Option<String>,
    #[serde(default)]
    pub sudo_password: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessEntry {
    pub pid: u32,
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    pub cpu_percent: f32,
    pub memory_bytes: u64,
    pub ports: Vec<u16>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessListResult {
    pub processes: Vec<ProcessEntry>,
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ProcessListMode {
    #[default]
    Full,
    Basic,
    Ports,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListProcessesRequest {
    pub session_id: String,
    #[serde(default)]
    pub mode: ProcessListMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListSystemdUnitsRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemdUnitsResult {
    pub units: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnixUserEntry {
    pub name: String,
    pub uid: u32,
    #[serde(default)]
    pub description: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UnixGroupEntry {
    pub name: String,
    pub gid: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ListPasswdAccountsRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PasswdAccountsResult {
    pub users: Vec<UnixUserEntry>,
    pub groups: Vec<UnixGroupEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletePathRequest {
    pub session_id: String,
    pub partial: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CompletePathResult {
    pub completions: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KillProcessRequest {
    pub session_id: String,
    pub pid: u32,
    #[serde(default)]
    pub force: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum FindEntryKind {
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum FindTypeFilter {
    #[default]
    All,
    File,
    Directory,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindFileEntry {
    pub path: String,
    pub kind: FindEntryKind,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size_bytes: Option<u64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindFilesResult {
    pub entries: Vec<FindFileEntry>,
    pub truncated: bool,
    pub start_path: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FindFilesRequest {
    pub session_id: String,
    pub path: String,
    #[serde(default = "default_find_name_pattern")]
    pub name_pattern: String,
    #[serde(default)]
    pub type_filter: FindTypeFilter,
    #[serde(default = "default_find_max_depth")]
    pub max_depth: u32,
    #[serde(default)]
    pub case_insensitive: bool,
}

fn default_find_name_pattern() -> String {
    String::new()
}

fn default_find_max_depth() -> u32 {
    8
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionCwdRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostStatsRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoggedInUser {
    pub username: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub terminal: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub host: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub login_time: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiskUsageEntry {
    pub mount_point: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub filesystem: Option<String>,
    pub total_bytes: u64,
    pub used_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkCounter {
    pub name: String,
    pub rx_bytes: u64,
    pub tx_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DiskIoCounter {
    #[serde(default)]
    pub read_bytes: u64,
    #[serde(default)]
    pub write_bytes: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HostStatsSnapshot {
    pub hostname: String,
    pub os_name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub os_version: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub kernel_version: Option<String>,
    pub arch: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub timezone: Option<String>,
    pub cpu_usage_percent: f32,
    pub cpu_core_count: u32,
    pub memory_total_bytes: u64,
    pub memory_used_bytes: u64,
    pub swap_total_bytes: u64,
    pub swap_used_bytes: u64,
    pub load_avg: [f64; 3],
    pub uptime_secs: u64,
    pub process_count: u32,
    pub logged_in_users: Vec<LoggedInUser>,
    pub disks: Vec<DiskUsageEntry>,
    pub networks: Vec<NetworkCounter>,
    #[serde(default)]
    pub disk_io: DiskIoCounter,
    pub sampled_at: i64,
}
