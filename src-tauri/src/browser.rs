//! Host browser: per-SSH-session SOCKS + HTTP CONNECT + child WKWebView.
//!
//! Isolation: profile key and webview labels include `session_id`, so two host
//! tabs never share a tunnel, SOCKS bridge, or page surface. Host-tab switch
//! parks (hides) surfaces without shutdown; warm restore activates without
//! re-navigate.
//!
//! Loopback URLs bypass WK proxy — rewritten to a local TcpTunnel.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::Mutex as StdMutex;

use serde::{Deserialize, Serialize};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Position, Rect, Size, Url,
    WebviewBuilder, WebviewUrl,
};
use tauri::webview::PageLoadEvent;
use tauri_plugin_store::StoreExt;
use tokio::sync::Mutex;

use crate::error::{AppError, AppResult};
use crate::session::SessionManager;
use crate::ssh::http_proxy::HttpProxy;
use crate::ssh::socks::SocksBridge;
use crate::ssh::tunnel::TcpTunnel;

const HISTORY_STORE: &str = "browser-history.json";
const BOOKMARK_STORE: &str = "browser-bookmarks.json";
const HISTORY_CAP: usize = 500;

/// Desktop Chrome UA for Host Browser child webviews.
///
/// Stock WKWebView / WebView2 UAs are often rejected by enterprise portals
/// ("browser version too low" / Chrome 91+ gates). Spoof a current Chrome
/// desktop string so HTTP + `navigator.userAgent` checks pass.
fn host_browser_user_agent() -> &'static str {
    #[cfg(target_os = "macos")]
    {
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
    #[cfg(target_os = "windows")]
    {
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows")))]
    {
        "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    }
}

/// Fit wide desktop pages into the docked panel (WebKit CSS zoom).
/// Keep in sync with `BROWSER_FIT_WIDTH_EVAL` in `src/lib/browserPageChrome.ts`.
const FIT_WIDTH_EVAL: &str = r#"(function(){try{var d=document.documentElement;if(!d)return;if(String(location.protocol||"").indexOf("about:")===0)return;d.style.zoom="1";var body=document.body;var sw=Math.max(d.scrollWidth||0,body?body.scrollWidth:0);var iw=window.innerWidth||d.clientWidth||0;if(iw<32||sw<=iw+8)return;var z=Math.max(0.55,Math.min(1,iw/sw));d.style.zoom=String(z);}catch(_){}})()"#;

/// Read document title + favicon href. Keep in sync with `BROWSER_PAGE_META_EVAL`.
const PAGE_META_EVAL: &str = r#"(function(){try{if(String(location.protocol||"").indexOf("about:")===0)return JSON.stringify({title:"",favicon:""});var title=(document.title||"").trim();var href="";var nodes=document.querySelectorAll('link[rel~="icon"],link[rel="shortcut icon"],link[rel="apple-touch-icon"]');for(var i=0;i<nodes.length;i++){var h=nodes[i].href;if(h){href=h;break;}}if(!href)href=location.origin+"/favicon.ico";return JSON.stringify({title:title,favicon:href});}catch(e){return JSON.stringify({title:"",favicon:""});}})()"#;

struct LoopbackTunnel {
    remote_host: String,
    remote_port: u16,
    local_port: u16,
    _tunnel: TcpTunnel,
}

struct BrowserSessionState {
    session_id: String,
    profile_key: String,
    /// Active tab's webview label (compat with bounds / page-load listeners).
    webview_label: String,
    /// Browser UI tabs → child webview labels (shared SOCKS/proxy per host).
    tab_webviews: HashMap<String, String>,
    socks: SocksBridge,
    http_proxy: HttpProxy,
    last_css_bounds: Option<CssRect>,
    /// Local listeners that forward loopback URLs (WKWebView skips the proxy for 127.0.0.1).
    loopback: Vec<LoopbackTunnel>,
}

fn tab_webview_label(base: &str, tab_id: &str) -> String {
    let safe: String = tab_id
        .chars()
        .map(|c| {
            if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
                c
            } else {
                '-'
            }
        })
        .take(40)
        .collect();
    let safe = if safe.is_empty() {
        "tab".to_string()
    } else {
        safe
    };
    format!("{base}--{safe}")
}

#[derive(Debug, Deserialize)]
struct PageMetaJs {
    #[serde(default)]
    title: String,
    #[serde(default)]
    favicon: String,
}

fn parse_page_meta_json(raw: &str, fallback_url: &str) -> (String, String) {
    let trimmed = raw.trim().trim_matches('"');
    // eval_with_callback may wrap the JS string result in extra JSON quotes.
    let unescaped = if trimmed.starts_with('{') {
        trimmed.to_string()
    } else {
        serde_json::from_str::<String>(raw).unwrap_or_else(|_| trimmed.to_string())
    };
    let meta: PageMetaJs = serde_json::from_str(&unescaped).unwrap_or(PageMetaJs {
        title: String::new(),
        favicon: String::new(),
    });
    let title = if meta.title.is_empty() {
        fallback_url.to_string()
    } else {
        meta.title
    };
    (title, meta.favicon)
}

#[derive(Debug, Clone, Copy, PartialEq)]
pub struct CssRect {
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

impl CssRect {
    pub fn is_drawable(self) -> bool {
        self.width >= 32.0 && self.height >= 32.0
    }

    pub fn clamped(self) -> Self {
        Self {
            x: self.x.max(0.0),
            y: self.y.max(0.0),
            width: self.width.max(0.0),
            height: self.height.max(0.0),
        }
    }

    fn to_rect(self) -> Rect {
        Rect {
            position: Position::Logical(LogicalPosition::new(self.x, self.y)),
            size: Size::Logical(LogicalSize::new(
                self.width.max(1.0),
                self.height.max(1.0),
            )),
        }
    }
}

pub struct BrowserManager {
    gate: Mutex<()>,
    inner: Mutex<HashMap<String, BrowserSessionState>>,
    /// local tunnel port → (remote host, remote port) for address-bar display.
    loopback_display: std::sync::Arc<StdMutex<HashMap<u16, (String, u16)>>>,
}

impl Default for BrowserManager {
    fn default() -> Self {
        Self::new()
    }
}

async fn profile_key_from_session(
    sessions: &SessionManager,
    session_id: &str,
) -> AppResult<(String, String)> {
    let snap = sessions.ssh_snapshot(session_id).await?;
    let req = snap.connect_request();
    // Include session_id so two SSH tabs to the same user@host never share a
    // WKWebView, SOCKS bridge, or loopback tunnel (host-tab isolation).
    let key = format!(
        "{}@{}:{}#{}",
        req.username, req.host, req.port, session_id
    );
    let slug = session_id
        .to_lowercase()
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c } else { '-' })
        .collect::<String>()
        .trim_matches('-')
        .chars()
        .take(40)
        .collect::<String>();
    let label = format!(
        "host-browser-{}",
        if slug.is_empty() {
            "host".into()
        } else {
            slug
        }
    );
    Ok((key, label))
}

fn data_store_id_from_profile(profile_key: &str) -> [u8; 16] {
    let mut hasher = std::collections::hash_map::DefaultHasher::new();
    profile_key.hash(&mut hasher);
    let h = hasher.finish().to_le_bytes();
    let mut out = [0u8; 16];
    out[..8].copy_from_slice(&h);
    profile_key.chars().rev().for_each(|c| c.hash(&mut hasher));
    let h2 = hasher.finish().to_le_bytes();
    out[8..].copy_from_slice(&h2);
    out
}

/// Soft-hide for dock minimize: keep geometry so WKWebView can show again.
fn hide_browser_surface(app: &AppHandle, label: &str) {
    if let Some(wv) = app.get_webview(label) {
        let _ = wv.hide();
    }
    // Legacy separate-window leftovers from older builds.
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_always_on_top(false);
        let _ = win.hide();
    }
}

fn close_browser_surface(app: &AppHandle, label: &str) {
    if let Some(wv) = app.get_webview(label) {
        let _ = wv.hide();
        let _ = wv.close();
    }
    if let Some(win) = app.get_webview_window(label) {
        let _ = win.set_always_on_top(false);
        let _ = win.hide();
        let _ = win.close();
    }
}

/// WKWebView often paints a black frame after hide→show until the compositor
/// is nudged. Re-apply bounds and poke the page.
fn wake_browser_surface(app: &AppHandle, label: &str, rect: Option<CssRect>) {
    if let Some(rect) = rect.filter(|r| r.is_drawable()) {
        let _ = apply_webview_bounds(app, label, rect);
    } else if let Some(wv) = app.get_webview(label) {
        let _ = wv.show();
    }
    if let Some(wv) = app.get_webview(label) {
        // Force a layout/compositor pass without navigating away.
        let _ = wv.eval(
            "(function(){try{var e=document.documentElement;if(e){e.style.transform='translateZ(0)';requestAnimationFrame(function(){e.style.transform='';})}}catch(_){}})()",
        );
    }
}

/// Map the React content-slot CSS rect onto the child webview (parent-relative).
fn apply_webview_bounds(app: &AppHandle, label: &str, rect: CssRect) -> AppResult<()> {
    let Some(wv) = app.get_webview(label) else {
        return Ok(());
    };
    if let Some(main) = app.get_webview_window("main") {
        if main.is_minimized().unwrap_or(false) {
            let _ = wv.hide();
            return Ok(());
        }
    }
    if !rect.is_drawable() {
        let _ = wv.hide();
        return Ok(());
    }
    log::debug!(
        "host-browser child bounds label={label} css=({:.0},{:.0},{:.0},{:.0})",
        rect.x,
        rect.y,
        rect.width,
        rect.height
    );
    wv.set_bounds(rect.to_rect())
        .map_err(|e| AppError::msg(format!("set_bounds: {e}")))?;
    let _ = wv.show();
    // Re-fit after resize so sites with min-width layouts stay usable in a narrow dock.
    let _ = wv.eval(FIT_WIDTH_EVAL);
    Ok(())
}

/// Hide every host-browser overlay (main traffic-light minimize / Cmd+H).
pub fn hide_all_browser_surfaces(app: &AppHandle) {
    for (label, wv) in app.webviews() {
        if label.starts_with("host-browser-") {
            let _ = wv.hide();
        }
    }
    for (label, win) in app.webview_windows() {
        if label.starts_with("host-browser-") {
            let _ = win.set_always_on_top(false);
            let _ = win.hide();
        }
    }
}

impl BrowserManager {
    pub fn new() -> Self {
        Self {
            gate: Mutex::new(()),
            inner: Mutex::new(HashMap::new()),
            loopback_display: std::sync::Arc::new(StdMutex::new(HashMap::new())),
        }
    }

    pub async fn ensure(
        &self,
        app: &AppHandle,
        sessions: &SessionManager,
        session_id: &str,
        initial_bounds: Option<CssRect>,
    ) -> AppResult<BrowserEnsureResult> {
        self.ensure_tab(app, sessions, session_id, "default", initial_bounds)
            .await
    }

    /// Start SOCKS/proxy for the host (if needed) and ensure a tab's child webview exists.
    pub async fn ensure_tab(
        &self,
        app: &AppHandle,
        sessions: &SessionManager,
        session_id: &str,
        tab_id: &str,
        initial_bounds: Option<CssRect>,
    ) -> AppResult<BrowserEnsureResult> {
        let _gate = self.gate.lock().await;
        let tab_id = if tab_id.is_empty() { "default" } else { tab_id };

        {
            let mut guard = self.inner.lock().await;
            if let Some(state) = guard.get_mut(session_id) {
                let label = state
                    .tab_webviews
                    .get(tab_id)
                    .cloned()
                    .unwrap_or_else(|| tab_webview_label(&state.webview_label, tab_id));
                // Base label may be session root; prefer stored map / derived.
                let base = state
                    .webview_label
                    .split("--")
                    .next()
                    .unwrap_or(&state.webview_label)
                    .to_string();
                let label = state
                    .tab_webviews
                    .get(tab_id)
                    .cloned()
                    .unwrap_or_else(|| tab_webview_label(&base, tab_id));

                if app.get_webview(&label).is_some() {
                    state.tab_webviews.insert(tab_id.to_string(), label.clone());
                    state.webview_label = label.clone();
                    let profile_key = state.profile_key.clone();
                    let session_id_s = state.session_id.clone();
                    let proxy_port = state.socks.port;
                    let rect = initial_bounds.map(CssRect::clamped).or(state.last_css_bounds);
                    if let Some(r) = rect {
                        state.last_css_bounds = Some(r);
                    }
                    drop(guard);
                    wake_browser_surface(app, &label, rect);
                    return Ok(BrowserEnsureResult {
                        session_id: session_id_s,
                        profile_key,
                        socks_port: proxy_port,
                        webview_label: label,
                        created: false,
                    });
                }

                // Session alive but this tab's webview is missing — create it below.
                let profile_key = state.profile_key.clone();
                let socks_port = state.socks.port;
                let http_proxy_port = state.http_proxy.port;
                let base_label = base;
                drop(guard);
                self.create_child_webview(
                    app,
                    &label,
                    tab_id,
                    &profile_key,
                    initial_bounds
                        .map(CssRect::clamped)
                        .filter(|r| r.is_drawable()),
                    socks_port,
                    http_proxy_port,
                )
                .await?;
                let mut guard = self.inner.lock().await;
                if let Some(state) = guard.get_mut(session_id) {
                    state.tab_webviews.insert(tab_id.to_string(), label.clone());
                    state.webview_label = label.clone();
                    if let Some(rect) = initial_bounds.map(CssRect::clamped) {
                        state.last_css_bounds = Some(rect);
                    }
                    return Ok(BrowserEnsureResult {
                        session_id: session_id.to_string(),
                        profile_key: state.profile_key.clone(),
                        socks_port: state.socks.port,
                        webview_label: label,
                        created: true,
                    });
                }
                let _ = base_label;
            }
        }

        let (profile_key, base_label) =
            profile_key_from_session(sessions, session_id).await?;
        let label = tab_webview_label(&base_label, tab_id);
        self.shutdown_by_label(app, &label).await;

        let snap = sessions.ssh_snapshot(session_id).await?;
        let socks = SocksBridge::start(snap.handle()).await?;
        let socks_port = socks.port;
        let http_proxy = HttpProxy::start(socks_port).await?;
        let http_proxy_port = http_proxy.port;
        log::warn!(
            "host-browser session={session_id} SOCKS 127.0.0.1:{socks_port} HTTP-CONNECT 127.0.0.1:{http_proxy_port}"
        );

        let spawn = initial_bounds
            .map(CssRect::clamped)
            .filter(|r| r.is_drawable());

        self.create_child_webview(
            app,
            &label,
            tab_id,
            &profile_key,
            spawn,
            socks_port,
            http_proxy_port,
        )
        .await?;

        let mut tab_webviews = HashMap::new();
        tab_webviews.insert(tab_id.to_string(), label.clone());

        let result = BrowserEnsureResult {
            session_id: session_id.to_string(),
            profile_key: profile_key.clone(),
            socks_port,
            webview_label: label.clone(),
            created: true,
        };

        self.inner.lock().await.insert(
            session_id.to_string(),
            BrowserSessionState {
                session_id: session_id.to_string(),
                profile_key,
                webview_label: label,
                tab_webviews,
                socks,
                http_proxy,
                last_css_bounds: spawn,
                loopback: Vec::new(),
            },
        );

        Ok(result)
    }

    /// Hide sibling tabs; show `tab_id` without navigating (keeps page state).
    pub async fn activate_tab(
        &self,
        app: &AppHandle,
        session_id: &str,
        tab_id: &str,
        bounds: Option<CssRect>,
    ) -> AppResult<BrowserEnsureResult> {
        let _gate = self.gate.lock().await;
        let tab_id = if tab_id.is_empty() { "default" } else { tab_id };
        let mut guard = self.inner.lock().await;
        let state = guard
            .get_mut(session_id)
            .ok_or_else(|| AppError::msg("browser session missing"))?;

        let base = state
            .webview_label
            .split("--")
            .next()
            .unwrap_or(&state.webview_label)
            .to_string();
        let label = state
            .tab_webviews
            .get(tab_id)
            .cloned()
            .unwrap_or_else(|| tab_webview_label(&base, tab_id));

        for (tid, lbl) in state.tab_webviews.clone() {
            if tid != tab_id {
                hide_browser_surface(app, &lbl);
            }
        }

        let mut created_now = false;
        if app.get_webview(&label).is_none() {
            let profile_key = state.profile_key.clone();
            let socks_port = state.socks.port;
            let http_proxy_port = state.http_proxy.port;
            drop(guard);
            self.create_child_webview(
                app,
                &label,
                tab_id,
                &profile_key,
                bounds.map(CssRect::clamped).filter(|r| r.is_drawable()),
                socks_port,
                http_proxy_port,
            )
            .await?;
            created_now = true;
            guard = self.inner.lock().await;
            let state = guard
                .get_mut(session_id)
                .ok_or_else(|| AppError::msg("browser session missing"))?;
            state.tab_webviews.insert(tab_id.to_string(), label.clone());
        }

        let state = guard
            .get_mut(session_id)
            .ok_or_else(|| AppError::msg("browser session missing"))?;
        state.tab_webviews.insert(tab_id.to_string(), label.clone());
        state.webview_label = label.clone();
        let profile_key = state.profile_key.clone();
        let proxy_port = state.socks.port;
        let created = created_now;
        let rect = bounds
            .map(CssRect::clamped)
            .or(state.last_css_bounds);
        if let Some(r) = rect {
            state.last_css_bounds = Some(r);
        }
        drop(guard);
        wake_browser_surface(app, &label, rect);

        Ok(BrowserEnsureResult {
            session_id: session_id.to_string(),
            profile_key,
            socks_port: proxy_port,
            webview_label: label,
            created,
        })
    }

    pub async fn close_tab(
        &self,
        app: &AppHandle,
        session_id: &str,
        tab_id: &str,
    ) -> AppResult<()> {
        let _gate = self.gate.lock().await;
        let mut guard = self.inner.lock().await;
        let Some(state) = guard.get_mut(session_id) else {
            return Ok(());
        };
        if let Some(label) = state.tab_webviews.remove(tab_id) {
            close_browser_surface(app, &label);
            if state.webview_label == label {
                state.webview_label = state
                    .tab_webviews
                    .values()
                    .next()
                    .cloned()
                    .unwrap_or_else(|| label);
            }
        }
        Ok(())
    }

    /// Hide every tab webview for a host without tearing down SOCKS (host tab switch).
    pub async fn hide_session(&self, app: &AppHandle, session_id: &str) -> AppResult<()> {
        let guard = self.inner.lock().await;
        let Some(state) = guard.get(session_id) else {
            return Ok(());
        };
        for label in state.tab_webviews.values() {
            hide_browser_surface(app, label);
        }
        hide_browser_surface(app, &state.webview_label);
        Ok(())
    }

    async fn create_child_webview(
        &self,
        app: &AppHandle,
        label: &str,
        tab_id: &str,
        profile_key: &str,
        spawn: Option<CssRect>,
        socks_port: u16,
        http_proxy_port: u16,
    ) -> AppResult<()> {
        close_browser_surface(app, label);
        tokio::task::yield_now().await;
        close_browser_surface(app, label);

        if app.get_webview(label).is_some() {
            if let Some(rect) = spawn {
                apply_webview_bounds(app, label, rect)?;
            }
            return Ok(());
        }

        let data_dir = app
            .path()
            .app_data_dir()
            .map_err(|e| AppError::msg(e.to_string()))?
            .join("browser-profiles")
            .join(profile_key.replace(['/', '\\', ':'], "_"));
        std::fs::create_dir_all(&data_dir)
            .map_err(|e| AppError::msg(format!("browser profile dir: {e}")))?;

        let main = app
            .get_window("main")
            .ok_or_else(|| AppError::msg("main window missing"))?;

        let rect = spawn.unwrap_or(CssRect {
            x: 80.0,
            y: 120.0,
            width: 640.0,
            height: 480.0,
        });
        let init_pos = LogicalPosition::new(rect.x, rect.y);
        let init_size = LogicalSize::new(rect.width.max(320.0), rect.height.max(240.0));

        let _ = socks_port;
        // HTTP CONNECT forwarder → SOCKS → SSH. Prefer CONNECT over raw SOCKS5:
        // WKWebView socks5:// blanked HTTPS origins (baidu) on macOS; CONNECT is
        // the supported NWProxyConfig path once the SOCKS bridge is full-duplex.
        let proxy = Url::parse(&format!("http://127.0.0.1:{http_proxy_port}"))
            .map_err(|e| AppError::msg(format!("proxy url: {e}")))?;

        let app_handle = app.clone();
        let emit_label = label.to_string();
        let emit_profile = profile_key.to_string();
        let emit_tab = tab_id.to_string();
        let display_map = std::sync::Arc::clone(&self.loopback_display);

        let mut builder = WebviewBuilder::new(
            label,
            WebviewUrl::External(
                Url::parse("about:blank").map_err(|e| AppError::msg(e.to_string()))?,
            ),
        )
        .user_agent(host_browser_user_agent())
        .proxy_url(proxy)
        .on_page_load(move |webview, payload| {
            let url = display_url_for_bar(&display_map, payload.url());
            match payload.event() {
                PageLoadEvent::Started => {
                    log::warn!("host-browser load started tab={emit_tab} {url}");
                    let _ = app_handle.emit(
                        "host-browser-load",
                        BrowserLoadEvent {
                            webview_label: emit_label.clone(),
                            profile_key: emit_profile.clone(),
                            tab_id: emit_tab.clone(),
                            url: url.clone(),
                            phase: "started".into(),
                        },
                    );
                }
                PageLoadEvent::Finished => {
                    if url.starts_with("about:") {
                        return;
                    }
                    log::warn!("host-browser load finished tab={emit_tab} {url}");
                    let _ = webview.eval(FIT_WIDTH_EVAL);
                    let _ = app_handle.emit(
                        "host-browser-load",
                        BrowserLoadEvent {
                            webview_label: emit_label.clone(),
                            profile_key: emit_profile.clone(),
                            tab_id: emit_tab.clone(),
                            url: url.clone(),
                            phase: "finished".into(),
                        },
                    );
                    let emit_label2 = emit_label.clone();
                    let emit_profile2 = emit_profile.clone();
                    let emit_tab2 = emit_tab.clone();
                    let url2 = url.clone();
                    let app2 = app_handle.clone();
                    let _ = webview.eval_with_callback(PAGE_META_EVAL, move |raw| {
                        let (title, favicon) = parse_page_meta_json(&raw, &url2);
                        let _ = app2.emit(
                            "host-browser-page",
                            BrowserPageEvent {
                                webview_label: emit_label2.clone(),
                                profile_key: emit_profile2.clone(),
                                tab_id: emit_tab2.clone(),
                                url: url2.clone(),
                                title,
                                favicon,
                            },
                        );
                    });
                }
            }
        });

        #[cfg(target_os = "macos")]
        {
            builder = builder.data_store_identifier(data_store_id_from_profile(profile_key));
        }
        #[cfg(not(target_os = "macos"))]
        {
            builder = builder.data_directory(data_dir);
        }

        main.add_child(builder, init_pos, init_size)
            .map_err(|e| AppError::msg(format!("browser child webview: {e}")))?;

        if let Some(rect) = spawn {
            apply_webview_bounds(app, label, rect)?;
        } else if let Some(wv) = app.get_webview(label) {
            let _ = wv.show();
        }
        Ok(())
    }

    pub async fn navigate(
        &self,
        app: &AppHandle,
        sessions: &SessionManager,
        session_id: &str,
        tab_id: &str,
        url: &str,
        bounds: Option<CssRect>,
    ) -> AppResult<()> {
        let tab_id = if tab_id.is_empty() { "default" } else { tab_id };
        let ensured = self
            .ensure_tab(
                app,
                sessions,
                session_id,
                tab_id,
                bounds.map(CssRect::clamped),
            )
            .await?;
        // Hide sibling tabs so only the navigated page is visible.
        {
            let guard = self.inner.lock().await;
            if let Some(state) = guard.get(session_id) {
                for (tid, lbl) in &state.tab_webviews {
                    if tid != tab_id {
                        hide_browser_surface(app, lbl);
                    }
                }
            }
        }
        let parsed = Url::parse(url).map_err(|e| AppError::msg(format!("bad url: {e}")))?;
        if parsed.scheme() != "http" && parsed.scheme() != "https" {
            return Err(AppError::msg("only http(s) URLs are allowed"));
        }

        let rect = if let Some(r) = bounds.map(CssRect::clamped) {
            Some(r)
        } else {
            self.inner
                .lock()
                .await
                .get(session_id)
                .and_then(|s| s.last_css_bounds)
        };
        if let Some(rect) = rect {
            apply_webview_bounds(app, &ensured.webview_label, rect)?;
            if let Some(state) = self.inner.lock().await.get_mut(session_id) {
                state.last_css_bounds = Some(rect);
                state.webview_label = ensured.webview_label.clone();
            }
        }

        log::info!(
            "host-browser navigate tab={tab_id} {url} via SOCKS5 (remote network)"
        );

        let load_url = self.webview_url_for(session_id, &parsed).await?;
        if load_url.as_str() != parsed.as_str() {
            log::info!(
                "host-browser loopback {} rewritten to {} (WKWebView skips proxy for 127.0.0.1)",
                parsed,
                load_url
            );
        }

        let wv = app
            .get_webview(&ensured.webview_label)
            .ok_or_else(|| AppError::msg("browser webview missing"))?;
        wv.navigate(load_url)
            .map_err(|e| AppError::msg(format!("navigate: {e}")))?;
        let _ = wv.show();
        Ok(())
    }

    pub async fn reload(&self, app: &AppHandle, webview_label: &str) -> AppResult<()> {
        let wv = app
            .get_webview(webview_label)
            .ok_or_else(|| AppError::msg("browser webview missing"))?;
        wv.reload()
            .map_err(|e| AppError::msg(format!("reload: {e}")))
    }

    pub async fn go_back(&self, app: &AppHandle, webview_label: &str) -> AppResult<()> {
        let wv = app
            .get_webview(webview_label)
            .ok_or_else(|| AppError::msg("browser webview missing"))?;
        wv.eval("window.history.back()")
            .map_err(|e| AppError::msg(format!("back: {e}")))
    }

    pub async fn go_forward(&self, app: &AppHandle, webview_label: &str) -> AppResult<()> {
        let wv = app
            .get_webview(webview_label)
            .ok_or_else(|| AppError::msg("browser webview missing"))?;
        wv.eval("window.history.forward()")
            .map_err(|e| AppError::msg(format!("forward: {e}")))
    }

    pub async fn set_bounds(
        &self,
        app: &AppHandle,
        webview_label: &str,
        x: f64,
        y: f64,
        width: f64,
        height: f64,
    ) -> AppResult<()> {
        let rect = CssRect {
            x,
            y,
            width,
            height,
        }
        .clamped();
        {
            let mut guard = self.inner.lock().await;
            if let Some(state) = guard.values_mut().find(|s| s.webview_label == webview_label)
            {
                state.last_css_bounds = Some(rect);
            }
        }
        apply_webview_bounds(app, webview_label, rect)
    }

    /// Hide or show the host-browser surface without tearing down SOCKS.
    /// Minimize uses soft-hide (geometry kept) to avoid WKWebView black frames.
    pub async fn set_visible(
        &self,
        app: &AppHandle,
        webview_label: &str,
        visible: bool,
    ) -> AppResult<()> {
        if !visible {
            hide_browser_surface(app, webview_label);
            return Ok(());
        }
        let rect = {
            let guard = self.inner.lock().await;
            guard
                .values()
                .find(|s| s.webview_label == webview_label || s.tab_webviews.values().any(|l| l == webview_label))
                .and_then(|s| s.last_css_bounds)
        };
        wake_browser_surface(app, webview_label, rect);
        Ok(())
    }

    async fn shutdown_by_label(&self, app: &AppHandle, label: &str) {
        let victims: Vec<String> = {
            let guard = self.inner.lock().await;
            guard
                .iter()
                .filter(|(_, s)| s.webview_label == label)
                .map(|(id, _)| id.clone())
                .collect()
        };
        for id in victims {
            if let Some(state) = self.inner.lock().await.remove(&id) {
                drop(state.http_proxy);
                drop(state.socks);
            }
        }
        close_browser_surface(app, label);
        tokio::task::yield_now().await;
        close_browser_surface(app, label);
    }

    pub async fn shutdown_session(&self, app: &AppHandle, session_id: &str) {
        let _gate = self.gate.lock().await;
        if let Some(state) = self.inner.lock().await.remove(session_id) {
            let labels: Vec<String> = state.tab_webviews.values().cloned().collect();
            let active = state.webview_label.clone();
            drop(state.http_proxy);
            drop(state.socks);
            for label in labels {
                close_browser_surface(app, &label);
            }
            close_browser_surface(app, &active);
            tokio::task::yield_now().await;
            close_browser_surface(app, &active);
        }
    }

    pub async fn shutdown_all(&self, app: &AppHandle) {
        let _gate = self.gate.lock().await;
        let keys: Vec<String> = self.inner.lock().await.keys().cloned().collect();
        for key in keys {
            if let Some(state) = self.inner.lock().await.remove(&key) {
                let labels: Vec<String> = state.tab_webviews.values().cloned().collect();
                let active = state.webview_label.clone();
                drop(state.http_proxy);
                drop(state.socks);
                for label in labels {
                    close_browser_surface(app, &label);
                }
                close_browser_surface(app, &active);
            }
        }
    }

    /// WKWebView does not send loopback URLs through `proxy_url`. Open a local
    /// TCP tunnel (SOCKS → remote loopback port) and load that instead.
    async fn webview_url_for(&self, session_id: &str, url: &Url) -> AppResult<Url> {
        let Some(host) = url.host_str() else {
            return Ok(url.clone());
        };
        if !is_loopback_host(host) {
            return Ok(url.clone());
        }
        let remote_port = url.port_or_known_default().unwrap_or(80);
        let remote_host = normalize_loopback(host);

        {
            let guard = self.inner.lock().await;
            if let Some(state) = guard.get(session_id) {
                if let Some(existing) = state.loopback.iter().find(|item| {
                    item.remote_host == remote_host && item.remote_port == remote_port
                }) {
                    return Ok(retarget_loopback(url, existing.local_port));
                }
            }
        }

        let socks_port = {
            let guard = self.inner.lock().await;
            guard
                .get(session_id)
                .map(|state| state.socks.port)
                .ok_or_else(|| AppError::msg("browser session missing"))?
        };
        let tunnel =
            TcpTunnel::start_via_socks(socks_port, remote_host.clone(), remote_port).await?;
        let local_port = tunnel.local_port;
        {
            let mut guard = self.inner.lock().await;
            let state = guard
                .get_mut(session_id)
                .ok_or_else(|| AppError::msg("browser session missing"))?;
            state.http_proxy.allow_local_port(local_port);
            state.loopback.push(LoopbackTunnel {
                remote_host: remote_host.clone(),
                remote_port,
                local_port,
                _tunnel: tunnel,
            });
        }
        if let Ok(mut map) = self.loopback_display.lock() {
            map.insert(local_port, (remote_host, remote_port));
        }
        Ok(retarget_loopback(url, local_port))
    }
}

fn is_loopback_host(host: &str) -> bool {
    let host = host.trim().trim_matches(['[', ']']);
    host.eq_ignore_ascii_case("localhost")
        || host == "127.0.0.1"
        || host == "::1"
        || host == "0.0.0.0"
}

fn normalize_loopback(host: &str) -> String {
    let host = host.trim().trim_matches(['[', ']']);
    if host.eq_ignore_ascii_case("localhost") || host == "0.0.0.0" {
        "127.0.0.1".to_string()
    } else {
        host.to_string()
    }
}

fn retarget_loopback(url: &Url, local_port: u16) -> Url {
    let mut next = url.clone();
    let _ = next.set_host(Some("127.0.0.1"));
    let _ = next.set_port(Some(local_port));
    next
}

fn display_url_for_bar(map: &StdMutex<HashMap<u16, (String, u16)>>, url: &Url) -> String {
    let host = url.host_str().unwrap_or("");
    let Some(port) = url.port() else {
        return url.to_string();
    };
    if !is_loopback_host(host) {
        return url.to_string();
    }
    let Ok(guard) = map.lock() else {
        return url.to_string();
    };
    let Some((remote_host, remote_port)) = guard.get(&port) else {
        return url.to_string();
    };
    let mut shown = url.clone();
    let _ = shown.set_host(Some(remote_host.as_str()));
    let _ = shown.set_port(Some(*remote_port));
    shown.to_string()
}

// --- Persistence ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserHistoryEntry {
    pub url: String,
    pub title: String,
    pub profile_key: String,
    pub visited_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserBookmark {
    pub id: String,
    pub url: String,
    pub title: String,
    pub profile_key: String,
    pub created_at: i64,
}

fn read_history(app: &AppHandle) -> AppResult<Vec<BrowserHistoryEntry>> {
    let store = app
        .store(HISTORY_STORE)
        .map_err(|e| AppError::msg(e.to_string()))?;
    let value = store.get("entries").unwrap_or(serde_json::json!([]));
    serde_json::from_value(value).map_err(|e| AppError::msg(e.to_string()))
}

fn write_history(app: &AppHandle, entries: &[BrowserHistoryEntry]) -> AppResult<()> {
    let store = app
        .store(HISTORY_STORE)
        .map_err(|e| AppError::msg(e.to_string()))?;
    store.set(
        "entries",
        serde_json::to_value(entries).map_err(|e| AppError::msg(e.to_string()))?,
    );
    store.save().map_err(|e| AppError::msg(e.to_string()))?;
    Ok(())
}

pub fn history_list(app: &AppHandle, profile_key: Option<&str>) -> AppResult<Vec<BrowserHistoryEntry>> {
    let mut entries = read_history(app)?;
    if let Some(pk) = profile_key {
        entries.retain(|e| e.profile_key == pk);
    }
    Ok(entries)
}

pub fn history_record(
    app: &AppHandle,
    profile_key: &str,
    url: &str,
    title: &str,
) -> AppResult<()> {
    let mut entries = read_history(app)?;
    entries.retain(|e| !(e.url == url && e.profile_key == profile_key));
    entries.insert(
        0,
        BrowserHistoryEntry {
            url: url.to_string(),
            title: if title.is_empty() {
                url.to_string()
            } else {
                title.to_string()
            },
            profile_key: profile_key.to_string(),
            visited_at: chrono::Utc::now().timestamp_millis(),
        },
    );
    if entries.len() > HISTORY_CAP {
        entries.truncate(HISTORY_CAP);
    }
    write_history(app, &entries)
}

pub fn history_clear(app: &AppHandle, profile_key: Option<&str>) -> AppResult<()> {
    if let Some(pk) = profile_key {
        let mut entries = read_history(app)?;
        entries.retain(|e| e.profile_key != pk);
        write_history(app, &entries)
    } else {
        write_history(app, &[])
    }
}

fn read_bookmarks(app: &AppHandle) -> AppResult<Vec<BrowserBookmark>> {
    let store = app
        .store(BOOKMARK_STORE)
        .map_err(|e| AppError::msg(e.to_string()))?;
    let value = store.get("entries").unwrap_or(serde_json::json!([]));
    serde_json::from_value(value).map_err(|e| AppError::msg(e.to_string()))
}

fn write_bookmarks(app: &AppHandle, entries: &[BrowserBookmark]) -> AppResult<()> {
    let store = app
        .store(BOOKMARK_STORE)
        .map_err(|e| AppError::msg(e.to_string()))?;
    store.set(
        "entries",
        serde_json::to_value(entries).map_err(|e| AppError::msg(e.to_string()))?,
    );
    store.save().map_err(|e| AppError::msg(e.to_string()))?;
    Ok(())
}

pub fn bookmarks_list(app: &AppHandle, profile_key: Option<&str>) -> AppResult<Vec<BrowserBookmark>> {
    let mut entries = read_bookmarks(app)?;
    if let Some(pk) = profile_key {
        entries.retain(|e| e.profile_key == pk);
    }
    Ok(entries)
}

pub fn bookmark_upsert(
    app: &AppHandle,
    profile_key: &str,
    url: &str,
    title: &str,
) -> AppResult<BrowserBookmark> {
    let mut entries = read_bookmarks(app)?;
    if let Some(existing) = entries
        .iter_mut()
        .find(|e| e.url == url && e.profile_key == profile_key)
    {
        existing.title = if title.is_empty() {
            url.to_string()
        } else {
            title.to_string()
        };
        let out = existing.clone();
        write_bookmarks(app, &entries)?;
        return Ok(out);
    }
    let bm = BrowserBookmark {
        id: uuid::Uuid::new_v4().to_string(),
        url: url.to_string(),
        title: if title.is_empty() {
            url.to_string()
        } else {
            title.to_string()
        },
        profile_key: profile_key.to_string(),
        created_at: chrono::Utc::now().timestamp_millis(),
    };
    entries.insert(0, bm.clone());
    write_bookmarks(app, &entries)?;
    Ok(bm)
}

pub fn bookmark_remove(app: &AppHandle, id: &str) -> AppResult<()> {
    let mut entries = read_bookmarks(app)?;
    entries.retain(|e| e.id != id);
    write_bookmarks(app, &entries)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserPageEvent {
    pub webview_label: String,
    pub profile_key: String,
    pub tab_id: String,
    pub url: String,
    pub title: String,
    #[serde(default)]
    pub favicon: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct BrowserLoadEvent {
    pub webview_label: String,
    pub profile_key: String,
    pub tab_id: String,
    pub url: String,
    /// `"started"` | `"finished"`
    pub phase: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserEnsureResult {
    pub session_id: String,
    pub profile_key: String,
    pub socks_port: u16,
    pub webview_label: String,
    /// True when the child webview was just created (about:blank) — caller must navigate.
    #[serde(default)]
    pub created: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserEnsureRequest {
    pub session_id: String,
    #[serde(default)]
    pub tab_id: Option<String>,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
}

impl BrowserEnsureRequest {
    pub fn bounds(&self) -> Option<CssRect> {
        match (self.x, self.y, self.width, self.height) {
            (Some(x), Some(y), Some(width), Some(height)) => Some(CssRect {
                x,
                y,
                width,
                height,
            }),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserNavigateRequest {
    pub session_id: String,
    pub profile_key: String,
    pub url: String,
    #[serde(default)]
    pub tab_id: Option<String>,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
}

impl BrowserNavigateRequest {
    pub fn bounds(&self) -> Option<CssRect> {
        match (self.x, self.y, self.width, self.height) {
            (Some(x), Some(y), Some(width), Some(height)) => Some(CssRect {
                x,
                y,
                width,
                height,
            }),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserTabRequest {
    pub session_id: String,
    pub tab_id: String,
    #[serde(default)]
    pub x: Option<f64>,
    #[serde(default)]
    pub y: Option<f64>,
    #[serde(default)]
    pub width: Option<f64>,
    #[serde(default)]
    pub height: Option<f64>,
}

impl BrowserTabRequest {
    pub fn bounds(&self) -> Option<CssRect> {
        match (self.x, self.y, self.width, self.height) {
            (Some(x), Some(y), Some(width), Some(height)) => Some(CssRect {
                x,
                y,
                width,
                height,
            }),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserShutdownRequest {
    pub session_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserBoundsRequest {
    pub webview_label: String,
    pub x: f64,
    pub y: f64,
    pub width: f64,
    pub height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserWebviewLabelRequest {
    pub webview_label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BrowserVisibleRequest {
    pub webview_label: String,
    pub visible: bool,
}

#[cfg(test)]
mod tests {
    use std::collections::HashMap;
    use std::sync::Mutex;

    use super::{display_url_for_bar, is_loopback_host, retarget_loopback, CssRect};
    use tauri::{LogicalPosition, LogicalSize, Position, Size, Url};

    #[test]
    fn fit_width_eval_scales_overflowing_layouts() {
        assert!(super::FIT_WIDTH_EVAL.contains("style.zoom"));
        assert!(super::FIT_WIDTH_EVAL.contains("scrollWidth"));
        assert!(super::FIT_WIDTH_EVAL.contains("0.55"));
    }

    #[test]
    fn host_browser_user_agent_looks_like_modern_chrome() {
        let ua = super::host_browser_user_agent();
        assert!(ua.contains("Chrome/131."), "{ua}");
        assert!(ua.contains("AppleWebKit/537.36"), "{ua}");
        assert!(!ua.contains("Version/"), "avoid Safari-only Version token: {ua}");
    }

    #[test]
    fn page_meta_eval_exposes_title_and_favicon() {
        assert!(super::PAGE_META_EVAL.contains("document.title"));
        assert!(super::PAGE_META_EVAL.contains("favicon.ico"));
        let (title, favicon) = super::parse_page_meta_json(
            r#"{"title":"百度一下","favicon":"https://www.baidu.com/favicon.ico"}"#,
            "https://www.baidu.com/",
        );
        assert_eq!(title, "百度一下");
        assert_eq!(favicon, "https://www.baidu.com/favicon.ico");
        let (fallback_title, empty_icon) =
            super::parse_page_meta_json(r#"{"title":"","favicon":""}"#, "https://example.com/");
        assert_eq!(fallback_title, "https://example.com/");
        assert!(empty_icon.is_empty());
    }

    #[test]
    fn css_rect_drawable() {
        assert!(CssRect {
            x: 1.0,
            y: 1.0,
            width: 100.0,
            height: 100.0
        }
        .is_drawable());
    }

    #[test]
    fn css_rect_maps_to_parent_relative_logical() {
        let rect = CssRect {
            x: 12.0,
            y: 48.0,
            width: 800.0,
            height: 600.0,
        }
        .to_rect();
        match rect.position {
            Position::Logical(LogicalPosition { x, y }) => {
                assert!((x - 12.0).abs() < f64::EPSILON);
                assert!((y - 48.0).abs() < f64::EPSILON);
            }
            other => panic!("expected logical position, got {other:?}"),
        }
        match rect.size {
            Size::Logical(LogicalSize { width, height }) => {
                assert!((width - 800.0).abs() < f64::EPSILON);
                assert!((height - 600.0).abs() < f64::EPSILON);
            }
            other => panic!("expected logical size, got {other:?}"),
        }
    }

    #[test]
    fn loopback_load_is_retargeted_and_address_bar_maps_back() {
        assert!(is_loopback_host("127.0.0.1"));
        assert!(is_loopback_host("localhost"));
        assert!(!is_loopback_host("10.6.20.241"));

        let typed = Url::parse("http://127.0.0.1:8096/web/index.html").unwrap();
        let load = retarget_loopback(&typed, 49152);
        assert_eq!(load.port(), Some(49152));
        assert_eq!(load.path(), "/web/index.html");

        let map = Mutex::new(HashMap::from([(49152u16, ("127.0.0.1".to_string(), 8096u16))]));
        assert_eq!(
            display_url_for_bar(&map, &load),
            "http://127.0.0.1:8096/web/index.html"
        );
    }
}
