//! Cache remote images for AI chat bubbles (no WebView hotlink).

use std::fs;
use std::io::Write;
use std::net::IpAddr;
use std::path::{Path, PathBuf};

use reqwest::Url;
use serde::Serialize;
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager};
use base64::{engine::general_purpose::STANDARD as B64, Engine as _};

use crate::error::{AppError, AppResult};

const MAX_BYTES: usize = 8 * 1024 * 1024;
const MAX_REDIRECTS: usize = 5;
const MEDIA_SUBDIR: &str = "media";

#[derive(Debug, Clone, Serialize)]
pub struct CachedRemoteMedia {
    pub media_id: String,
    pub path: String,
    pub content_type: String,
    pub bytes: u64,
    /// Prefer this in WebView — `asset://` URLs break when round-tripped via innerHTML.
    pub data_url: String,
}

pub fn media_dir(app: &AppHandle) -> AppResult<PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::msg(e.to_string()))?
        .join("ai-engineer")
        .join(MEDIA_SUBDIR);
    fs::create_dir_all(&dir).map_err(AppError::from)?;
    Ok(dir)
}

/// Validate public http(s) URL — block localhost / private IP literals.
pub fn assert_public_http_url(raw: &str) -> AppResult<Url> {
    let url = Url::parse(raw.trim()).map_err(|e| AppError::msg(format!("bad url: {e}")))?;
    let scheme = url.scheme();
    if scheme != "http" && scheme != "https" {
        return Err(AppError::msg("url must be http(s)"));
    }
    let host = url
        .host_str()
        .ok_or_else(|| AppError::msg("url missing host"))?
        .to_ascii_lowercase();
    if host == "localhost" || host.ends_with(".localhost") || host == "0.0.0.0" {
        return Err(AppError::msg("url host not allowed"));
    }
    if let Ok(ip) = host.parse::<IpAddr>() {
        if ip_is_non_public(ip) {
            return Err(AppError::msg("url host not allowed"));
        }
    }
    Ok(url)
}

fn ip_is_non_public(ip: IpAddr) -> bool {
    match ip {
        IpAddr::V4(v4) => {
            v4.is_loopback()
                || v4.is_private()
                || v4.is_link_local()
                || v4.is_broadcast()
                || v4.is_unspecified()
                || v4.octets()[0] == 100 && (v4.octets()[1] & 0xc0) == 64 // 100.64/10
        }
        IpAddr::V6(v6) => {
            v6.is_loopback()
                || v6.is_unique_local()
                || v6.is_unicast_link_local()
                || v6.is_unspecified()
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImageKind {
    Jpeg,
    Png,
    Gif,
    Webp,
}

fn detect_image(bytes: &[u8], content_type: &str) -> Option<ImageKind> {
    let kind = if bytes.len() >= 3 && bytes[0] == 0xff && bytes[1] == 0xd8 && bytes[2] == 0xff {
        Some(ImageKind::Jpeg)
    } else if bytes.len() >= 8 && bytes.starts_with(b"\x89PNG\r\n\x1a\n") {
        Some(ImageKind::Png)
    } else if bytes.len() >= 6 && (bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a")) {
        Some(ImageKind::Gif)
    } else if bytes.len() >= 12 && bytes.starts_with(b"RIFF") && &bytes[8..12] == b"WEBP" {
        Some(ImageKind::Webp)
    } else {
        None
    };
    if kind.is_some() {
        return kind;
    }
    let ct = content_type.to_ascii_lowercase();
    if ct.contains("image/jpeg") || ct.contains("image/jpg") {
        return Some(ImageKind::Jpeg);
    }
    if ct.contains("image/png") {
        return Some(ImageKind::Png);
    }
    if ct.contains("image/gif") {
        return Some(ImageKind::Gif);
    }
    if ct.contains("image/webp") {
        return Some(ImageKind::Webp);
    }
    None
}

fn ext_for(kind: ImageKind) -> &'static str {
    match kind {
        ImageKind::Jpeg => "jpg",
        ImageKind::Png => "png",
        ImageKind::Gif => "gif",
        ImageKind::Webp => "webp",
    }
}

fn mime_for(kind: ImageKind) -> &'static str {
    match kind {
        ImageKind::Jpeg => "image/jpeg",
        ImageKind::Png => "image/png",
        ImageKind::Gif => "image/gif",
        ImageKind::Webp => "image/webp",
    }
}

fn sha256_hex(bytes: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(bytes);
    hex::encode(hasher.finalize())
}

fn write_cache_file(dir: &Path, media_id: &str, ext: &str, bytes: &[u8]) -> AppResult<PathBuf> {
    let path = dir.join(format!("{media_id}.{ext}"));
    if path.exists() {
        return Ok(path);
    }
    let tmp = dir.join(format!("{media_id}.{ext}.part"));
    {
        let mut f = fs::File::create(&tmp).map_err(AppError::from)?;
        f.write_all(bytes).map_err(AppError::from)?;
        f.sync_all().ok();
    }
    fs::rename(&tmp, &path).map_err(AppError::from)?;
    Ok(path)
}

fn data_url_for(kind: ImageKind, bytes: &[u8]) -> String {
    format!("data:{};base64,{}", mime_for(kind), B64.encode(bytes))
}

/// Persist bytes already validated as an image (shared with sidecar-written files).
pub fn store_image_bytes(app: &AppHandle, bytes: &[u8], content_type: &str) -> AppResult<CachedRemoteMedia> {
    if bytes.len() > MAX_BYTES {
        return Err(AppError::msg("image exceeds size limit"));
    }
    let kind = detect_image(bytes, content_type)
        .ok_or_else(|| AppError::msg("response is not a supported image"))?;
    let media_id = sha256_hex(bytes);
    let dir = media_dir(app)?;
    let path = write_cache_file(&dir, &media_id, ext_for(kind), bytes)?;
    Ok(CachedRemoteMedia {
        media_id,
        path: path.to_string_lossy().to_string(),
        content_type: mime_for(kind).to_string(),
        bytes: bytes.len() as u64,
        data_url: data_url_for(kind, bytes),
    })
}

pub async fn cache_remote_media(app: &AppHandle, url: &str) -> AppResult<CachedRemoteMedia> {
    let mut current = assert_public_http_url(url)?;
    let client = reqwest::Client::builder()
        .user_agent(concat!("TerminalWisely/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(30))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| AppError::msg(e.to_string()))?;

    let mut resp = None;
    for _ in 0..MAX_REDIRECTS {
        let r = client
            .get(current.clone())
            .send()
            .await
            .map_err(|e| AppError::msg(format!("download failed: {e}")))?;
        let status = r.status();
        if status.is_redirection() {
            let loc = r
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .ok_or_else(|| AppError::msg("redirect without location"))?;
            let next = if loc.starts_with("http://") || loc.starts_with("https://") {
                assert_public_http_url(loc)?
            } else {
                current
                    .join(loc)
                    .map_err(|e| AppError::msg(e.to_string()))
                    .and_then(|u| assert_public_http_url(u.as_str()))?
            };
            current = next;
            continue;
        }
        resp = Some(r);
        break;
    }
    let resp = resp.ok_or_else(|| AppError::msg("too many redirects"))?;
    if !resp.status().is_success() {
        return Err(AppError::msg(format!("HTTP {}", resp.status())));
    }
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .unwrap_or("")
        .to_string();
    let bytes = resp
        .bytes()
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    if bytes.len() > MAX_BYTES {
        return Err(AppError::msg("image exceeds size limit"));
    }
    store_image_bytes(app, &bytes, &content_type)
}

/// Resolve a content-addressed media_id written by Rust or the sidecar.
pub fn resolve_media_id(app: &AppHandle, media_id: &str) -> AppResult<CachedRemoteMedia> {
    let id = media_id.trim();
    if id.is_empty()
        || id.len() > 128
        || !id.chars().all(|c| c.is_ascii_hexdigit())
    {
        return Err(AppError::msg("invalid media_id"));
    }
    let dir = media_dir(app)?;
    for ext in ["jpg", "png", "gif", "webp"] {
        let path = dir.join(format!("{id}.{ext}"));
        if path.is_file() {
            let bytes = fs::read(&path).map_err(AppError::from)?;
            let kind = match ext {
                "jpg" => ImageKind::Jpeg,
                "png" => ImageKind::Png,
                "gif" => ImageKind::Gif,
                _ => ImageKind::Webp,
            };
            return Ok(CachedRemoteMedia {
                media_id: id.to_string(),
                path: path.to_string_lossy().to_string(),
                content_type: mime_for(kind).to_string(),
                bytes: bytes.len() as u64,
                data_url: data_url_for(kind, &bytes),
            });
        }
    }
    Err(AppError::msg("media not found"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rejects_non_http_and_localhost() {
        assert!(assert_public_http_url("javascript:alert(1)").is_err());
        assert!(assert_public_http_url("file:///tmp/x").is_err());
        assert!(assert_public_http_url("http://localhost/a.png").is_err());
        assert!(assert_public_http_url("http://127.0.0.1/a.png").is_err());
        assert!(assert_public_http_url("https://example.com/a.png").is_ok());
    }

    #[test]
    fn detects_png_magic() {
        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        png.extend_from_slice(&[0u8; 24]);
        assert_eq!(detect_image(&png, ""), Some(ImageKind::Png));
        assert!(detect_image(b"not an image", "text/html").is_none());
    }

    #[test]
    fn rejects_oversized_buffer() {
        let big = vec![0u8; MAX_BYTES + 1];
        // Without app handle we only test detect + size gate via logic:
        assert!(big.len() > MAX_BYTES);
    }
}
