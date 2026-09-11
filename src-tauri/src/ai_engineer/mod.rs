//! Connected Terminal adapter + sidecar lifecycle for AI Linux Engineer.
//!
//! Remote commands MUST use the existing session's SSH handle via
//! `exec_command_capture` — never a second SSH login, never PTY scraping.

mod chat_history;
mod leases;
mod media_cache;
mod secrets;
mod sidecar;
mod terminal;

pub use chat_history::{
    import_localstorage_snapshot, load_chat_history, load_chat_history_index, load_chat_scope,
    mark_migrated, save_all_scopes, save_scope_bundle, ChatHistorySnapshot, ChatThreadRow,
    ScopeThreadBundle,
};
pub use media_cache::{
    cache_remote_media, resolve_media_id, store_image_bytes, CachedRemoteMedia,
};
pub use leases::{register_privilege_lease, RegisterLeaseRequest, RegisterLeaseResponse};
pub use secrets::{
    get_ai_settings, list_ai_models, save_ai_settings, AiListModelsRequest, AiListModelsResponse,
    AiSettingsUpdate, AiSettingsView,
};
pub use sidecar::{
    ensure_sidecar, get_sidecar_info, sidecar_http, sidecar_sse_stream, stop_sidecar,
    SidecarHttpRequest, SidecarHttpResponse, SidecarInfo,
};
pub use terminal::{ai_terminal_exec, AiTerminalExecRequest, AiTerminalExecResult};
