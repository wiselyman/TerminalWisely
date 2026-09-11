# K8s Workbench — Headlamp-style product spec

**Date:** 2026-08-31  
**Status:** active  
**Reference:** [Headlamp](https://headlamp.dev/) / [kubernetes-sigs/headlamp](https://github.com/kubernetes-sigs/headlamp)

**Stance:** Learn Headlamp’s **clear grouping, light defaults, collapsible advanced sections**. Do not compete with Lens feature density. Keep TerminalWisely differentiators: embedded cluster terminal, full Helm UI, AI assist, PolicyEngine mutations.

---

## 1. Information architecture

### Default-expanded sidebar groups

- **Overview** — single home (`cluster_overview`); merges former workloads overview stats
- **Workloads** — Pods, Deployments, StatefulSets, DaemonSets, ReplicaSets, Jobs, CronJobs

### Default-collapsed groups

- **Cluster** — Namespaces, Nodes
- **Network** — Services, Endpoints, EndpointSlices, Ingresses, IngressClasses, NetworkPolicies, Port Forwards
- **Storage** — PVCs, PVs, StorageClasses
- **Security** — ServiceAccounts, Roles, RoleBindings, ClusterRoles, ClusterRoleBindings
- **Configuration** — ConfigMaps, Secrets, HPAs, PDBs, quotas, webhooks, etc.
- **Gateway (beta)** — shown only when Gateway API CRDs exist in cluster
- **Helm** — Charts + Releases (full lifecycle retained)
- **Custom Resources** — CRD tree by API group

### Removed from sidebar (capability retained)

- `applications` — use Helm Releases / resource search
- `workloads_overview` — merged into Overview
- `events` — recent warnings on Overview only
- `replicationcontrollers` — legacy; reachable via kind mapping

Config lives in [`src/lib/k8s/navConfig.ts`](../../../src/lib/k8s/navConfig.ts).

---

## 2. Overview (Home)

First screen after selecting a cluster:

1. Health banner (nodes, warning events)
2. Stat cards (nodes, namespaces, deployments, services, pods)
3. Metrics bars (CPU / memory / pods when metrics-server available)
4. Pod phase bar
5. Recent warning events (click to navigate)
6. **Quick actions:** Terminal, Create from YAML, Port Forwards, Helm Releases

---

## 3. Layout & entry points

```
ConnectionPanel | Workbench
                | ├─ Left: collapsible Headlamp-style nav
                | ├─ Main: list or Overview
                | └─ Bottom: resizable detail (Overview | YAML | Logs | Shell)
                |     Session tabs: Terminal-* | Create YAML
```

**Create / Terminal entry points (no bottom dock bar):**

- Toolbar (resource lists): **Terminal** button + **Create ▼** dropdown
- Detail tab row: session tabs + **+** menu (only plus control)
- Overview quick-action cards

Terminal sessions stay mounted (`display: none`) when switching tabs.

---

## 4. TerminalWisely-only (not in Headlamp core)

- Embedded kubectl/helm cluster terminal (kubeconfig clusters)
- Pod Shell / node shell via existing SSH session
- Helm charts + releases UI
- AI send-to-chat from resource detail
- PolicyEngine-gated apply/delete/scale

---

## 5. Explicitly out of scope (P2+)

- Resource Map / graph view
- Runtime Headlamp plugin loading
- Applications marketplace view

---

## 6. Tests

| Area | Coverage |
|------|----------|
| Nav config | `src/lib/k8s/navConfig.test.ts` |
| Kind mapping | `src/lib/k8s/navigation.test.ts` |
| Smoke | `scripts/smoke-product-checklist.mjs` |
| E2E | `e2e/k8s-workbench.spec.ts`, `e2e/k8s-ops.spec.ts` |
