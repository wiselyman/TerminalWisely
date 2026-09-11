# K8s cluster status bar HUD

**Date:** 2026-09-02  
**Status:** approved (design dialogue)  
**Choice:** Mode A — replace host metrics when in K8s sidebar; overview page unchanged; compact HUD (scheme 1)

## Problem

While working in the K8s workbench, the bottom status bar still shows **SSH host** CPU/memory/network (or empty). Cluster overview metrics only live on the Overview page, so switching clusters does not update anything at the bottom of the app.

## Goals

1. When `sidebarView === "k8s"`, the bottom bar shows a **compact cluster HUD** derived from `clusterSummary`, keyed to the **selected cluster**.
2. Switching clusters clears stale values and shows loading/`…` until the new summary arrives.
3. When leaving K8s (Hosts / Home / SSH session focus as today), restore the existing **HostStatsStatusBar** behavior unchanged.
4. Keep the Overview page (`K8sClusterSummaryView`) as-is — full cards, health, charts, warnings.

## Non-goals

- Mixing host CPU/net and cluster metrics in one bar.
- Moving NS / Deployments / Services counts into the status bar.
- New polling: HUD only **subscribes** to `k8sStore`; refresh remains workbench-owned.
- Click-to-navigate from warning chip (optional later; v1 display-only).

## When which bar

| Condition | Status bar |
|-----------|------------|
| `sidebarView === "k8s"` and a cluster is selected | `K8sClusterStatusBar` |
| `sidebarView === "k8s"` and no cluster / jump-host gate blocking data | Same bar, muted placeholder |
| Otherwise (Hosts, Home, disconnected tab rules as today) | `HostStatsStatusBar` |

Right side always keeps **Transfers + Toasts** (same end slot as host bar).

## Layout (28px, left → right)

Reuse `host-stats-statusbar` / `host-stats-statusbar-item` visual language (icon + value, warn/critical tones).

1. **Cluster name** (`is-host`) — `selectedCluster.display_name`; tooltip: kind + id  
2. **Version** — `summary.version` if present; omit item if null  
3. **Nodes** — `ready_node_count/node_count`; warn tone if `ready < total`  
4. **Pods** — `total_pods`, or `total/pod_capacity` when capacity &gt; 0  
5. **CPU %** — only if metrics allow a ratio; else omit  
6. **Mem %** — same  
7. **Warnings** — `recent_warnings.length`; warn tone if &gt; 0  

Loading (`clusterSummaryLoading` and no summary yet): keep cluster name; other chips show `…`.  
Switch cluster: existing store clears `clusterSummary` → HUD must not flash previous cluster’s numbers.

## Data & wiring

- Source: `useK8sStore` — `selectedCluster`, `clusterSummary`, `clusterSummaryLoading`, optionally `jumpHostGate`.
- Mount: `App.tsx` chooses bar from `sidebarView` (and existing session/disconnect rules for the host bar path).
- No new Tauri commands; no duplicate `k8s_cluster_summary` from the status bar.

## Components

- New: `src/components/k8s/K8sClusterStatusBar.tsx` (+ small pure helpers / unit tests for % formatting reuse from `metricsFormat` where possible).
- CSS: thin additions under existing host-stats statusbar classes or `.k8s-cluster-statusbar` wrapper sharing the same height token `--host-stats-statusbar-height`.
- i18n: `k8s.json` labels / aria for the bar.

## Tests

- Unit: chip visibility rules (omit CPU when no metrics; warn nodes when not ready).
- Smoke / E2E: with K8s workbench open, status bar exposes a `data-testid` (e.g. `k8s-cluster-statusbar`) and updates when selected cluster changes (mock summary).
- Hosts view still shows host-stats bar (regression).

## Acceptance

- [ ] K8s sidebar + selected cluster → cluster HUD, not host CPU/net.
- [ ] Switch cluster → no stale prior metrics; then new summary.
- [ ] Hosts sidebar → host stats bar unchanged.
- [ ] Overview page layout unchanged.
- [ ] Transfers/toasts still visible on the right.
