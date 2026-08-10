use std::io::{BufRead, BufReader, Read, Write};
use std::net::{TcpListener, TcpStream};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::json;
use tauri::{AppHandle, Manager};
use uuid::Uuid;

use crate::error::{AppError, AppResult};

use super::secrets::load_settings_for_sidecar;

static SIDECAR: OnceLock<Mutex<Option<SidecarState>>> = OnceLock::new();

struct SidecarState {
    child: Child,
    info: SidecarInfo,
}

#[derive(Debug, Clone, Serialize)]
pub struct SidecarInfo {
    pub base_url: String,
    pub token: String,
    pub pid: u32,
}

#[derive(Debug, Deserialize)]
pub struct SidecarHttpRequest {
    pub method: String,
    pub path: String,
    pub body: Option<String>,
    pub timeout_ms: Option<u64>,
}

#[derive(Debug, Serialize)]
pub struct SidecarHttpResponse {
    pub status: u16,
    pub body: String,
    pub content_type: String,
}

fn state() -> &'static Mutex<Option<SidecarState>> {
    SIDECAR.get_or_init(|| Mutex::new(None))
}

fn pick_port() -> AppResult<u16> {
    let listener = TcpListener::bind("127.0.0.1:0").map_err(AppError::from)?;
    let port = listener.local_addr().map_err(AppError::from)?.port();
    drop(listener);
    Ok(port)
}

fn resolve_sidecar_script(app: &AppHandle) -> PathBuf {
    if let Ok(dir) = app.path().resource_dir() {
        let candidate = dir.join("agent-sidecar");
        if candidate.join("app/main.py").exists() {
            return candidate;
        }
    }
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../agent-sidecar")
}

fn data_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::msg(e.to_string()))?
        .join("ai-engineer");
    std::fs::create_dir_all(&dir).map_err(AppError::from)?;
    Ok(dir)
}

fn wait_healthy(base_url: &str, attempts: u32) -> bool {
    for _ in 0..attempts {
        if ureq_get_health(base_url).unwrap_or(false) {
            return true;
        }
        thread::sleep(Duration::from_millis(200));
    }
    false
}

fn ureq_get_health(base_url: &str) -> AppResult<bool> {
    let url = base_url.trim_start_matches("http://");
    let (host_port, _) = url.split_once('/').unwrap_or((url, ""));
    let mut stream = TcpStream::connect(host_port).map_err(AppError::from)?;
    stream
        .set_read_timeout(Some(Duration::from_millis(500)))
        .ok();
    stream
        .set_write_timeout(Some(Duration::from_millis(500)))
        .ok();
    let req = format!(
        "GET /health HTTP/1.1\r\nHost: {host_port}\r\nConnection: close\r\n\r\n"
    );
    stream.write_all(req.as_bytes()).map_err(AppError::from)?;
    let mut buf = String::new();
    stream.read_to_string(&mut buf).ok();
    Ok(buf.contains("200") && buf.contains("ok"))
}

fn kill_orphan_sidecars(keep_pid: Option<u32>) {
    #[cfg(unix)]
    {
        let output = Command::new("pgrep")
            .args(["-f", "uvicorn app.main:app --host 127.0.0.1"])
            .output();
        let Ok(output) = output else { return };
        for line in String::from_utf8_lossy(&output.stdout).lines() {
            let Ok(pid) = line.trim().parse::<u32>() else { continue };
            if keep_pid == Some(pid) {
                continue;
            }
            let _ = Command::new("kill").arg(pid.to_string()).status();
        }
        thread::sleep(Duration::from_millis(150));
    }
}

fn which_python() -> String {
    static CACHED: OnceLock<String> = OnceLock::new();
    CACHED
        .get_or_init(|| {
            for candidate in ["python3", "python"] {
                if Command::new(candidate)
                    .arg("-c")
                    .arg("import uvicorn, fastapi")
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .status()
                    .map(|s| s.success())
                    .unwrap_or(false)
                {
                    return candidate.to_string();
                }
            }
            "python3".into()
        })
        .clone()
}

pub fn ensure_sidecar(app: &AppHandle) -> AppResult<SidecarInfo> {
    {
        let guard = state().lock().map_err(|e| AppError::msg(e.to_string()))?;
        if let Some(state) = guard.as_ref() {
            if wait_healthy(&state.info.base_url, 1) {
                return Ok(state.info.clone());
            }
        }
    }

    restart_sidecar(app)
}

/// Kill any live sidecar and spawn a fresh one (picks up new API key / model env).
pub fn restart_sidecar(app: &AppHandle) -> AppResult<SidecarInfo> {
    {
        let mut guard = state().lock().map_err(|e| AppError::msg(e.to_string()))?;
        if let Some(mut old) = guard.take() {
            let _ = old.child.kill();
            let _ = old.child.wait();
        }
    }
    kill_orphan_sidecars(None);

    let port = pick_port()?;
    let token = Uuid::new_v4().to_string();
    let sidecar_dir = resolve_sidecar_script(app);
    if !sidecar_dir.join("app/main.py").exists() {
        return Err(AppError::msg(format!(
            "AI sidecar not found at {}",
            sidecar_dir.display()
        )));
    }
    let data = data_dir(app)?;
    let settings = load_settings_for_sidecar(app).unwrap_or_default();
    let python = which_python();
    let log_path = data.join("sidecar.log");
    let log_file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
        .map_err(AppError::from)?;
    let log_err = log_file.try_clone().map_err(AppError::from)?;

    let mut cmd = Command::new(&python);
    cmd.current_dir(&sidecar_dir)
        .env("TW_AI_TOKEN", &token)
        .env("TW_AI_DATA_DIR", &data)
        .env("TW_AI_PROVIDER", &settings.provider)
        .env("TW_AI_MODEL", &settings.model)
        .env(
            "TW_AI_SECURITY_MODE",
            if settings.security_mode.is_empty() {
                "safe"
            } else {
                &settings.security_mode
            },
        )
        .env(
            "TW_AI_OLLAMA_BASE",
            if settings.ollama_base_url.is_empty() {
                "http://127.0.0.1:11434"
            } else {
                &settings.ollama_base_url
            },
        )
        .arg("-m")
        .arg("uvicorn")
        .arg("app.main:app")
        .arg("--host")
        .arg("127.0.0.1")
        .arg("--port")
        .arg(port.to_string())
        .stdin(Stdio::null())
        .stdout(Stdio::from(log_file))
        .stderr(Stdio::from(log_err));

    // Always set (even empty) so we never inherit a stale key from the parent env.
    cmd.env(
        "TW_AI_API_KEY",
        settings.api_key.clone().unwrap_or_default(),
    );
    // Ollama stores its URL in ollama_base_url; OpenAI-compat path is …/v1.
    if settings.provider.eq_ignore_ascii_case("ollama") {
        let ollama = if settings.ollama_base_url.is_empty() {
            "http://127.0.0.1:11434".to_string()
        } else {
            settings.ollama_base_url.trim_end_matches('/').to_string()
        };
        let base = if ollama.ends_with("/v1") {
            ollama
        } else {
            format!("{ollama}/v1")
        };
        cmd.env("TW_AI_BASE_URL", base);
    } else if !settings.base_url.is_empty() {
        cmd.env("TW_AI_BASE_URL", &settings.base_url);
    }

    let child = cmd.spawn().map_err(|e| {
        AppError::msg(format!(
            "Failed to start AI sidecar with {python}: {e}. Install: pip install -r agent-sidecar/requirements.txt"
        ))
    })?;
    let pid = child.id();
    let info = SidecarInfo {
        base_url: format!("http://127.0.0.1:{port}"),
        token,
        pid,
    };

    if !wait_healthy(&info.base_url, 50) {
        let mut guard = state().lock().map_err(|e| AppError::msg(e.to_string()))?;
        let mut child = child;
        let _ = child.kill();
        let _ = child.wait();
        *guard = None;
        return Err(AppError::msg(format!(
            "AI sidecar started but /health failed. See {}",
            log_path.display()
        )));
    }

    let mut guard = state().lock().map_err(|e| AppError::msg(e.to_string()))?;
    *guard = Some(SidecarState {
        child,
        info: info.clone(),
    });
    Ok(info)
}

pub fn get_sidecar_info() -> AppResult<Option<SidecarInfo>> {
    let guard = state().lock().map_err(|e| AppError::msg(e.to_string()))?;
    Ok(guard.as_ref().map(|s| s.info.clone()))
}

/// Proxy HTTP to the live sidecar (avoids WKWebView fetch stalls / stale FE URLs).
pub fn sidecar_http(app: &AppHandle, req: SidecarHttpRequest) -> AppResult<SidecarHttpResponse> {
    let info = ensure_sidecar(app)?;
    let method = req.method.trim().to_uppercase();
    let path = if req.path.starts_with('/') {
        req.path
    } else {
        format!("/{}", req.path)
    };
    let timeout = Duration::from_millis(req.timeout_ms.unwrap_or(30_000).max(1_000));
    let host_port = info
        .base_url
        .trim_start_matches("http://")
        .trim_end_matches('/');
    let body = req.body.unwrap_or_default();
    let mut stream = TcpStream::connect(host_port).map_err(AppError::from)?;
    stream.set_read_timeout(Some(timeout)).ok();
    stream.set_write_timeout(Some(timeout)).ok();

    let mut request = format!(
        "{method} {path} HTTP/1.1\r\nHost: {host_port}\r\nAuthorization: Bearer {token}\r\nConnection: close\r\n",
        token = info.token
    );
    if !body.is_empty() {
        request.push_str("Content-Type: application/json\r\n");
        request.push_str(&format!("Content-Length: {}\r\n", body.len()));
    }
    request.push_str("\r\n");
    stream.write_all(request.as_bytes()).map_err(AppError::from)?;
    if !body.is_empty() {
        stream.write_all(body.as_bytes()).map_err(AppError::from)?;
    }

    let mut raw = Vec::new();
    stream.read_to_end(&mut raw).map_err(AppError::from)?;
    let raw_str = String::from_utf8_lossy(&raw);
    let (header_part, body_part) = raw_str
        .split_once("\r\n\r\n")
        .or_else(|| raw_str.split_once("\n\n"))
        .unwrap_or((raw_str.as_ref(), ""));
    let status = header_part
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    let content_type = header_part
        .lines()
        .find_map(|line| {
            let lower = line.to_ascii_lowercase();
            lower
                .strip_prefix("content-type:")
                .map(|v| v.trim().to_string())
        })
        .unwrap_or_else(|| "application/json".into());
    let chunked = header_part.lines().any(|line| {
        let lower = line.to_ascii_lowercase();
        lower.starts_with("transfer-encoding:") && lower.contains("chunked")
    });
    let body = if chunked {
        decode_chunked_body(body_part)
    } else {
        body_part.to_string()
    };
    Ok(SidecarHttpResponse {
        status,
        body,
        content_type,
    })
}

/// Streamable HTTP (SSE) proxy: read sidecar event-stream and invoke callback per `data:` JSON.
/// Callback returning `false` or error stops the stream early.
pub fn sidecar_sse_stream(
    app: &AppHandle,
    path: &str,
    mut on_event: impl FnMut(serde_json::Value) -> AppResult<bool>,
) -> AppResult<()> {
    let info = ensure_sidecar(app)?;
    let path = if path.starts_with('/') {
        path.to_string()
    } else {
        format!("/{path}")
    };
    let host_port = info
        .base_url
        .trim_start_matches("http://")
        .trim_end_matches('/');
    let mut stream = TcpStream::connect(host_port).map_err(AppError::from)?;
    // Long-lived stream: generous read timeout; refresh on each read progress.
    stream
        .set_read_timeout(Some(Duration::from_secs(600)))
        .ok();
    stream
        .set_write_timeout(Some(Duration::from_secs(30)))
        .ok();
    let request = format!(
        "GET {path} HTTP/1.1\r\nHost: {host_port}\r\nAuthorization: Bearer {token}\r\nAccept: text/event-stream\r\nConnection: close\r\n\r\n",
        token = info.token
    );
    stream.write_all(request.as_bytes()).map_err(AppError::from)?;

    let mut reader = BufReader::new(stream);
    let mut status_line = String::new();
    reader.read_line(&mut status_line).map_err(AppError::from)?;
    let status = status_line
        .split_whitespace()
        .nth(1)
        .and_then(|s| s.parse::<u16>().ok())
        .unwrap_or(0);
    let mut headers = String::new();
    loop {
        let mut line = String::new();
        reader.read_line(&mut line).map_err(AppError::from)?;
        if line == "\r\n" || line == "\n" || line.is_empty() {
            break;
        }
        headers.push_str(&line);
    }
    if status >= 400 {
        let mut err_body = String::new();
        reader.read_to_string(&mut err_body).ok();
        return Err(AppError::msg(format!(
            "sidecar stream HTTP {status}: {}",
            err_body.chars().take(300).collect::<String>()
        )));
    }
    let chunked = headers.lines().any(|line| {
        let lower = line.to_ascii_lowercase();
        lower.starts_with("transfer-encoding:") && lower.contains("chunked")
    });

    let mut sse_buf = String::new();
    if chunked {
        loop {
            let mut size_line = String::new();
            if reader.read_line(&mut size_line).map_err(AppError::from)? == 0 {
                break;
            }
            let size_hex = size_line.trim().split(';').next().unwrap_or("").trim();
            let Ok(size) = usize::from_str_radix(size_hex, 16) else {
                break;
            };
            if size == 0 {
                break;
            }
            let mut chunk = vec![0u8; size];
            reader.read_exact(&mut chunk).map_err(AppError::from)?;
            // Trailing CRLF after chunk
            let mut crlf = [0u8; 2];
            let _ = reader.read_exact(&mut crlf);
            sse_buf.push_str(&String::from_utf8_lossy(&chunk));
            if !drain_sse_buffer(&mut sse_buf, &mut on_event)? {
                return Ok(());
            }
        }
    } else {
        loop {
            let mut line = String::new();
            let n = reader.read_line(&mut line).map_err(AppError::from)?;
            if n == 0 {
                break;
            }
            sse_buf.push_str(&line);
            if !drain_sse_buffer(&mut sse_buf, &mut on_event)? {
                return Ok(());
            }
        }
    }
    let _ = on_event(json!({
        "type": "stream_end",
        "payload": { "status": "closed" },
        "status": "closed"
    }));
    Ok(())
}

fn drain_sse_buffer(
    buf: &mut String,
    on_event: &mut impl FnMut(serde_json::Value) -> AppResult<bool>,
) -> AppResult<bool> {
    loop {
        let sep = buf
            .find("\r\n\r\n")
            .map(|i| (i, 4))
            .or_else(|| buf.find("\n\n").map(|i| (i, 2)));
        let Some((idx, sep_len)) = sep else {
            return Ok(true);
        };
        let block = buf[..idx].to_string();
        *buf = buf[idx + sep_len..].to_string();
        for line in block.replace("\r\n", "\n").split('\n') {
            let line = line.trim_end();
            if let Some(data) = line.strip_prefix("data:") {
                let payload = data.trim_start();
                if payload.is_empty() || payload == "[DONE]" {
                    continue;
                }
                match serde_json::from_str::<serde_json::Value>(payload) {
                    Ok(val) => {
                        let stop = val
                            .get("type")
                            .and_then(|t| t.as_str())
                            .is_some_and(|t| t == "stream_end");
                        if !on_event(val)? {
                            return Ok(false);
                        }
                        if stop {
                            return Ok(false);
                        }
                    }
                    Err(_) => {
                        // ignore malformed
                    }
                }
            }
        }
    }
}

fn decode_chunked_body(input: &str) -> String {
    let mut out = String::new();
    let mut rest = input;
    while !rest.is_empty() {
        let (size_line, after) = match rest.split_once("\r\n") {
            Some(v) => v,
            None => match rest.split_once('\n') {
                Some(v) => v,
                None => break,
            },
        };
        let size_hex = size_line.trim().split(';').next().unwrap_or("").trim();
        let Ok(size) = usize::from_str_radix(size_hex, 16) else {
            break;
        };
        if size == 0 {
            break;
        }
        if after.len() < size {
            out.push_str(after);
            break;
        }
        out.push_str(&after[..size]);
        rest = &after[size..];
        if let Some(stripped) = rest.strip_prefix("\r\n") {
            rest = stripped;
        } else if let Some(stripped) = rest.strip_prefix('\n') {
            rest = stripped;
        }
    }
    if out.is_empty() {
        input.to_string()
    } else {
        out
    }
}
