# K8s Multi-Port Forward Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single local/remote port-forward form with a Lens-style list of discovered Pod/Service ports (per-row Forward/Stop) plus a custom-port fallback.

**Architecture:** Pure helpers parse kubectl YAML/JSON already in `detail.yaml` into `ForwardablePort[]` and suggest local ports. `K8sWorkbench` port-forward pane renders one row per port and keeps the custom row. Backend `k8s_port_forward_*` unchanged.

**Tech Stack:** TypeScript, React, Vitest, Playwright e2e mocks, i18n `k8s.json`.

## Global Constraints

- No new Tauri commands or port-forward protocol changes.
- No “forward all” bulk action.
- No Overview inline Forward in this plan.
- Git commits only when the user explicitly asks.
- Prefer zero new npm deps: accept JSON documents and common kubectl YAML shapes via a small scanner / `JSON.parse`.

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/k8s/forwardablePorts.ts` | Parse ports + local-port suggestion + active-session match |
| `src/lib/k8s/forwardablePorts.test.ts` | Unit tests |
| `src/components/k8s/K8sWorkbench.tsx` | Port-forward pane UI |
| `src/App.css` | Minimal list/table styles if needed |
| `src/i18n/locales/{en,zh-CN}/k8s.json` | Empty / Forward labels |
| `src/e2e/tauriCoreMock.ts` | Pod YAML with ≥2 ports |
| `e2e/k8s-ops.spec.ts` | Assert multi-row PF pane |
| `scripts/smoke-product-checklist.mjs` | Optional wiring check for helper / testids |
| `docs/TEST_MATRIX.md` | Note multiport PF if matrix has PF row |

---

### Task 1: Pure parse + local-port helpers

**Files:**
- Create: `src/lib/k8s/forwardablePorts.ts`
- Create: `src/lib/k8s/forwardablePorts.test.ts`

**Interfaces:**
- Produces:
  - `export type ForwardablePort = { remotePort: number; protocol: string; name?: string; targetPort?: string }`
  - `export function parseForwardablePorts(doc: string, kind: string): ForwardablePort[]`
  - `export function suggestLocalPort(remotePort: number, usedLocalPorts: Iterable<number>): number`
  - `export function findActiveForward(forwards: PortForwardInfo[], opts: { resourceKind: string; namespace: string; name: string; remotePort: number }): PortForwardInfo | undefined`

**Parse rules:**
1. Trim `doc`. If empty → `[]`.
2. If starts with `{` → `JSON.parse`; on failure → `[]`. Extract:
   - Pod: `spec.containers[].ports[]` → `containerPort`, `protocol` (default TCP), `name`
   - Service / svc: `spec.ports[]` → `port`, `protocol`, `name`, optional `targetPort` as string
3. Else treat as YAML: scan list items under ports / containerPort using indentation-aware blocks (see implementation). Same field semantics.
4. Dedup `(remotePort, protocol.toUpperCase())`; sort by remotePort then protocol.

**suggestLocalPort:** start at `remotePort`; while in `usedLocalPorts` set, increment by 1 (cap at 65535; if exhausted return remotePort).

- [ ] **Step 1: Write failing tests** in `forwardablePorts.test.ts` covering Pod multi-port JSON, Service multi-port JSON, YAML containerPort, dedup, empty/malformed, suggestLocalPort collision, findActiveForward.

- [ ] **Step 2: Run** `npm test -- --run src/lib/k8s/forwardablePorts.test.ts` → expect FAIL (module missing).

- [ ] **Step 3: Implement** `forwardablePorts.ts`.

- [ ] **Step 4: Re-run tests** → PASS.

---

### Task 2: Port-forward pane UI + i18n

**Files:**
- Modify: `src/components/k8s/K8sWorkbench.tsx` (port-forward pane ~2227–2293 and `startPortForward` / `pfLocal`/`pfRemote` state)
- Modify: `src/i18n/locales/en/k8s.json`, `src/i18n/locales/zh-CN/k8s.json`
- Modify: `src/App.css` if needed

**Interfaces:**
- Consumes: `parseForwardablePorts`, `suggestLocalPort`, `findActiveForward` from Task 1
- Uses: `detail.yaml`, `selectedResource`, `clusterPortForwards`, `k8sPortForwardStart/Stop`

**UI:**
1. `ports = parseForwardablePorts(detail?.yaml ?? "", selectedResource.kind)` when pane open / detail changes.
2. Per-row local port state: `Record<string, string>` keyed by `${remotePort}/${protocol}` (and `"custom"`).
3. Row `data-testid={`k8s-port-forward-row-${remotePort}`}`; forward button `k8s-port-forward-start-${remotePort}`; stop `k8s-port-forward-stop-${remotePort}`.
4. Custom row keeps `k8s-port-forward-local`, `k8s-port-forward-remote`, `k8s-port-forward-start`.
5. i18n: `portForwardEmpty`, `portForwardAction` (“Forward” / “转发”), reuse stop/start strings where possible.

- [ ] **Step 1: Add i18n keys.**
- [ ] **Step 2: Replace pane JSX + wire start/stop per row.**
- [ ] **Step 3: Run** `npm test -- --run src/lib/k8s/forwardablePorts.test.ts` + smoke if checklist updated.

---

### Task 3: E2E mock + Playwright

**Files:**
- Modify: `src/e2e/tauriCoreMock.ts` — `k8s_get_resource` yaml includes two containerPorts (80, 443)
- Modify: `e2e/k8s-ops.spec.ts` — expect two rows; keep custom start visible

- [ ] **Step 1: Update mock YAML/JSON with ports 80 and 443.**
- [ ] **Step 2: Update e2e assertions** for `k8s-port-forward-row-80` and `k8s-port-forward-row-443` + custom `k8s-port-forward-start`.
- [ ] **Step 3: Run** `npm test -- --run src/lib/k8s/forwardablePorts.test.ts` and relevant e2e if environment allows; at minimum unit + smoke.

---

### Task 4: Smoke / TEST_MATRIX touch-up

**Files:**
- Modify: `scripts/smoke-product-checklist.mjs` if there is a k8s PF check
- Modify: `docs/TEST_MATRIX.md` PF row note (multiport list)

- [ ] **Step 1: Grep smoke for port-forward; extend if present.**
- [ ] **Step 2: Run** `npm run test:smoke`.

## Acceptance mapping

| Spec acceptance | Task |
|-----------------|------|
| Pod 80+443 two rows | 1–3 |
| Service 6379+26379 | 1 (unit) |
| Independent sessions | 2 |
| Custom remote | 2–3 |
| No new Tauri API | all |
| Full test script | after tasks |

## Spec coverage self-check

- Discovery Pod/Service, dedup, TCP default → Task 1  
- Per-row Forward/Stop, local edit, custom row → Task 2  
- E2E ≥2 rows → Task 3  
- Non-goals (bulk, overview) → not in plan  
