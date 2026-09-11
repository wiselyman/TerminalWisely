# SSH kubectl bind from Hosts — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Show K8s icon on connected Hosts rows when kubectl is detected; click adds/switches to K8s view; remove K8s sidebar SSH bind panel.

**Architecture:** Pure helpers for session match / show-icon / existing binding; ConnectionPanel probes open SSH tabs and renders icon; bind uses existing `bindSshCluster`.

**Tech Stack:** React, Vitest, existing `k8sProbeSshKubectl` / `bindSshCluster`.

## Global Constraints

- Option A: icon only when connected + probe.ok
- No Hosts-row error text for missing kubectl
- Delete K8s sidebar `k8s-bind-ssh-panel`

---

### Task 1: Helpers + unit tests

**Files:**
- Create `src/lib/k8s/sshHostBind.ts`
- Create `src/lib/k8s/sshHostBind.test.ts`

- [x] Helpers: `findSshTabForSaved`, `sshKubectlProbeOk`, `findSshKubectlClusterForServer`
- [x] Vitest pass

### Task 2: Wire ConnectionPanel

- [x] Remove bind panel from K8s EntityCatalog `leading`
- [x] Remove bindSessionId / canBind UI (keep probeBySession for open tabs)
- [x] Hosts `savedItem` actions: K8s icon when probe ok
- [x] Click: existing cluster → select + k8s view; else bind then select + k8s view
- [x] i18n keys; smoke checklist

### Task 3: Verify

- [x] `npm test -- --run src/lib/k8s/sshHostBind.test.ts`
- [x] smoke checklist pass for new needles
