# Capability Policy Engine Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace regex-heavy `PolicyEngine` / network-guard matching with argv parsing + bundled/user YAML capability tables, keeping existing approve/deny UX and tests green.

**Architecture:** New `app/policy/` loads `agent-sidecar/policy/*.yaml` plus optional `{data_dir}/policy/overrides.yaml`. Leaves resolve to capability tags; risk matrix + deny floor produce `RiskLevel`. `is_network_dangerous` becomes tag-based (`net_mutate`/`sshd_mutate`).

**Tech Stack:** Python 3.12, PyYAML, existing pytest suite, pydantic models unchanged.

## Global Constraints

- Unknown binary (non flag-only probe) → R2 / require approval in SAFE (mode A).
- User overrides merge over bundled; missing override file is OK.
- Model never writes policy or lowers risk.
- Do not weaken R4 deny floor vs current catastrophic rules.
- Prefer YAML edits over new Python regex for tool additions.
- Commits only when the user explicitly asks (do not auto-commit).

---

### Task 1: Bundled policy YAML + loader

**Files:**
- Create: `agent-sidecar/policy/capabilities.yaml`
- Create: `agent-sidecar/policy/risk_matrix.yaml`
- Create: `agent-sidecar/policy/deny_floor.yaml`
- Create: `agent-sidecar/app/policy/__init__.py`
- Create: `agent-sidecar/app/policy/loader.py`
- Create: `agent-sidecar/app/paths.py` (add `policy_overrides_path()`)
- Modify: `agent-sidecar/requirements.txt` (add `pyyaml`)
- Test: `agent-sidecar/tests/test_policy_loader.py`

**Interfaces:**
- Produces: `load_policy() -> PolicyBundle` with `.capabilities`, `.matrix`, `.deny_floor`, merge overrides from `data_dir()/policy/overrides.yaml`

- [ ] **Step 1:** Add failing test that `load_policy()` returns `du` → `read` and matrix maps `read` → R0
- [ ] **Step 2:** Add YAML files + loader + PyYAML dep
- [ ] **Step 3:** Tests pass

### Task 2: Command leaf parser

**Files:**
- Create: `agent-sidecar/app/policy/parse.py`
- Test: `agent-sidecar/tests/test_policy_parse.py`

**Interfaces:**
- Produces: `iter_leaves(command: str) -> list[Leaf]` where `Leaf` has `argv: list[str]`, `binary: str`, raw string; peels `sudo`/`xargs`; splits on `;&&|||\n` outside quotes (reuse/adapt broker split)

- [ ] **Step 1:** Tests for sudo peel, pipeline, grep with `|` inside quotes stays one leaf argv
- [ ] **Step 2:** Implement parser
- [ ] **Step 3:** Tests pass

### Task 3: Capability resolver + risk matrix

**Files:**
- Create: `agent-sidecar/app/policy/resolve.py`
- Test: `agent-sidecar/tests/test_policy_resolve.py`

**Interfaces:**
- Produces: `resolve_leaf(leaf, bundle) -> set[str]`; `risk_for_caps(caps, bundle) -> RiskLevel`; flag rules for iptables list vs mutate

- [ ] **Step 1:** Tests — firewall probe leaves only `read`; `iptables -P` → `net_mutate`; unknown `./install.sh /x` → `unknown`
- [ ] **Step 2:** Implement resolver
- [ ] **Step 3:** Tests pass

### Task 4: Wire PolicyEngine + network_guard

**Files:**
- Modify: `agent-sidecar/app/broker/__init__.py` (classify via policy package; keep `decide` API)
- Modify: `agent-sidecar/app/harness/network_guard.py` (`is_network_dangerous` via resolve)
- Test: existing `tests/test_policy.py`, `tests/test_approval_cancel.py` network tests

- [ ] **Step 1:** Run full policy/network tests; fix YAML until green
- [ ] **Step 2:** Remove obsolete large regex tables once unused
- [ ] **Step 3:** Ensure `metadata.capabilities` / `network_guard` set correctly

### Task 5: Docs touch

**Files:**
- Modify: `docs/linux-ai/PROGRESS.md` (short note) if present
- Spec already at `docs/superpowers/specs/2026-08-09-capability-policy-engine-design.md`

- [ ] **Step 1:** Note capability policy engine in progress doc

## File map

| Path | Responsibility |
|------|----------------|
| `agent-sidecar/policy/*.yaml` | Bundled defaults |
| `app/policy/loader.py` | Load + merge overrides |
| `app/policy/parse.py` | Shell leaf / argv |
| `app/policy/resolve.py` | Caps + risk |
| `app/broker/__init__.py` | decide/classify façade |
| `app/harness/network_guard.py` | Rollback templates + tag-based danger |
