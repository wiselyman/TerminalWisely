//! Local HTTP proxy (CONNECT + absolute-URI) that forwards via SOCKS5 → SSH.
//!
//! WKWebView `proxy_url=socks5://…` often paints blank on macOS; `http://` CONNECT
//! proxy is the supported path and lets SPA XHR/WebSocket use the remote network.

use std::collections::HashSet;
use std::net::SocketAddr;
use std::sync::{Arc, Mutex};

use tokio::io::{AsyncBufReadExt, AsyncReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};

pub struct HttpProxy {
    pub port: u16,
    /// Local tunnel ports that must be dialed on this machine, not via SSH.
    local_ports: Arc<Mutex<HashSet<u16>>>,
    shutdown_tx: Option<oneshot::Sender<()>>,
    accept_task: Option<JoinHandle<()>>,
}

impl Drop for HttpProxy {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(task) = self.accept_task.take() {
            task.abort();
        }
    }
}

impl HttpProxy {
    /// `socks_port` is our in-process SocksBridge (SSH DynamicForward).
    pub async fn start(socks_port: u16) -> AppResult<Self> {
        let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .map_err(|e| AppError::msg(format!("http proxy bind: {e}")))?;
        let port = listener
            .local_addr()
            .map_err(|e| AppError::msg(format!("http proxy addr: {e}")))?
            .port();

        let local_ports = Arc::new(Mutex::new(HashSet::new()));
        let ports_for_task = Arc::clone(&local_ports);
        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
        let accept_task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => break,
                    accepted = listener.accept() => {
                        match accepted {
                            Ok((stream, _)) => {
                                let ports = Arc::clone(&ports_for_task);
                                tokio::spawn(async move {
                                    if let Err(e) = handle_client(stream, socks_port, ports).await {
                                        log::debug!("host-browser http-proxy: {e}");
                                    }
                                });
                            }
                            Err(_) => break,
                        }
                    }
                }
            }
        });

        Ok(Self {
            port,
            local_ports,
            shutdown_tx: Some(shutdown_tx),
            accept_task: Some(accept_task),
        })
    }

    /// `port` is a local TCP tunnel. Requests to it must not be SOCKS'd to the remote host.
    pub fn allow_local_port(&self, port: u16) {
        if let Ok(mut set) = self.local_ports.lock() {
            set.insert(port);
        }
    }
}

async fn handle_client(
    stream: TcpStream,
    socks_port: u16,
    local_ports: Arc<Mutex<HashSet<u16>>>,
) -> Result<(), String> {
    let mut reader = BufReader::new(stream);
    let mut first = String::new();
    reader
        .read_line(&mut first)
        .await
        .map_err(|e| format!("read req: {e}"))?;
    let first = first.trim_end_matches(['\r', '\n']);
    if first.is_empty() {
        return Ok(());
    }
    let mut parts = first.splitn(3, ' ');
    let method = parts.next().unwrap_or("").to_uppercase();
    let target = parts.next().unwrap_or("").to_string();
    let version = parts.next().unwrap_or("HTTP/1.1").to_string();

    let mut headers: Vec<(String, String)> = Vec::new();
    let mut content_length: Option<usize> = None;
    loop {
        let mut line = String::new();
        reader
            .read_line(&mut line)
            .await
            .map_err(|e| format!("read hdr: {e}"))?;
        let trimmed = line.trim_end_matches(['\r', '\n']);
        if trimmed.is_empty() {
            break;
        }
        if let Some((k, v)) = trimmed.split_once(':') {
            let key = k.trim().to_string();
            let val = v.trim().to_string();
            if key.eq_ignore_ascii_case("content-length") {
                content_length = val.parse().ok();
            }
            // Drop hop-by-hop / proxy headers
            if key.eq_ignore_ascii_case("proxy-connection")
                || key.eq_ignore_ascii_case("proxy-authorization")
            {
                continue;
            }
            headers.push((key, val));
        }
    }

    let mut stream = reader.into_inner();

    if method == "CONNECT" {
        let (host, port) = parse_host_port(&target, 443)?;
        let mut upstream = match dial_upstream(socks_port, &host, port, &local_ports).await {
            Ok(s) => s,
            Err(e) => {
                log::warn!("host-browser CONNECT {host}:{port} failed: {e}");
                eprintln!("[host-browser] CONNECT {host}:{port} FAILED: {e}");
                let _ = stream
                    .write_all(b"HTTP/1.1 502 Bad Gateway\r\nContent-Length: 0\r\n\r\n")
                    .await;
                return Err(e);
            }
        };
        log::warn!("host-browser CONNECT {host}:{port} via socks OK");
        eprintln!("[host-browser] CONNECT {host}:{port} via socks OK");
        // Classic CONNECT reply — some TLS stacks are picky about the reason phrase.
        stream
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            .await
            .map_err(|e| e.to_string())?;
        stream.flush().await.map_err(|e| e.to_string())?;
        pipe(stream, upstream).await;
        return Ok(());
    }

    // Absolute-form: GET http://host:port/path HTTP/1.1
    let (host, port, origin_path) = if let Some(rest) = target.strip_prefix("http://") {
        split_authority_path(rest, 80)?
    } else if let Some(rest) = target.strip_prefix("https://") {
        // Unusual for absolute-form over HTTP proxy; treat as CONNECT target + fail soft
        let (host, port, _) = split_authority_path(rest, 443)?;
        let mut upstream = dial_upstream(socks_port, &host, port, &local_ports).await?;
        stream
            .write_all(b"HTTP/1.1 200 Connection Established\r\n\r\n")
            .await
            .map_err(|e| e.to_string())?;
        let _ = version;
        pipe(stream, upstream).await;
        return Ok(());
    } else {
        // Origin-form with Host header
        let host_hdr = headers
            .iter()
            .find(|(k, _)| k.eq_ignore_ascii_case("host"))
            .map(|(_, v)| v.as_str())
            .ok_or_else(|| "missing Host".to_string())?;
        let (host, port) = parse_host_port(host_hdr, 80)?;
        (host, port, target)
    };

    let mut upstream = dial_upstream(socks_port, &host, port, &local_ports).await?;

    let mut out = format!("{method} {origin_path} {version}\r\n");
    let mut has_host = false;
    for (k, v) in &headers {
        if k.eq_ignore_ascii_case("host") {
            has_host = true;
            out.push_str(&format!("Host: {host}:{port}\r\n"));
        } else {
            out.push_str(&format!("{k}: {v}\r\n"));
        }
    }
    if !has_host {
        out.push_str(&format!("Host: {host}:{port}\r\n"));
    }
    out.push_str("\r\n");
    upstream
        .write_all(out.as_bytes())
        .await
        .map_err(|e| e.to_string())?;

    if let Some(len) = content_length {
        if len > 0 {
            let mut body = vec![0u8; len];
            stream
                .read_exact(&mut body)
                .await
                .map_err(|e| format!("body: {e}"))?;
            upstream.write_all(&body).await.map_err(|e| e.to_string())?;
        }
    }
    upstream.flush().await.map_err(|e| e.to_string())?;
    pipe(stream, upstream).await;
    Ok(())
}

fn parse_host_port(authority: &str, default_port: u16) -> Result<(String, u16), String> {
    let authority = authority.trim();
    if let Some(rest) = authority.strip_prefix('[') {
        // [ipv6]:port
        let (host, rest) = rest
            .split_once(']')
            .ok_or_else(|| "bad ipv6 authority".to_string())?;
        let port = if let Some(p) = rest.strip_prefix(':') {
            p.parse().map_err(|_| "bad port".to_string())?
        } else {
            default_port
        };
        return Ok((host.to_string(), port));
    }
    if let Some((host, port_s)) = authority.rsplit_once(':') {
        if !host.is_empty() && port_s.chars().all(|c| c.is_ascii_digit()) {
            let port: u16 = port_s.parse().map_err(|_| "bad port".to_string())?;
            return Ok((host.to_string(), port));
        }
    }
    Ok((authority.to_string(), default_port))
}

fn split_authority_path(rest: &str, default_port: u16) -> Result<(String, u16, String), String> {
    let (auth, path) = if let Some(i) = rest.find('/') {
        (&rest[..i], rest[i..].to_string())
    } else {
        (rest, "/".to_string())
    };
    let (host, port) = parse_host_port(auth, default_port)?;
    Ok((host, port, path))
}

fn is_loopback_host(host: &str) -> bool {
    let host = host.trim().trim_matches(['[', ']']);
    host.eq_ignore_ascii_case("localhost")
        || host == "127.0.0.1"
        || host == "::1"
        || host == "0.0.0.0"
}

async fn dial_upstream(
    socks_port: u16,
    host: &str,
    port: u16,
    local_ports: &Arc<Mutex<HashSet<u16>>>,
) -> Result<TcpStream, String> {
    if is_loopback_host(host) {
        let hit = local_ports
            .lock()
            .map(|set| set.contains(&port))
            .unwrap_or(false);
        if hit {
            return TcpStream::connect(("127.0.0.1", port))
                .await
                .map_err(|e| format!("local tunnel dial: {e}"));
        }
    }
    socks5_connect(socks_port, host, port).await
}

async fn socks5_connect(socks_port: u16, host: &str, port: u16) -> Result<TcpStream, String> {
    let mut socks = TcpStream::connect(("127.0.0.1", socks_port))
        .await
        .map_err(|e| format!("socks connect: {e}"))?;
    socks
        .write_all(&[0x05, 0x01, 0x00])
        .await
        .map_err(|e| e.to_string())?;
    socks.flush().await.map_err(|e| e.to_string())?;
    let mut greet = [0u8; 2];
    socks
        .read_exact(&mut greet)
        .await
        .map_err(|e| format!("socks greet: {e}"))?;
    if greet != [0x05, 0x00] {
        return Err(format!("socks greet bad: {greet:?}"));
    }

    let host_bytes = host.as_bytes();
    if host_bytes.len() > 255 {
        return Err("host too long".into());
    }
    let mut req = Vec::with_capacity(7 + host_bytes.len());
    req.extend_from_slice(&[0x05, 0x01, 0x00, 0x03, host_bytes.len() as u8]);
    req.extend_from_slice(host_bytes);
    req.extend_from_slice(&port.to_be_bytes());
    socks.write_all(&req).await.map_err(|e| e.to_string())?;
    socks.flush().await.map_err(|e| e.to_string())?;

    let mut reply = [0u8; 4];
    socks
        .read_exact(&mut reply)
        .await
        .map_err(|e| format!("socks reply: {e}"))?;
    if reply[0] != 0x05 || reply[1] != 0x00 {
        return Err(format!("socks CONNECT failed rep={}", reply[1]));
    }
    match reply[3] {
        0x01 => {
            let mut rest = [0u8; 6];
            socks.read_exact(&mut rest).await.map_err(|e| e.to_string())?;
        }
        0x03 => {
            let mut len = [0u8; 1];
            socks.read_exact(&mut len).await.map_err(|e| e.to_string())?;
            let mut skip = vec![0u8; len[0] as usize + 2];
            socks.read_exact(&mut skip).await.map_err(|e| e.to_string())?;
        }
        0x04 => {
            let mut rest = [0u8; 18];
            socks.read_exact(&mut rest).await.map_err(|e| e.to_string())?;
        }
        other => return Err(format!("socks bad atyp {other}")),
    }
    Ok(socks)
}

async fn pipe(a: TcpStream, b: TcpStream) {
    let mut a = a;
    let mut b = b;
    // Must not cancel one direction when the other pauses — TLS handshakes need
    // full-duplex until either peer closes (select!+copy used to abort early → blank HTTPS).
    let _ = tokio::io::copy_bidirectional(&mut a, &mut b).await;
}

#[cfg(test)]
mod tests {
    use super::parse_host_port;

    #[test]
    fn parse_host_default_port() {
        assert_eq!(
            parse_host_port("10.6.20.241", 80).unwrap(),
            ("10.6.20.241".into(), 80)
        );
        assert_eq!(
            parse_host_port("10.6.20.241:31111", 80).unwrap(),
            ("10.6.20.241".into(), 31111)
        );
    }
}
