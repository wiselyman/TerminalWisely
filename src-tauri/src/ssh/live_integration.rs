//! Live SSH/SFTP checks against Docker openssh-server (feature `integration-tests`).
//! Run via `scripts/e2e-ssh-integration.sh` with `TW_SSH_E2E=1`.

#![cfg(feature = "integration-tests")]

#[cfg(test)]
mod tests {
    use std::path::PathBuf;
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use std::time::Duration;

    use uuid::Uuid;

    use crate::ssh::client::{exec_command_capture, open_transfer_connection};
    use crate::ssh::sftp::{
        download_file, remote_file_size, remove_remote_file, resolve_remote_home, upload_file,
    };
    use crate::types::{AuthMethod, SshConnectRequest};

    fn live_password_request() -> Option<SshConnectRequest> {
        if std::env::var("TW_SSH_E2E").ok().as_deref() != Some("1") {
            return None;
        }

        let port = std::env::var("TW_SSH_E2E_PORT")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(2222);

        Some(SshConnectRequest {
            host: std::env::var("TW_SSH_E2E_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
            port,
            username: std::env::var("TW_SSH_E2E_USER").unwrap_or_else(|_| "e2e".into()),
            auth_method: AuthMethod::Password,
            password: Some(
                std::env::var("TW_SSH_E2E_PASSWORD").unwrap_or_else(|_| "e2etest".into()),
            ),
            private_key_path: None,
            passphrase: None,
            session_title: Some("tw-live-integration".into()),
        })
    }

    fn live_private_key_request() -> Option<SshConnectRequest> {
        if std::env::var("TW_SSH_E2E").ok().as_deref() != Some("1") {
            return None;
        }

        let key_path = std::env::var("TW_SSH_E2E_PRIVATE_KEY").ok()?;
        if !std::path::Path::new(&key_path).is_file() {
            return None;
        }

        let port = std::env::var("TW_SSH_E2E_PORT")
            .ok()
            .and_then(|value| value.parse().ok())
            .unwrap_or(2222);

        Some(SshConnectRequest {
            host: std::env::var("TW_SSH_E2E_HOST").unwrap_or_else(|_| "127.0.0.1".into()),
            port,
            username: std::env::var("TW_SSH_E2E_USER").unwrap_or_else(|_| "e2e".into()),
            auth_method: AuthMethod::PrivateKey,
            password: None,
            private_key_path: Some(key_path),
            passphrase: None,
            session_title: Some("tw-live-key".into()),
        })
    }

    fn temp_upload_file(contents: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("tw-e2e-upload-{}.txt", Uuid::new_v4()));
        std::fs::write(&path, contents).expect("write temp upload file");
        path
    }

    fn temp_large_file(size_bytes: usize) -> PathBuf {
        let path = std::env::temp_dir().join(format!("tw-e2e-large-{}", Uuid::new_v4()));
        let chunk = vec![b'x'; 64 * 1024];
        let mut file = std::fs::File::create(&path).expect("create large file");
        use std::io::Write;
        let mut written = 0usize;
        while written < size_bytes {
            let take = chunk.len().min(size_bytes - written);
            file.write_all(&chunk[..take]).expect("write chunk");
            written += take;
        }
        path
    }

    #[tokio::test]
    async fn live_password_ssh_connect_and_exec() {
        let Some(request) = live_password_request() else {
            return;
        };

        let transfer = open_transfer_connection(&request, None)
            .await
            .expect("SSH connect");
        let handle = transfer.handle();

        let (stdout, _stderr, code) = exec_command_capture(&handle, "echo TW_SSH_OK", None)
            .await
            .expect("remote exec");
        assert_eq!(code, 0);
        assert!(stdout.contains("TW_SSH_OK"), "stdout={stdout}");
    }

    #[tokio::test]
    async fn live_private_key_ssh_connect_and_exec() {
        let Some(request) = live_private_key_request() else {
            return;
        };

        let transfer = open_transfer_connection(&request, None)
            .await
            .expect("SSH key connect");
        let handle = transfer.handle();

        let (stdout, _stderr, code) =
            exec_command_capture(&handle, "echo TW_SSH_KEY_OK", None)
                .await
                .expect("remote exec");
        assert_eq!(code, 0);
        assert!(stdout.contains("TW_SSH_KEY_OK"), "stdout={stdout}");
    }

    #[tokio::test]
    async fn live_sftp_upload_file() {
        let Some(request) = live_password_request() else {
            return;
        };

        let marker = format!("tw-e2e-upload-{}", Uuid::new_v4());
        let local_path = temp_upload_file(&format!("{marker}\n"));
        let remote_name = format!("{marker}.txt");

        let transfer = open_transfer_connection(&request, None)
            .await
            .expect("SSH connect");
        let handle = transfer.handle();
        let home = {
            let guard = handle.lock().await;
            resolve_remote_home(&guard).await.expect("remote home")
        };
        let remote_path = format!("{}/{}", home.trim_end_matches('/'), remote_name);

        upload_file(&handle, &local_path, &remote_path, None, |_| {})
            .await
            .expect("sftp upload");

        let size = remote_file_size(&handle, &remote_path)
            .await
            .expect("remote stat");
        assert!(size > 0, "uploaded file should be non-empty");

        let (stdout, _stderr, code) = exec_command_capture(
            &handle,
            &format!("test -f {remote_path} && echo EXISTS"),
            None,
        )
        .await
        .expect("verify remote file");
        assert_eq!(code, 0);
        assert!(stdout.contains("EXISTS"), "stdout={stdout}");

        let _ = remove_remote_file(&handle, &remote_path).await;
        let _ = std::fs::remove_file(&local_path);
    }

    #[tokio::test]
    async fn live_sftp_download_file() {
        let Some(request) = live_password_request() else {
            return;
        };

        let marker = format!("tw-e2e-download-{}", Uuid::new_v4());
        let payload = format!("download-payload-{marker}\n");
        let local_upload = temp_upload_file(&payload);
        let remote_name = format!("{marker}.txt");

        let transfer = open_transfer_connection(&request, None)
            .await
            .expect("SSH connect");
        let handle = transfer.handle();
        let home = {
            let guard = handle.lock().await;
            resolve_remote_home(&guard).await.expect("remote home")
        };
        let remote_path = format!("{}/{}", home.trim_end_matches('/'), remote_name);

        upload_file(&handle, &local_upload, &remote_path, None, |_| {})
            .await
            .expect("seed remote file");

        let local_download = std::env::temp_dir().join(format!("tw-e2e-dl-{marker}.txt"));
        download_file(&handle, &remote_path, &local_download, None, |_, _| {})
            .await
            .expect("download file");

        let downloaded = std::fs::read_to_string(&local_download).expect("read download");
        assert_eq!(downloaded, payload);

        let _ = remove_remote_file(&handle, &remote_path).await;
        let _ = std::fs::remove_file(&local_upload);
        let _ = std::fs::remove_file(&local_download);
    }

    #[tokio::test]
    async fn live_sftp_upload_cancel() {
        let Some(request) = live_password_request() else {
            return;
        };

        let local_path = temp_large_file(3 * 1024 * 1024);
        let remote_name = format!("tw-e2e-cancel-{}.bin", Uuid::new_v4());

        let transfer = open_transfer_connection(&request, None)
            .await
            .expect("SSH connect");
        let handle = transfer.handle();
        let home = {
            let guard = handle.lock().await;
            resolve_remote_home(&guard).await.expect("remote home")
        };
        let remote_path = format!("{}/{}", home.trim_end_matches('/'), remote_name);

        let cancel = Arc::new(AtomicBool::new(false));
        let cancel_flag = cancel.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(5)).await;
            cancel_flag.store(true, Ordering::SeqCst);
        });

        let result = upload_file(
            &handle,
            &local_path,
            &remote_path,
            Some(cancel),
            |_| {},
        )
        .await;

        assert!(result.is_err(), "expected cancelled upload");
        let _ = remove_remote_file(&handle, &remote_path).await;
        let _ = std::fs::remove_file(&local_path);
    }

    #[tokio::test]
    async fn live_ssh_reconnect_transport() {
        let Some(request) = live_password_request() else {
            return;
        };

        let first = open_transfer_connection(&request, None)
            .await
            .expect("first connect");
        let (stdout1, _, code1) =
            exec_command_capture(&first.handle(), "echo RECONNECT_1", None)
                .await
                .expect("first exec");
        assert_eq!(code1, 0);
        assert!(stdout1.contains("RECONNECT_1"));

        drop(first);

        let second = open_transfer_connection(&request, None)
            .await
            .expect("second connect");
        let (stdout2, _, code2) =
            exec_command_capture(&second.handle(), "echo RECONNECT_2", None)
                .await
                .expect("second exec");
        assert_eq!(code2, 0);
        assert!(stdout2.contains("RECONNECT_2"));
    }
}
