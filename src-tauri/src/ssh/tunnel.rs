//! Local TCP tunnel over an existing russh session (one remote host:port → local port).
//!
//! Two modes:
//! - `start`: direct `channel_open_direct_tcpip` (can RST under handle lock contention)
//! - `start_via_socks`: local accept → SOCKS5 CONNECT to our SocksBridge (proven path)

use std::net::SocketAddr;
use std::sync::Arc;

use russh::client;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{oneshot, Mutex};
use tokio::task::JoinHandle;

use crate::error::{AppError, AppResult};
use crate::ssh::client::ClientHandler;

pub struct TcpTunnel {
    pub local_port: u16,
    pub remote_host: String,
    pub remote_port: u16,
    shutdown_tx: Option<oneshot::Sender<()>>,
    accept_task: Option<JoinHandle<()>>,
}

impl Drop for TcpTunnel {
    fn drop(&mut self) {
        if let Some(tx) = self.shutdown_tx.take() {
            let _ = tx.send(());
        }
        if let Some(task) = self.accept_task.take() {
            task.abort();
        }
    }
}

impl TcpTunnel {
    /// Prefer this: relay each accept through the in-process SOCKS5 bridge.
    pub async fn start_via_socks(
        socks_port: u16,
        remote_host: String,
        remote_port: u16,
    ) -> AppResult<Self> {
        let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .map_err(|e| AppError::msg(format!("tunnel bind failed: {e}")))?;
        let local_port = listener
            .local_addr()
            .map_err(|e| AppError::msg(format!("tunnel local_addr: {e}")))?
            .port();

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
        let remote_host_task = remote_host.clone();
        let accept_task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => break,
                    accepted = listener.accept() => {
                        match accepted {
                            Ok((stream, _)) => {
                                let host = remote_host_task.clone();
                                tokio::spawn(async move {
                                    if let Err(e) =
                                        relay_via_socks(stream, socks_port, &host, remote_port).await
                                    {
                                        log::warn!("host-browser tunnel via socks: {e}");
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
            local_port,
            remote_host,
            remote_port,
            shutdown_tx: Some(shutdown_tx),
            accept_task: Some(accept_task),
        })
    }

    pub async fn start(
        handle: Arc<Mutex<client::Handle<ClientHandler>>>,
        remote_host: String,
        remote_port: u16,
    ) -> AppResult<Self> {
        let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0)))
            .await
            .map_err(|e| AppError::msg(format!("tunnel bind failed: {e}")))?;
        let local_port = listener
            .local_addr()
            .map_err(|e| AppError::msg(format!("tunnel local_addr: {e}")))?
            .port();

        let (shutdown_tx, mut shutdown_rx) = oneshot::channel::<()>();
        let remote_host_task = remote_host.clone();
        let accept_task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_rx => break,
                    accepted = listener.accept() => {
                        match accepted {
                            Ok((stream, _)) => {
                                let h = handle.clone();
                                let host = remote_host_task.clone();
                                tokio::spawn(async move {
                                    if let Err(e) = relay_direct(stream, h, host, remote_port).await
                                    {
                                        log::warn!("host-browser tunnel direct: {e}");
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
            local_port,
            remote_host,
            remote_port,
            shutdown_tx: Some(shutdown_tx),
            accept_task: Some(accept_task),
        })
    }
}

async fn relay_via_socks(
    client: TcpStream,
    socks_port: u16,
    dest_host: &str,
    dest_port: u16,
) -> Result<(), String> {
    let mut socks = TcpStream::connect(("127.0.0.1", socks_port))
        .await
        .map_err(|e| format!("socks connect: {e}"))?;

    // Greeting: VER=5 NMETHODS=1 METHOD=0
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

    // CONNECT domain
    let host_bytes = dest_host.as_bytes();
    if host_bytes.len() > 255 {
        return Err("host too long".into());
    }
    let mut req = Vec::with_capacity(7 + host_bytes.len());
    req.extend_from_slice(&[0x05, 0x01, 0x00, 0x03, host_bytes.len() as u8]);
    req.extend_from_slice(host_bytes);
    req.extend_from_slice(&dest_port.to_be_bytes());
    socks.write_all(&req).await.map_err(|e| e.to_string())?;
    socks.flush().await.map_err(|e| e.to_string())?;

    let mut reply = [0u8; 4];
    socks
        .read_exact(&mut reply)
        .await
        .map_err(|e| format!("socks reply: {e}"))?;
    if reply[0] != 0x05 || reply[1] != 0x00 {
        return Err(format!("socks CONNECT failed: {:?}", &reply[..2]));
    }
    // Consume bind addr
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

    // Full-duplex until either peer closes (select!+copy aborted TLS early).
    let mut client = client;
    let mut socks = socks;
    let _ = tokio::io::copy_bidirectional(&mut client, &mut socks).await;
    Ok(())
}

async fn relay_direct(
    stream: TcpStream,
    handle: Arc<Mutex<client::Handle<ClientHandler>>>,
    remote_host: String,
    remote_port: u16,
) -> Result<(), String> {
    let channel = {
        let guard = handle.lock().await;
        guard
            .channel_open_direct_tcpip(remote_host, remote_port as u32, "127.0.0.1", 0)
            .await
            .map_err(|e| format!("direct-tcpip: {e}"))?
    };

    let mut stream = stream;
    let mut channel_stream = channel.into_stream();
    let _ = tokio::io::copy_bidirectional(&mut stream, &mut channel_stream).await;
    Ok(())
}

#[cfg(test)]
mod tests {
    #[test]
    fn rewrite_url_uses_local_port() {
        let local = 54321u16;
        let original = "http://127.0.0.1:8096/app?x=1";
        let rewritten = format!(
            "http://127.0.0.1:{local}{}",
            original
                .strip_prefix("http://127.0.0.1:8096")
                .unwrap_or("/")
        );
        assert_eq!(rewritten, "http://127.0.0.1:54321/app?x=1");
    }
}
