# SSH kubectl bind from Hosts list (UX)

Date: 2026-08-31  
Status: approved — implemented  

## Problem

K8s sidebar shows “Choose SSH host” + probe errors when a connected host lacks `kubectl`. That conflates Hosts and K8s, and feels broken for kubeconfig-first users. Binding SSH-as-kubectl is still valuable for jump hosts that already have `kubectl`.

## Goal

- Keep `ssh_kubectl` binding capability.
- Move entry to **Hosts** list: natural, opt-in, silent when not applicable.
- Remove the K8s-sidebar bind panel entirely.

## Non-goals

- Do not probe or show icon for disconnected bookmarks.
- Do not change AI `k8s_*` / toolBridge beyond using existing `clusterTarget`.
- Do not remove kubeconfig import flow.
- Do not auto-connect on icon click (user chose option A: connected-only).

## Approaches considered

1. **Hosts icon when connected + probe ok; remove K8s bind panel** (chosen).
2. Grey spinner while probing on host row — deferred (extra chrome).
3. Keep K8s panel + add Hosts shortcut — rejected (leaves bad UX).

## Design

### Detection

- Source of truth: open SSH tabs (`session.kind === "ssh"`).
- Match Hosts bookmark row via `server_id` / `savedServerKey(saved)`.
- For each open SSH session, call existing `k8sProbeSshKubectl(session_id)` (reuse/refine current probe cache in `ConnectionPanel`).
- Probe only while sessions exist; drop cache entries when tabs close.

### Hosts row UI

- When matched session has `probe.ok === true`, show a K8s helm/wheel icon in the row `actions` (beside edit/delete).
- `data-testid`: `k8s-host-add-cluster` (include session or server id if needed for uniqueness).
- Tooltip / aria: e.g. “Add to Kubernetes” + optional version from probe.
- If this `server_id` already has an `ssh_kubectl` cluster in store: clicking selects that cluster and switches to K8s view (no duplicate bind).
- Otherwise: `bindSshCluster({ display_name, session_id, server_id })` → success toast → `setSidebarView("k8s")` + `selectCluster(newId)`.
- Failure: toast with error; icon remains if still probe-ok.
- No icon when: disconnected, probing, or probe failed — **no error text on the Hosts row**.

### K8s sidebar

- Delete `k8s-bind-ssh-panel` (picker, probing copy, red “no kubectl” status, bind button).
- Cluster list unchanged for existing `ssh_kubectl` + kubeconfig entries; remove binding via existing row delete.

### Copy / i18n

- Add Hosts-facing strings (en + zh-CN): add-to-k8s title, already-bound hint if useful.
- Remove or stop using bind-panel-only strings from K8s sidebar (`bindSshPickHost`, `bindSshNoKubectl` in that UI). Keys may remain briefly if referenced elsewhere; prefer delete unused keys.

### Testing

- Unit: helper to resolve “session for saved connection” + “should show add icon” + “already bound → select vs bind”.
- Smoke: Hosts wiring includes add-cluster testid; K8s catalog leading bind panel absent (`bindSshPickHost` not in ConnectionPanel K8s leading).
- E2E (optional/light): mock probe ok → icon visible → click → K8s view selected / cluster present.

## Success criteria

- [x] No SSH bind UI in K8s sidebar.
- [x] Connected host with kubectl shows K8s icon on Hosts row; click adds/switches to K8s view.
- [x] Disconnected / no kubectl: no icon, no red bind error on Hosts or K8s list chrome.
- [x] AI can still use bound `ssh_kubectl` targets when selected.
- [x] Smoke (+ focused unit) pass.

## Risks

- Multiple SSH tabs for same `server_id`: use the tab that matches server key; if several, prefer active tab then first.
- Probe latency: icon appears after probe; acceptable under A (no spinner required in v1).
