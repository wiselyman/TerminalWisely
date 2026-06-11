export type SessionKind = "local" | "ssh";

/** `all` = 全部服务器；`server` = 当前服务器 */
export type DirectoryShortcutScope = "all" | "server";

export interface DirectoryShortcut {
  id: string;
  path: string;
  scope: DirectoryShortcutScope;
  /** Set when scope is `server`; `user@host:port` or `local`. */
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
}

export interface ProcessEntry {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_bytes: number;
  ports: number[];
}

export interface ProcessListResult {
  processes: ProcessEntry[];
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
  sampled_at: number;
}
