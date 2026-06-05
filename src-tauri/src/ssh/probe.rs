use russh::client;
use russh::ChannelMsg;

use crate::error::AppResult;
use crate::ssh::client::ClientHandler;

#[derive(Debug, Clone)]
pub struct ServerOsProfile {
    pub os_id: String,
    pub os_name: Option<String>,
}

pub async fn probe_remote_os(
    handle: &client::Handle<ClientHandler>,
) -> AppResult<ServerOsProfile> {
    let mut channel = handle.channel_open_session().await?;
    channel
        .exec(
            true,
            "cat /etc/os-release 2>/dev/null || uname -s 2>/dev/null",
        )
        .await?;

    let mut output = Vec::new();
    while let Some(msg) = channel.wait().await {
        match msg {
            ChannelMsg::Data { data } => output.extend_from_slice(&data),
            ChannelMsg::ExitStatus { .. } | ChannelMsg::Close | ChannelMsg::Eof => break,
            _ => {}
        }
    }

    parse_os_output(&output)
}

pub fn parse_os_output(output: &[u8]) -> AppResult<ServerOsProfile> {
    let text = String::from_utf8_lossy(output);
    let mut id: Option<String> = None;
    let mut pretty: Option<String> = None;
    let mut id_like: Option<String> = None;

    for line in text.lines() {
        let line = line.trim();
        if let Some((key, value)) = line.split_once('=') {
            let value = trim_quotes(value.trim());
            match key {
                "ID" => id = Some(value.to_string()),
                "PRETTY_NAME" => pretty = Some(value.to_string()),
                "ID_LIKE" => id_like = Some(value.to_string()),
                _ => {}
            }
        } else if !line.is_empty() && id.is_none() {
            id = Some(line.to_string());
        }
    }

    let raw_id = id.unwrap_or_else(|| "unknown".to_string());
    let os_id = normalize_os_id(&raw_id, id_like.as_deref());

    Ok(ServerOsProfile {
        os_id,
        os_name: pretty,
    })
}

fn trim_quotes(value: &str) -> &str {
    value
        .strip_prefix('"')
        .and_then(|v| v.strip_suffix('"'))
        .unwrap_or(value)
}

fn normalize_os_id(id: &str, id_like: Option<&str>) -> String {
    let base = id
        .to_ascii_lowercase()
        .replace([' ', '_'], "-");

    match base.as_str() {
        "ubuntu" | "debian" | "centos" | "rhel" | "fedora" | "alpine" | "arch"
        | "opensuse-leap" | "opensuse-tumbleweed" | "opensuse" | "sles"
        | "rocky" | "almalinux" | "alma" | "amzn" | "amazon" | "openeuler"
        | "darwin" | "macos" | "freebsd" | "linux" => base,
        id if id.contains("ubuntu") => "ubuntu".to_string(),
        id if id.contains("debian") => "debian".to_string(),
        id if id.contains("centos") => "centos".to_string(),
        id if id.contains("fedora") => "fedora".to_string(),
        id if id.contains("alpine") => "alpine".to_string(),
        id if id.contains("arch") => "arch".to_string(),
        id if id.contains("opensuse") || id.contains("suse") => "opensuse".to_string(),
        id if id.contains("rocky") => "rocky".to_string(),
        id if id.contains("alma") => "alma".to_string(),
        id if id.contains("amzn") || id.contains("amazon") => "amazon".to_string(),
        id if id.contains("openeuler") || id.contains("euler") => "openeuler".to_string(),
        "redhat" | "red-hat-enterprise-linux" => "rhel".to_string(),
        _ => {
            if let Some(like) = id_like {
                let first = like.split_whitespace().next().unwrap_or("linux");
                return normalize_os_id(first, None);
            }
            if base == "linux" {
                "linux".to_string()
            } else if base.contains("darwin") {
                "macos".to_string()
            } else if base.contains("freebsd") {
                "freebsd".to_string()
            } else {
                "linux".to_string()
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::parse_os_output;

    #[test]
    fn parses_ubuntu_os_release() {
        let output = br#"ID=ubuntu
PRETTY_NAME="Ubuntu 22.04.3 LTS"
ID_LIKE=debian"#;
        let profile = parse_os_output(output).unwrap();
        assert_eq!(profile.os_id, "ubuntu");
        assert_eq!(profile.os_name.as_deref(), Some("Ubuntu 22.04.3 LTS"));
    }

    #[test]
    fn parses_uname_fallback() {
        let profile = parse_os_output(b"Linux").unwrap();
        assert_eq!(profile.os_id, "linux");
    }
}
