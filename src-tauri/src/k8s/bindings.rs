use std::collections::HashMap;
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

use anyhow::{Context, Result};
use once_cell::sync::Lazy;
use uuid::Uuid;

use super::{K8sClusterKind, K8sClusterTarget, SshBindingInput};

static BINDINGS: Lazy<Mutex<Vec<K8sClusterTarget>>> = Lazy::new(|| {
    Mutex::new(load_bindings_file().unwrap_or_default())
});

fn bindings_path() -> Result<PathBuf> {
    let dir = dirs::data_local_dir()
        .or_else(dirs::home_dir)
        .context("data dir")?
        .join("TerminalWisely");
    fs::create_dir_all(&dir).ok();
    Ok(dir.join("k8s-ssh-bindings.json"))
}

fn load_bindings_file() -> Result<Vec<K8sClusterTarget>> {
    let path = bindings_path()?;
    if !path.is_file() {
        return Ok(vec![]);
    }
    let raw = fs::read_to_string(path)?;
    Ok(serde_json::from_str(&raw).unwrap_or_default())
}

fn save_bindings_file(bindings: &[K8sClusterTarget]) -> Result<()> {
    let path = bindings_path()?;
    let raw = serde_json::to_string_pretty(bindings)?;
    fs::write(path, raw)?;
    Ok(())
}

pub fn list_ssh_bindings() -> Vec<K8sClusterTarget> {
    BINDINGS.lock().unwrap().clone()
}

pub fn save_ssh_binding(input: SshBindingInput) -> Result<K8sClusterTarget> {
    let binding = K8sClusterTarget {
        id: format!("ssh:{}", Uuid::new_v4()),
        kind: K8sClusterKind::SshKubectl,
        display_name: input.display_name,
        context: None,
        kubeconfig_path: None,
        session_id: Some(input.session_id),
        server_id: input.server_id,
        namespace: input.namespace.unwrap_or_else(|| "default".into()),
    };
    let mut guard = BINDINGS.lock().unwrap();
    guard.push(binding.clone());
    save_bindings_file(&guard)?;
    Ok(binding)
}

pub fn delete_ssh_binding(id: &str) -> Result<()> {
    let mut guard = BINDINGS.lock().unwrap();
    guard.retain(|b| b.id != id);
    save_bindings_file(&guard)?;
    Ok(())
}

pub fn overview_from_json(kind: &str, value: &serde_json::Value) -> HashMap<String, String> {
    let mut map = HashMap::new();
    map.insert("kind".into(), kind.into());
    if let Some(meta) = value.get("metadata") {
        if let Some(ns) = meta.get("namespace").and_then(|v| v.as_str()) {
            map.insert("namespace".into(), ns.into());
        }
        if let Some(name) = meta.get("name").and_then(|v| v.as_str()) {
            map.insert("name".into(), name.into());
        }
        if let Some(uid) = meta.get("uid").and_then(|v| v.as_str()) {
            map.insert("uid".into(), uid.into());
        }
        if let Some(owners) = meta.get("ownerReferences").and_then(|v| v.as_array()) {
            let joined: Vec<String> = owners
                .iter()
                .filter_map(|o| {
                    let k = o.get("kind").and_then(|x| x.as_str())?;
                    let n = o.get("name").and_then(|x| x.as_str())?;
                    Some(format!("{k}/{n}"))
                })
                .collect();
            if !joined.is_empty() {
                map.insert("ownerRefs".into(), joined.join(", "));
            }
        }
    }
    if let Some(status) = value.get("status") {
        if let Some(phase) = status.get("phase").and_then(|v| v.as_str()) {
            map.insert("phase".into(), phase.into());
        }
        if let Some(conds) = status.get("conditions").and_then(|v| v.as_array()) {
            let joined: Vec<String> = conds
                .iter()
                .filter_map(|c| {
                    let t = c.get("type").and_then(|x| x.as_str())?;
                    let s = c.get("status").and_then(|x| x.as_str())?;
                    Some(format!("{t}={s}"))
                })
                .take(6)
                .collect();
            if !joined.is_empty() {
                map.insert("conditions".into(), joined.join(", "));
            }
        }
    }
    if kind.eq_ignore_ascii_case("CustomResourceDefinition") {
        if let Some(group) = value
            .get("spec")
            .and_then(|s| s.get("group"))
            .and_then(|g| g.as_str())
        {
            map.insert("group".into(), group.into());
        }
        if let Some(plural) = value
            .get("spec")
            .and_then(|s| s.get("names"))
            .and_then(|n| n.get("plural"))
            .and_then(|p| p.as_str())
        {
            map.insert("plural".into(), plural.into());
        }
    }
    map
}
