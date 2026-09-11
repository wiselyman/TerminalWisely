# Phase 0A — Existing Terminal APIs

## Session lifecycle

- Create/reconnect/close: `SessionManager` + Tauri commands in `src-tauri/src/commands/mod.rs`
- One `russh` Handle per SSH tab; interactive shell is one channel; tools open extra exec channels.

## AI must use

```text
SessionManager::ssh_snapshot(session_id)
  → exec_command_capture(&handle, command)
  → (stdout, stderr, exit_code)
```

Optional sudo: `exec_remote_sudo_ai_capture`.

## Must NOT use

- `terminal_input` / PTY scraping for tool results
- `open_transfer_connection` / second SSH login for AI commands

## Identity fields

`SessionInfo`: id, title, kind, server_id, host_fingerprint, os_id, os_name, remote_home  
Plus: `get_session_cwd`, `SshConnectRequest` username/host/port from snapshot.

## Frontend active session

`useSessionStore.activeTabId` → current `TabSession`.

## Streaming note

Interactive UI uses `terminal-output` events. AI tool results return synchronously via exec capture — they may optionally be mirrored to the TTY later; Phase 1 does not require mirroring.
