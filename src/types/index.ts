export type SessionKind = "ssh";

/** `all` = 全部服务器；`server` = 当前服务器 */
export type DirectoryShortcutScope = "all" | "server";

export interface DirectoryShortcut {
  id: string;
  path: string;
  scope: DirectoryShortcutScope;
  /** Set when scope is `server`; typically `user@host:port`. */
  server_id?: string | null;
}

export type AuthMethod = "password" | "privatekey";

export interface SessionInfo {
  id: string;
  title: string;
  kind: SessionKind;
  remote_home?: string | null;
  server_id?: string | null;
  os_id?: string | null;
  os_name?: string | null;
  host_fingerprint?: string | null;
}

export interface SessionMetadataUpdatedPayload {
  session_id: string;
  os_id?: string | null;
  os_name?: string | null;
  remote_home?: string | null;
}

export interface SshConnectRequest {
  host: string;
  port: number;
  username: string;
  auth_method: AuthMethod;
  password?: string | null;
  private_key_path?: string | null;
  passphrase?: string | null;
  session_title?: string | null;
}

export interface SavedConnection {
  id: string;
  name: string;
  host: string;
  port: number;
  username: string;
  auth_method: AuthMethod;
  private_key_path?: string | null;
  has_password: boolean;
  os_id?: string | null;
  os_name?: string | null;
}

export interface SshConnectResult {
  session: SessionInfo;
  os_id?: string | null;
  os_name?: string | null;
}

export interface DeviceRecord {
  id: string;
  host: string;
  port: number;
  username: string;
  auth_method: AuthMethod;
  private_key_path?: string | null;
  last_connected_at: string;
  connect_count: number;
}

export interface TerminalOutputPayload {
  session_id: string;
  data: string;
}

export interface SessionLifecyclePayload {
  session_id: string;
}

export interface TransferProgressPayload {
  transfer_id: string;
  session_id: string;
  filename: string;
  transferred: number;
  total: number;
  direction: "upload" | "download" | string;
  /** `scp` server-to-server, `stream` cat relay, `sftp` sftp relay */
  method?: string | null;
  destination_path?: string | null;
}

export interface TransferCompletePayload {
  transfer_id: string;
  session_id: string;
  message: string;
  success: boolean;
  direction: "upload" | "download" | string;
  filenames: string[];
  local_path?: string | null;
}

export interface UploadFileResult {
  filename: string;
  remote_path: string;
  local_path: string;
}

export interface SendToRequest {
  fromSessionId: string;
  remotePath: string;
}

export interface TransferRemoteRequest {
  from_session_id: string;
  remote_path: string;
  to_session_id: string;
  remote_dir?: string | null;
  transfer_id?: string | null;
  sudo_password?: string | null;
}

export interface PathSizeRequest {
  session_id: string;
  path: string;
  sudo_password?: string | null;
}

export interface PathSizeResult {
  path: string;
  kind: "file" | "directory" | string;
  size_bytes: number;
}

export interface FsPathRequest {
  session_id: string;
  path: string;
  sudo_password?: string | null;
}

export interface FsRenameRequest {
  session_id: string;
  path: string;
  new_name: string;
  sudo_password?: string | null;
}

export interface FsMoveRequest {
  session_id: string;
  path: string;
  dest_dir: string;
  sudo_password?: string | null;
}

export type ConnectionStatus = "connecting" | "ready";

export interface TabSession extends SessionInfo {
  active: boolean;
  connectionStatus?: ConnectionStatus;
}

export interface ToastItem {
  id: string;
  message: string;
  success: boolean;
}

export interface PreviewOpenResult {
  handle_id: string;
  kind: string;
  session_id: string;
  resolved_path: string;
  filename: string;
  extension: string;
  total_size: number;
  truncated: boolean;
  editable: boolean;
  text_content?: string | null;
  local_cache_path?: string | null;
  uses_sudo?: boolean;
}

export interface ProcessEntry {
  pid: number;
  name: string;
  command?: string | null;
  cpu_percent: number;
  memory_bytes: number;
  ports: number[];
}

export interface ProcessListResult {
  processes: ProcessEntry[];
}

export interface UnixUserEntry {
  name: string;
  uid: number;
  description?: string | null;
}

export interface UnixGroupEntry {
  name: string;
  gid: number;
}

export interface PasswdAccountsResult {
  users: UnixUserEntry[];
  groups: UnixGroupEntry[];
}

export type FindTypeFilter = "all" | "file" | "directory";

export interface FindFileEntry {
  path: string;
  kind: "file" | "directory";
  size_bytes?: number | null;
}

export interface FindFilesResult {
  entries: FindFileEntry[];
  truncated: boolean;
  start_path: string;
}

export type CommandSubcategory =
  | "service"
  | "journal"
  | "disk"
  | "process"
  | "network"
  | "package"
  | "file"
  | "user"
  | "cron"
  | "kernel";

export type DistroFamily =
  | "universal"
  | "debian"
  | "rhel"
  | "alpine"
  | "arch"
  | "suse";

export type CommandShortcutScope = "all" | "server";

export type SearchKeywordVariant = "package" | "file-content" | "filename";

export type CommandParamInputKind =
  | "text"
  | "systemd-unit"
  | "path"
  | "process-pid"
  | "process-name"
  | "chmod-mode"
  | "unix-user"
  | "unix-group"
  | "search-keyword"
  | "port";

export interface CommandParam {
  name: string;
  label: string;
  default?: string;
  required?: boolean;
  placeholder?: string;
  inputKind?: CommandParamInputKind;
  keywordVariant?: SearchKeywordVariant;
}

export interface CommandTemplate {
  id: string;
  title: string;
  description?: string;
  subcategory: CommandSubcategory;
  distroFamilies: DistroFamily[];
  template: string;
  params: CommandParam[];
  scope: CommandShortcutScope;
  server_id?: string | null;
  builtin: boolean;
}

export interface LoggedInUser {
  username: string;
  terminal?: string | null;
  host?: string | null;
  login_time?: string | null;
}

export interface DiskUsageEntry {
  mount_point: string;
  filesystem?: string | null;
  total_bytes: number;
  used_bytes: number;
}

export interface NetworkCounter {
  name: string;
  rx_bytes: number;
  tx_bytes: number;
}

export interface DiskIoCounter {
  read_bytes: number;
  write_bytes: number;
}

export interface HostStatsSnapshot {
  hostname: string;
  os_name: string;
  os_version?: string | null;
  kernel_version?: string | null;
  arch: string;
  timezone?: string | null;
  cpu_usage_percent: number;
  cpu_core_count: number;
  memory_total_bytes: number;
  memory_used_bytes: number;
  swap_total_bytes: number;
  swap_used_bytes: number;
  load_avg: [number, number, number];
  uptime_secs: number;
  process_count: number;
  logged_in_users: LoggedInUser[];
  disks: DiskUsageEntry[];
  networks: NetworkCounter[];
  disk_io?: DiskIoCounter;
  sampled_at: number;
}
