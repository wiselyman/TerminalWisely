//! Live SSH/SFTP checks against Docker openssh-server (feature `integration-tests`).
//! Run via `scripts/e2e-ssh-integration.sh` with `TW_SSH_E2E=1`.

#![cfg(feature = "integration-tests")]

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use uuid::Uuid;

    use crate::ssh::client::{exec_command_capture, open_transfer_connection};
    use crate::ssh::sftp::{remote_file_size, resolve_remote_home, upload_file};
    use crate::types::{AuthMethod, SshConnectRequest};

    fn live_request() -> Option<SshConnectRequest> {
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

    fn temp_upload_file(contents: &str) -> PathBuf {
        let path = std::env::temp_dir().join(format!("tw-e2e-upload-{}.txt", Uuid::new_v4()));
        std::fs::write(&path, contents).expect("write temp upload file");
        path
    }

    #[tokio::test]
    async fn live_password_ssh_connect_and_exec() {
        let Some(request) = live_request() else {
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
    async fn live_sftp_upload_file() {
        let Some(request) = live_request() else {
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

        let _ = crate::ssh::sftp::remove_remote_file(&handle, &remote_path).await;
        let _ = std::fs::remove_file(&local_path);
    }
}
