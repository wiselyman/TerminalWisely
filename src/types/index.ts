export type SessionKind = "local" | "ssh";

export type AuthMethod = "password" | "privatekey";

export interface SessionInfo {
  id: string;
  title: string;
  kind: SessionKind;
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

export interface TabSession extends SessionInfo {
  active: boolean;
}

export interface ToastItem {
  id: string;
  message: string;
  success: boolean;
}
