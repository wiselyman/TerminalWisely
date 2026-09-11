# Pod Overview Volumes Implementation Plan

> **For agentic workers:** Use executing-plans / inline TDD. Commits only when user asks (project prefers main).

**Goal:** Lens-style Pod Volumes on Overview from `detail.yaml`.

**Architecture:** Pure `parsePodVolumes` + Overview section in `K8sWorkbench`.

**Tech Stack:** TypeScript, React, Vitest, i18n.

## File map

| File | Role |
|------|------|
| `src/lib/k8s/podVolumes.ts` | Parse + group |
| `src/lib/k8s/podVolumes.test.ts` | Unit tests |
| `src/components/k8s/K8sWorkbench.tsx` | Overview UI |
| `src/App.css` | Disclosure styles |
| `src/i18n/locales/{en,zh-CN}/k8s.json` | Labels |
| `src/e2e/tauriCoreMock.ts` | Volumes in Pod yaml |
| `e2e/k8s-ops.spec.ts` | Assert volumes section |
| `scripts/smoke-product-checklist.mjs` | Wiring |
| `docs/TEST_MATRIX.md` | Row note |

### Task 1: parsePodVolumes + tests
### Task 2: Overview UI + i18n + CSS
### Task 3: E2E mock + smoke + matrix
