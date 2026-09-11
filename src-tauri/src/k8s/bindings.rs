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
    let mut guard = BINDINGS.lock().unwrap();
    if let Some(server_id) = input
        .server_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        if let Some(existing) = guard.iter_mut().find(|b| {
            b.kind == K8sClusterKind::SshKubectl && b.server_id.as_deref() == Some(server_id)
        }) {
            existing.display_name = input.display_name;
            existing.session_id = Some(input.session_id);
            if let Some(ns) = input.namespace.filter(|s| !s.trim().is_empty()) {
                existing.namespace = ns;
            }
            if input
                .kubeconfig_path
                .as_deref()
                .map(str::trim)
                .is_some_and(|s| !s.is_empty())
            {
                existing.kubeconfig_path = input
                    .kubeconfig_path
                    .as_deref()
                    .map(str::trim)
                    .filter(|s| !s.is_empty())
                    .map(str::to_string);
                existing.kubectl_use_sudo = input.kubectl_use_sudo;
            }
            let updated = existing.clone();
            save_bindings_file(&guard)?;
            return Ok(updated);
        }
    }

    let binding = K8sClusterTarget {
        id: format!("ssh:{}", Uuid::new_v4()),
        kind: K8sClusterKind::SshKubectl,
        display_name: input.display_name,
        context: None,
        kubeconfig_path: input
            .kubeconfig_path
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(str::to_string),
        kubectl_use_sudo: input.kubectl_use_sudo,
        session_id: Some(input.session_id),
        server_id: input.server_id,
        namespace: input.namespace.unwrap_or_else(|| "default".into()),
    };
    guard.push(binding.clone());
    save_bindings_file(&guard)?;
    Ok(binding)
}

pub fn update_ssh_binding_session(id: &str, session_id: &str) -> Result<()> {
    let sid = session_id.trim();
    if sid.is_empty() {
        return Ok(());
    }
    let mut guard = BINDINGS.lock().unwrap();
    let Some(binding) = guard.iter_mut().find(|b| b.id == id) else {
        return Ok(());
    };
    binding.session_id = Some(sid.to_string());
    save_bindings_file(&guard)?;
    Ok(())
}

pub fn update_ssh_binding_access(
    id: &str,
    kubeconfig_path: Option<String>,
    kubectl_use_sudo: bool,
) -> Result<()> {
    let mut guard = BINDINGS.lock().unwrap();
    let Some(binding) = guard.iter_mut().find(|b| b.id == id) else {
        return Ok(());
    };
    binding.kubeconfig_path = kubeconfig_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    binding.kubectl_use_sudo = kubectl_use_sudo;
    save_bindings_file(&guard)?;
    Ok(())
}

/// Prefer access already resolved on disk/in-memory bindings over a stale
/// frontend target (which often still has empty kubeconfig_path).
pub fn ssh_binding_access(id: &str) -> Option<(Option<String>, bool)> {
    let guard = BINDINGS.lock().unwrap();
    let binding = guard.iter().find(|b| b.id == id)?;
    let path = binding
        .kubeconfig_path
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    if path.is_none() && !binding.kubectl_use_sudo {
        return None;
    }
    Some((path, binding.kubectl_use_sudo))
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
