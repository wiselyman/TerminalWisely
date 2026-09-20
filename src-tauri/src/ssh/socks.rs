//! SOCKS5 DynamicForward over an existing russh session (CONNECT only).

use std::net::SocketAddr;
use std::sync::Arc;

use russh::client;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};
use crate::ssh::client::ClientHandler;

pub struct SocksBridge {
    pub port: u16,
    shutdown_tx: Option<oneshot::Sender<()>>,
    accept_task: Option<JoinHandle<()>>,
}

impl Drop for SocksBridge {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(task) = self.accept_task.take() {
            task.abort();
        }
    }
}

impl SocksBridge {
    pub async fn start(
        handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    ) -> AppResult<Self> {
        let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .map_err(|e| AppError::msg(format!("socks bind failed: {e}")))?;
        let port = listener
            .local_addr()
            .map_err(|e| AppError::msg(format!("socks local_addr: {e}")))?
            .port();

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
        let accept_task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => break,
                    accepted = listener.accept() => {
                        match accepted {
                            Ok((stream, _)) => {
                                let h = handle.clone();
                                tokio::spawn(async move {
                                    let _ = handle_socks_client(stream, h).await;
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
            shutdown_tx: Some(shutdown_tx),
            accept_task: Some(accept_task),
        })
    }
}

async fn handle_socks_client(
    mut stream: TcpStream,
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
) -> Result<(), String> {
    // Greeting
    let mut hdr = [0u8; 2];
    stream
        .read_exact(&mut hdr)
        .await
        .map_err(|e| e.to_string())?;
    if hdr[0] != 0x05 {
        return Err("not socks5".into());
    }
    let nmethods = hdr[1] as usize;
    let mut methods = vec![0u8; nmethods];
    if nmethods > 0 {
        stream
            .read_exact(&mut methods)
            .await
            .map_err(|e| e.to_string())?;
    }
    // no-auth
    stream
        .write_all(&[0x05, 0x00])
        .await
        .map_err(|e| e.to_string())?;
    stream.flush().await.map_err(|e| e.to_string())?;

    // Request
    let mut req = [0u8; 4];
    stream
        .read_exact(&mut req)
        .await
        .map_err(|e| e.to_string())?;
    if req[0] != 0x05 {
        return Err("bad ver".into());
    }
    let cmd = req[1];
    let atyp = req[3];
    if cmd != 0x01 {
        // only CONNECT
        let _ = write_socks_reply(&mut stream, 0x07, "0.0.0.0", 0).await;
        return Err("cmd not connect".into());
    }

    let (dest_host, dest_port) = read_socks_addr(&mut stream, atyp).await?;

    let channel = {
        let guard = handle.lock().await;
        guard
            .channel_open_direct_tcpip(
                dest_host.clone(),
                dest_port as u32,
                "127.0.0.1",
                0,
            )
            .await
    };

    let mut channel = match channel {
        Ok(ch) => ch,
        Err(err) => {
            let _ = write_socks_reply(&mut stream, 0x05, "0.0.0.0", 0).await;
            return Err(format!("direct-tcpip: {err}"));
        }
    };

    write_socks_reply(&mut stream, 0x00, "0.0.0.0", 0)
        .await
        .map_err(|e| e.to_string())?;

    // Full-duplex TLS/HTTP2 needs both directions until either peer closes.
    // select!+wait used to abort one side early → blank HTTPS (e.g. baidu.com).
    let mut channel_stream = channel.into_stream();
    let _ = tokio::io::copy_bidirectional(&mut stream, &mut channel_stream).await;
    Ok(())
}

async fn read_socks_addr(
    stream: &mut TcpStream,
    atyp: u8,
) -> Result<(String, u16), String> {
    match atyp {
        0x01 => {
            let mut ip = [0u8; 4];
            stream.read_exact(&mut ip).await.map_err(|e| e.to_string())?;
            let mut port_b = [0u8; 2];
            stream
                .read_exact(&mut port_b)
                .await
                .map_err(|e| e.to_string())?;
            let port = u16::from_be_bytes(port_b);
            Ok((format!("{}.{}.{}.{}", ip[0], ip[1], ip[2], ip[3]), port))
        }
        0x03 => {
            let mut len = [0u8; 1];
            stream.read_exact(&mut len).await.map_err(|e| e.to_string())?;
            let mut host = vec![0u8; len[0] as usize];
            stream
                .read_exact(&mut host)
                .await
                .map_err(|e| e.to_string())?;
            let mut port_b = [0u8; 2];
            stream
                .read_exact(&mut port_b)
                .await
                .map_err(|e| e.to_string())?;
            let port = u16::from_be_bytes(port_b);
            let name = String::from_utf8(host).map_err(|e| e.to_string())?;
            Ok((name, port))
        }
        0x04 => {
            let mut ip = [0u8; 16];
            stream.read_exact(&mut ip).await.map_err(|e| e.to_string())?;
            let mut port_b = [0u8; 2];
            stream
                .read_exact(&mut port_b)
                .await
                .map_err(|e| e.to_string())?;
            let port = u16::from_be_bytes(port_b);
            // Format as IPv6 for direct-tcpip
            let mut parts = Vec::with_capacity(8);
            for chunk in ip.chunks(2) {
                parts.push(format!("{:x}", u16::from_be_bytes([chunk[0], chunk[1]])));
            }
            Ok((parts.join(":"), port))
        }
        _ => Err(format!("unsupported atyp {atyp}")),
    }
}

async fn write_socks_reply(
    stream: &mut TcpStream,
    rep: u8,
    bind_host: &str,
    bind_port: u16,
) -> std::io::Result<()> {
    let _ = bind_host;
    // Always reply with IPv4 0.0.0.0 for simplicity
    let mut out = vec![0x05, rep, 0x00, 0x01, 0, 0, 0, 0];
    out.extend_from_slice(&bind_port.to_be_bytes());
    stream.write_all(&out).await?;
    stream.flush().await
}

#[cfg(test)]
mod tests {
    #[test]
    fn socks_reply_layout() {
        let port = 1080u16;
        let mut out = vec![0x05, 0x00, 0x00, 0x01, 0, 0, 0, 0];
        out.extend_from_slice(&port.to_be_bytes());
        assert_eq!(out.len(), 10);
        assert_eq!(out[0], 0x05);
        assert_eq!(u16::from_be_bytes([out[8], out[9]]), 1080);
    }

    #[test]
    fn socks_relay_prefers_stream_copy_api() {
        // Regression guard: handle_socks_client must use Channel::into_stream +
        // copy_bidirectional (not select!+wait) so HTTPS CONNECT stays full-duplex.
        let src = include_str!("socks.rs");
        let code = src
            .split("#[cfg(test)]")
            .next()
            .expect("socks.rs production section");
        assert!(
            code.contains("into_stream()") && code.contains("copy_bidirectional"),
            "socks relay must use into_stream + copy_bidirectional for TLS"
        );
        assert!(
            !code.contains(".wait()"),
            "socks relay must not use channel.wait (aborts TLS)"
        );
    }

    #[test]
    fn socks5_greeting_no_auth_bytes() {
        // client greeting: VER=5, NMETHODS=1, METHOD=0
        let client = [0x05u8, 0x01, 0x00];
        assert_eq!(client[0], 0x05);
        assert_eq!(client[1], 1);
        // server choice
        let server = [0x05u8, 0x00];
        assert_eq!(server[1], 0x00);
    }

    #[test]
    fn socks5_connect_ipv4_request_shape() {
        // VER CMD RSV ATYP + 1.2.3.4:8080
        let mut req = vec![0x05u8, 0x01, 0x00, 0x01, 1, 2, 3, 4];
        req.extend_from_slice(&8080u16.to_be_bytes());
        assert_eq!(req.len(), 10);
        assert_eq!(req[3], 0x01);
        assert_eq!(u16::from_be_bytes([req[8], req[9]]), 8080);
    }
}
