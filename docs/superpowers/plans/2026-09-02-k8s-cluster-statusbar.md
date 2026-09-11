# K8s Cluster Status Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the sidebar is in K8s view, replace the bottom host-stats bar with a compact cluster HUD that follows the selected cluster’s `clusterSummary`.

**Architecture:** Pure helpers build chip models from `K8sClusterTarget` + `K8sClusterSummary`. A new `K8sClusterStatusBar` renders chips with the existing host-stats statusbar CSS. `App.tsx` swaps bars based on `sidebarView === "k8s"`. No new polling or Tauri APIs.

**Tech Stack:** React, Zustand (`k8sStore`), Vitest, existing `metricsFormat` + host-stats CSS tokens.

## Global Constraints

- Overview page (`K8sClusterSummaryView`) must not change layout or content.
- No duplicate `k8s_cluster_summary` fetch from the status bar.
- Right side keeps Transfers + Toasts.
- Height stays `--host-stats-statusbar-height` (28px).
- Git commits only when the user explicitly asks (do not commit in task steps unless requested).

## File map

| File | Responsibility |
|------|----------------|
| `src/lib/k8s/clusterStatusBar.ts` | Pure chip builders + tone helpers |
| `src/lib/k8s/clusterStatusBar.test.ts` | Unit tests for chips |
| `src/components/k8s/K8sClusterStatusBar.tsx` | Status bar UI |
| `src/App.tsx` | Mount K8s vs host bar by sidebar view |
| `src/App.css` | Minimal `.k8s-cluster-statusbar` alias if needed |
| `src/i18n/locales/{en,zh-CN}/k8s.json` | Aria / empty labels |
| `scripts/smoke-product-checklist.mjs` | Static wiring check |
| `e2e/k8s-ops.spec.ts` or `e2e/k8s-workbench.spec.ts` | Bar visible in K8s view |

---

### Task 1: Pure chip model + unit tests

**Files:**
- Create: `src/lib/k8s/clusterStatusBar.ts`
- Create: `src/lib/k8s/clusterStatusBar.test.ts`

**Interfaces:**
- Produces:
  - `export type K8sStatusBarTone = "" | "is-warn" | "is-critical" | "is-muted" | "is-host"`
  - `export type K8sStatusBarChip = { id: string; label: string; title?: string; tone: K8sStatusBarTone; loading?: boolean }`
  - `export function buildK8sStatusBarChips(input: { clusterName: string | null; summary: K8sClusterSummary | null; loading: boolean }): K8sStatusBarChip[]`

**Logic for `buildK8sStatusBarChips`:**
1. If `!clusterName`: return one muted chip `{ id: "empty", label: "" }` (UI fills i18n empty text) — or return `[]` and let UI show empty state. Prefer returning `[{ id: "empty", label: "—", tone: "is-muted" }]` and let UI override label via i18n key when `id === "empty"`.
2. Always first chip: `{ id: "name", label: clusterName, tone: "is-host" }`.
3. If `loading && !summary`: append chips for nodes/pods/cpu/mem/warnings each with `loading: true` and `label: "…"`.
4. If `summary`:
   - version chip if `summary.version` truthy
   - nodes: `${ready}/${total}`; tone `is-warn` if `total > 0 && ready < total`
   - pods: if `pod_capacity > 0` then `${total_pods}/${pod_capacity}` else `${total_pods}`
   - cpu: compute ratio via `parseCpuToMilli` + `usageRatio` on metrics; if ratio non-null, label `${Math.round(ratio * 100)}%`
   - mem: same with `parseMemoryToKi`
   - warnings: `${recent_warnings.length}`; tone `is-warn` if length > 0

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { buildK8sStatusBarChips } from "./clusterStatusBar";
import type { K8sClusterSummary } from "./types";

const base: K8sClusterSummary = {
  version: "v1.30.0",
  node_count: 3,
  ready_node_count: 2,
  namespace_count: 4,
  deployment_count: 1,
  service_count: 1,
  total_pods: 10,
  pod_capacity: 110,
  pod_counts: { Running: 10 },
  recent_warnings: [
    {
      namespace: "default",
      name: "e",
      kind: "Pod",
      reason: "Failed",
      message: "x",
    },
  ],
  metrics: {
    cpu_usage: "500m",
    cpu_capacity: "2000m",
    memory_usage: "1Gi",
    memory_capacity: "4Gi",
  },
};

describe("buildK8sStatusBarChips", () => {
  it("returns empty placeholder without cluster", () => {
    const chips = buildK8sStatusBarChips({
      clusterName: null,
      summary: null,
      loading: false,
    });
    expect(chips).toEqual([
      expect.objectContaining({ id: "empty", tone: "is-muted" }),
    ]);
  });

  it("shows loading ellipsis when loading without summary", () => {
    const chips = buildK8sStatusBarChips({
      clusterName: "firefly",
      summary: null,
      loading: true,
    });
    expect(chips[0]).toMatchObject({ id: "name", label: "firefly" });
    expect(chips.some((c) => c.loading && c.label === "…")).toBe(true);
  });

  it("builds nodes pods cpu mem warnings from summary", () => {
    const chips = buildK8sStatusBarChips({
      clusterName: "firefly",
      summary: base,
      loading: false,
    });
    const byId = Object.fromEntries(chips.map((c) => [c.id, c]));
    expect(byId.version?.label).toContain("v1.30");
    expect(byId.nodes).toMatchObject({ label: "2/3", tone: "is-warn" });
    expect(byId.pods?.label).toBe("10/110");
    expect(byId.cpu?.label).toBe("25%");
    expect(byId.mem?.label).toBe("25%");
    expect(byId.warnings).toMatchObject({ label: "1", tone: "is-warn" });
  });

  it("omits cpu/mem when metrics missing", () => {
    const chips = buildK8sStatusBarChips({
      clusterName: "c",
      summary: { ...base, metrics: null, recent_warnings: [] },
      loading: false,
    });
    expect(chips.find((c) => c.id === "cpu")).toBeUndefined();
    expect(chips.find((c) => c.id === "mem")).toBeUndefined();
    expect(chips.find((c) => c.id === "warnings")?.tone).toBe("");
  });
});
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npm test -- --run src/lib/k8s/clusterStatusBar.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement `clusterStatusBar.ts`**

```ts
import {
  parseCpuToMilli,
  parseMemoryToKi,
  usageRatio,
} from "./metricsFormat";
import type { K8sClusterSummary } from "./types";

export type K8sStatusBarTone =
  | ""
  | "is-warn"
  | "is-critical"
  | "is-muted"
  | "is-host";

export type K8sStatusBarChip = {
  id: string;
  label: string;
  title?: string;
  tone: K8sStatusBarTone;
  loading?: boolean;
};

export function buildK8sStatusBarChips(input: {
  clusterName: string | null;
  summary: K8sClusterSummary | null;
  loading: boolean;
}): K8sStatusBarChip[] {
  const { clusterName, summary, loading } = input;
  if (!clusterName?.trim()) {
    return [{ id: "empty", label: "—", tone: "is-muted" }];
  }
  const chips: K8sStatusBarChip[] = [
    { id: "name", label: clusterName.trim(), tone: "is-host" },
  ];
  if (loading && !summary) {
    for (const id of ["nodes", "pods", "cpu", "mem", "warnings"] as const) {
      chips.push({ id, label: "…", tone: "is-muted", loading: true });
    }
    return chips;
  }
  if (!summary) {
    chips.push({ id: "nodes", label: "…", tone: "is-muted", loading: true });
    return chips;
  }
  if (summary.version?.trim()) {
    chips.push({
      id: "version",
      label: summary.version.trim(),
      tone: "",
      title: summary.version.trim(),
    });
  }
  const ready = summary.ready_node_count;
  const total = summary.node_count;
  chips.push({
    id: "nodes",
    label: `${ready}/${total}`,
    tone: total > 0 && ready < total ? "is-warn" : "",
  });
  chips.push({
    id: "pods",
    label:
      summary.pod_capacity > 0
        ? `${summary.total_pods}/${summary.pod_capacity}`
        : String(summary.total_pods),
    tone: "",
  });
  const m = summary.metrics;
  if (m?.cpu_usage && m.cpu_capacity) {
    const used = parseCpuToMilli(m.cpu_usage);
    const cap = parseCpuToMilli(m.cpu_capacity);
    if (used != null && cap != null) {
      const ratio = usageRatio(used, cap);
      if (ratio != null) {
        chips.push({
          id: "cpu",
          label: `${Math.round(ratio * 100)}%`,
          tone: ratio >= 0.9 ? "is-critical" : ratio >= 0.75 ? "is-warn" : "",
        });
      }
    }
  }
  if (m?.memory_usage && m.memory_capacity) {
    const used = parseMemoryToKi(m.memory_usage);
    const cap = parseMemoryToKi(m.memory_capacity);
    if (used != null && cap != null) {
      const ratio = usageRatio(used, cap);
      if (ratio != null) {
        chips.push({
          id: "mem",
          label: `${Math.round(ratio * 100)}%`,
          tone: ratio >= 0.9 ? "is-critical" : ratio >= 0.75 ? "is-warn" : "",
        });
      }
    }
  }
  const warnN = summary.recent_warnings.length;
  chips.push({
    id: "warnings",
    label: String(warnN),
    tone: warnN > 0 ? "is-warn" : "",
  });
  return chips;
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- --run src/lib/k8s/clusterStatusBar.test.ts`  
Expected: PASS

---

### Task 2: `K8sClusterStatusBar` component + i18n

**Files:**
- Create: `src/components/k8s/K8sClusterStatusBar.tsx`
- Modify: `src/i18n/locales/en/k8s.json`
- Modify: `src/i18n/locales/zh-CN/k8s.json`
- Modify: `src/App.css` (optional class alias)

**Interfaces:**
- Consumes: `buildK8sStatusBarChips`, `useK8sStore`, `StatusBarTransfers`, `StatusBarToasts`
- Produces: `<K8sClusterStatusBar />` with `data-testid="k8s-cluster-statusbar"`

- [ ] **Step 1: Add i18n keys**

en `k8s.json`:
```json
"statusBarAria": "Kubernetes cluster status",
"statusBarNoCluster": "No cluster selected",
"statusBarNodes": "Nodes ready/total",
"statusBarPods": "Pods",
"statusBarCpu": "Cluster CPU",
"statusBarMem": "Cluster memory",
"statusBarWarnings": "Warning events"
```

zh-CN:
```json
"statusBarAria": "Kubernetes 集群状态",
"statusBarNoCluster": "未选择集群",
"statusBarNodes": "就绪节点 / 总数",
"statusBarPods": "Pod",
"statusBarCpu": "集群 CPU",
"statusBarMem": "集群内存",
"statusBarWarnings": "Warning 事件"
```

- [ ] **Step 2: Implement component**

```tsx
import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  Boxes,
  Cpu,
  MemoryStick,
  Server,
  ShipWheel,
} from "lucide-react";
import { buildK8sStatusBarChips } from "../../lib/k8s/clusterStatusBar";
import { useK8sStore } from "../../stores/k8sStore";
import { StatusBarToasts } from "../StatusBarToasts";
import { StatusBarTransfers } from "../StatusBarTransfers";

const iconProps = { size: 14, strokeWidth: 1.5 } as const;

function chipIcon(id: string): ReactNode {
  switch (id) {
    case "name":
    case "empty":
      return <ShipWheel {...iconProps} />;
    case "version":
      return <Server {...iconProps} />;
    case "nodes":
      return <Server {...iconProps} />;
    case "pods":
      return <Boxes {...iconProps} />;
    case "cpu":
      return <Cpu {...iconProps} />;
    case "mem":
      return <MemoryStick {...iconProps} />;
    case "warnings":
      return <AlertTriangle {...iconProps} />;
    default:
      return <Server {...iconProps} />;
  }
}

export function K8sClusterStatusBar() {
  const { t } = useTranslation("k8s");
  const cluster = useK8sStore((s) => s.selectedCluster);
  const summary = useK8sStore((s) => s.clusterSummary);
  const loading = useK8sStore((s) => s.clusterSummaryLoading);

  const chips = useMemo(
    () =>
      buildK8sStatusBarChips({
        clusterName: cluster?.display_name ?? null,
        summary,
        loading,
      }),
    [cluster?.display_name, summary, loading],
  );

  return (
    <footer
      className="host-stats-statusbar k8s-cluster-statusbar"
      data-testid="k8s-cluster-statusbar"
      aria-label={t("statusBarAria")}
      aria-busy={loading && !summary}
    >
      <div className="host-stats-statusbar-start">
        {chips.map((chip) => {
          const label =
            chip.id === "empty" ? t("statusBarNoCluster") : chip.label;
          const title =
            chip.id === "nodes"
              ? t("statusBarNodes")
              : chip.id === "pods"
                ? t("statusBarPods")
                : chip.id === "cpu"
                  ? t("statusBarCpu")
                  : chip.id === "mem"
                    ? t("statusBarMem")
                    : chip.id === "warnings"
                      ? t("statusBarWarnings")
                      : chip.title;
          return (
            <span
              key={chip.id}
              className={`host-stats-statusbar-item ${chip.tone}`.trim()}
              title={title}
              data-testid={`k8s-statusbar-${chip.id}`}
            >
              <span className="host-stats-statusbar-icon" aria-hidden>
                {chipIcon(chip.id)}
              </span>
              <span className="host-stats-statusbar-value">{label}</span>
            </span>
          );
        })}
      </div>
      <div className="host-stats-statusbar-end">
        <StatusBarTransfers />
        <StatusBarToasts />
      </div>
    </footer>
  );
}
```

- [ ] **Step 3: CSS (share host bar height)**

```css
.k8s-cluster-statusbar {
  /* inherits .host-stats-statusbar; keep for testid targeting / future tweaks */
}
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`  
Expected: no errors from new files

---

### Task 3: Wire `App.tsx` + smoke + E2E

**Files:**
- Modify: `src/App.tsx` (status bar mount ~1137–1141)
- Modify: `scripts/smoke-product-checklist.mjs`
- Modify: `e2e/k8s-workbench.spec.ts` (or `e2e/k8s-ops.spec.ts`)

**Interfaces:**
- Consumes: `K8sClusterStatusBar`, `sidebarView` from `useSidebarViewStore`

- [ ] **Step 1: Swap bars in App**

Replace the bottom mount with:

```tsx
{sidebarView === "k8s" ? (
  <K8sClusterStatusBar />
) : activeTabId && !activeTabDisconnected ? (
  <HostStatsStatusBar sessionId={activeTabId} />
) : (
  <HostStatsStatusBar sessionId={null} />
)}
```

Import `K8sClusterStatusBar` from `./components/k8s/K8sClusterStatusBar`.

Keep `has-host-stats-statusbar` class on app-shell so height token still applies.

- [ ] **Step 2: Smoke checklist**

In `scripts/smoke-product-checklist.mjs`, after k8s workbench checks:

```js
const statusBar = read("src/components/k8s/K8sClusterStatusBar.tsx");
const appSrc = read("src/App.tsx");
if (
  statusBar.includes("data-testid=\"k8s-cluster-statusbar\"") &&
  statusBar.includes("buildK8sStatusBarChips") &&
  appSrc.includes("K8sClusterStatusBar") &&
  appSrc.includes('sidebarView === "k8s"')
) {
  pass("k8s.cluster-statusbar", "K8sClusterStatusBar wired for k8s sidebar");
} else {
  fail("k8s.cluster-statusbar", "missing K8s status bar wiring");
}
```

- [ ] **Step 3: E2E assertion**

In `e2e/k8s-workbench.spec.ts` (or a small test in `k8s-ops.spec.ts` after `openK8sWorkbench`):

```ts
test("k8s sidebar shows cluster status bar not host cpu bar", async ({ page }) => {
  await expect(page.getByTestId("k8s-cluster-statusbar")).toBeVisible();
  await expect(page.getByTestId("k8s-statusbar-name")).toBeVisible();
});
```

Ensure `gotoApp` + `openK8sWorkbench` already selects a cluster so name chip is not empty.

- [ ] **Step 4: Verify**

```bash
npm test -- --run src/lib/k8s/clusterStatusBar.test.ts
npm run test:smoke
npx tsc --noEmit
# optional: npm run test:e2e -- e2e/k8s-workbench.spec.ts
```

Expected: unit + smoke PASS; E2E PASS if run.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Replace host bar when `sidebarView === "k8s"` | Task 3 |
| Chips: name, version, nodes, pods, cpu, mem, warnings | Task 1–2 |
| Switch cluster clears stale via store + loading chips | Task 1 (loading) + existing store |
| Overview unchanged | No task touches `K8sClusterSummaryView` |
| No new polling | Status bar only reads store |
| Transfers/toasts | Task 2 |
| Tests | Task 1 unit, Task 3 smoke/e2e |
