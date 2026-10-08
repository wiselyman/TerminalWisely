//! Direct dial is the default. An SSH session id opts into the existing tunnel.

use super::catalog::DbConnection;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DialPlan {
    pub tunnel_session_id: Option<String>,
    pub host: String,
    pub port: u16,
    /// Certificate name. Always the database host, never the local forward address.
    pub tls_server_name: String,
}

pub fn dial_plan(connection: &DbConnection) -> DialPlan {
    let tunnel_session_id = connection
        .ssh_session_id
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    DialPlan {
        tunnel_session_id,
        host: connection.host.clone(),
        port: connection.port,
        tls_server_name: connection.host.clone(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn connection(ssh: Option<&str>) -> DbConnection {
        DbConnection {
            id: "c".into(),
            name: "n".into(),
            engine: "postgres".into(),
            host: "db.internal".into(),
            port: 5432,
            database: "app".into(),
            user: "app".into(),
            auth_database: String::new(),
            tls: "verify-full".into(),
            ssh_session_id: ssh.map(str::to_string),
            revision: 1,
            secret_id: "s".into(),
        }
    }

    #[test]
    fn direct_does_not_select_a_tunnel() {
        let plan = dial_plan(&connection(None));
        assert!(plan.tunnel_session_id.is_none());
        assert_eq!(plan.tls_server_name, "db.internal");
        assert_ne!(plan.tls_server_name, "127.0.0.1");
    }

    #[test]
    fn tunnel_keeps_the_original_tls_name() {
        let plan = dial_plan(&connection(Some("ssh-1")));
        assert_eq!(plan.tunnel_session_id.as_deref(), Some("ssh-1"));
        assert_eq!(plan.tls_server_name, "db.internal");
    }
}
