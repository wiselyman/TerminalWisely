//! Connected Terminal adapter + sidecar lifecycle for AI Linux Engineer.
//!
//! Remote commands MUST use the existing session's SSH handle via
//! `exec_command_capture` — never a second SSH login, never PTY scraping.

mod leases;
mod secrets;
mod sidecar;
mod terminal;

pub use leases::{register_privilege_lease, RegisterLeaseRequest, RegisterLeaseResponse};
pub use secrets::{
    get_ai_settings, list_ai_models, save_ai_settings, AiListModelsRequest, AiListModelsResponse,
    AiSettingsUpdate, AiSettingsView,
};
pub use sidecar::{
    ensure_sidecar, get_sidecar_info, sidecar_http, sidecar_sse_stream, SidecarHttpRequest,
    SidecarHttpResponse, SidecarInfo,
};
pub use terminal::{ai_terminal_exec, AiTerminalExecRequest, AiTerminalExecResult};
