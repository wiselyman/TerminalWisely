# AI Engineer UI chat history on disk (SQLite)

Date: 2026-09-07  
Status: approved direction B (complete history + migrate localStorage)

## Problem

WebView `localStorage` (~5MB) cannot hold multi-host AI chat threads with tool
outputs. Silent `QuotaExceeded` drops recent chats and can crash the shell.

## Goal

- Persist **complete** UI chat history (including long tool outputs) on disk
- No WebView quota ceiling for chat
- Migrate existing `tw.aiEngineer.chatByScope.v1/v2` once
- Keep per-host scope model (`server:…` / `cluster:…` / `session:…`)

## Non-goals (this slice)

- Full-text search UI polish (data is queryable; basic title filter can stay FE)
- Merging LAN vs NetBird host identities
- Replacing sidecar SessionLog (agent evidence remains separate)

## Approach

SQLite file under Tauri `app_data_dir/ai-engineer/ui-chat.sqlite3`, accessed only
via Rust commands (same path pattern as sidecar data).

### Schema

- `scope_meta(scope PK, active_thread_id)`
- `threads(id PK, scope, title, created_at, updated_at, security_mode,
  interaction_mode, messages_json)`
- `meta(key PK, value)` — migration flags

### FE

- `aiEngineerStore` load/save through invoke, not `localStorage`
- Debounced upsert of the active thread; delete thread / switch active as today
- On first successful disk load after migration: remove chat keys from localStorage

### Migration

1. If `meta.migrated_localstorage_v2` unset and FE still has v2 (or v1) JSON:
2. Import all scopes/threads into SQLite
3. Set migration flag; delete `tw.aiEngineer.chatByScope.v1` / `.v2`
4. If SQLite already has data and localStorage also has data: merge by thread id
   (prefer newer `updatedAt`)

## Success

- App boots with multi‑MB history without quota errors
- Old 5060 / spark threads visible after one upgrade
- New messages survive restart without localStorage growth
