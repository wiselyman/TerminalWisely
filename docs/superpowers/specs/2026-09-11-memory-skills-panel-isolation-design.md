"""Design: Memory & Skills panel cleanup + Hosts↔K8s isolation

Date: 2026-09-11

## Goals
1. Drop redundant absolute path headers and “Open AI data directory” actions.
2. Clear visual sections: Personal vs Host/Cluster.
3. Wider scrollable list layout (title ellipsis, secondary id/scope).
4. Strict isolation between Hosts (linux) and K8s modes for skills, **personal**
   memory, and host/cluster memory — personal prefs for Linux ops must not apply
   to K8s (and vice versa).
5. In K8s UI, label “主机” as “集群”.

## Data layout
- Skills: `skills/user/` (linux) vs `skills/user-k8s/` (k8s)
- Personal memory: `memory/user.json` (linux) vs `memory/user-k8s.json` (k8s)
- Target memory: `memory/hosts/*.json` (linux) vs `memory/clusters/*.json` (k8s)
- K8s runtime scope prefers `cluster_id`.

## API
- `GET /v1/skills?engineer_mode=linux|k8s`
- `GET /v1/memory/meta?engineer_mode=linux|k8s`
"""
