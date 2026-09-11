# K8s multi-port forward (Lens-style tab)

**Date:** 2026-09-02  
**Status:** approved (design dialogue)  
**Choice:** Approach A — discover ports from resource YAML; per-port Forward with editable local port; custom-port fallback row

## Problem

The Pod/Service **端口转发** detail tab is a single local→remote form (defaults `8080→80`). Real Pods and Services often expose **multiple** ports. The backend already allows concurrent `k8s_port_forward_start` sessions, but the UI never surfaces the port list or one-click forward per port (Lens Connection section pattern).

## Goals

1. On the **端口转发** tab for Pod and Service, list **all discoverable forwardable ports** from the already-loaded resource YAML.
2. Each row: remote port (+ protocol / optional name), **editable local port**, **转发** or **停止** when an active session matches that remote port on this resource.
3. Keep a **自定义** row for ports not declared in the object.
4. Multiple sessions for the same Pod/Service may run at once (one per remote port, or custom extras).
5. No backend protocol change.

## Non-goals

- “Forward all ports” bulk action (deferred).
- Per-port Forward buttons on the Overview / Connection section (deferred; same discovery helper can be reused later).
- Changing global Network → Port Forwarding list UX beyond showing the new sessions as today.
- SSH jump-host vs local kubeconfig differences beyond existing `k8s_port_forward_start` behavior.
- Metrics / EndpointSlices / Labels UI (separate Lens gap work).

## Port discovery

Source: `detail.yaml` already fetched with the resource (no extra kubectl).

| Kind | Paths | Remote port used for `port-forward` |
|------|--------|--------------------------------------|
| Pod | `spec.containers[].ports[]` → `containerPort` | `containerPort` |
| Service | `spec.ports[]` → `port` | `port` (not `targetPort`) |

Display fields per entry:

- `remotePort` (number)
- `protocol` (default `TCP` if absent)
- `name` (optional string)
- For Service only (optional display): `targetPort` string/number if present — **not** used as forward target

Dedup key: `(remotePort, protocol)` (case-insensitive protocol). Stable sort by `remotePort` ascending, then protocol.

Empty list → show muted empty copy + custom row only.

Parse failures / non-YAML → treat as empty list (custom row still works); do not block the tab.

## Tab layout

Replace the single pair of inputs + one Start button with:

1. **Port table / list** (one row per discovered port)
   - Columns: Port | Protocol | Name (omit column or cell if empty) | Local port input | Action
   - Local default: equal to `remotePort`; if that local port is already used by an **active session for this resource** (same kind/ns/name), bump to next free suggestion (user can still edit)
   - Action:
     - No matching active PF for this remote → primary **转发**
     - Matching active PF (`resource_kind`/`namespace`/`name`/`remote_port`) → show `localhost:{local_port}` + **停止**
2. **自定义** row at bottom: remote (+ local) inputs + **开始** — same as today’s manual path
3. Existing filtered list of active sessions for this resource may fold into the rows above; avoid duplicating a second full list unless needed for sessions whose remote is not in the discovered set (those appear under custom / orphan session rows with stop only)

## Behavior

- **转发 / 开始** → existing `k8sPortForwardStart(clusterId, kind, ns, name, local, remote)` then `refreshPortForwards()`; toast on success/failure (current pattern).
- **停止** → `k8sPortForwardStop(id)` then refresh.
- Opening the tab does not auto-start anything.
- Quick action that opens the port-forward tab: unchanged; optionally pre-focus first undiscovered/unforwarded row later (not required for v1).

## Data & code touchpoints

- New pure helper: e.g. `src/lib/k8s/forwardablePorts.ts` (+ Vitest) — parse YAML string → `ForwardablePort[]`.
- UI: `K8sWorkbench.tsx` port-forward pane (and thin CSS if needed).
- i18n: `en`/`zh-CN` `k8s.json` — empty state, Forward/Stop labels if not already present, custom-row labels.
- E2E / smoke: assert multiple port rows when mock YAML has ≥2 ports; start from a row `data-testid` (e.g. `k8s-port-forward-row-{remote}`).
- Types: reuse `PortForwardInfo`; no change to Tauri commands.

## Tests

- Unit: Pod multi-container ports; Service multi-port; dedup; missing protocol → TCP; empty/malformed YAML → `[]`.
- Unit: local-port suggestion when remote already forwarded.
- E2E (mock): open PF tab → ≥2 rows → start one → stop.
- Regression: custom row still starts a forward.

## Acceptance

- [ ] Pod with ports 80 and 443 shows two rows; each can be forwarded independently.
- [ ] Service with 6379 and 26379 shows two rows (Lens-like).
- [ ] Active session on one remote does not block forwarding another remote.
- [ ] Custom remote still works when not in the manifest.
- [ ] No new Tauri/API surface; `./scripts/run-all-tests.sh` passes after implementation.
