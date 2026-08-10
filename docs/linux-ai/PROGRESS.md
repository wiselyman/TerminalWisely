# PROGRESS — AI Linux Engineer

## Status legend

- DONE — tests + evidence attached
- IN_PROGRESS
- BLOCKED — failure documented

## Phase 0–10 — DONE

See prior sections historically; suite evidence below.

### Hard gates 1–3 — DONE
- `tests/test_e2e_hard_gates.py` (terminal + ask_user)
- `tests/test_gate2_web.py`

### Policy / Approval / Lease — DONE
- Mode-aware R0–R4 (`tests/test_policy.py`)
- **Capability policy engine (2026-08-09):** argv + `agent-sidecar/policy/*.yaml` + optional `{data_dir}/policy/overrides.yaml`; unknown binaries strict (approval). Spec: `docs/superpowers/specs/2026-08-09-capability-policy-engine-design.md`
- Approval interrupt (`tests/test_approval_cancel.py`)
- **Rust PrivilegeLease hard-gate**: `ai_register_privilege_lease` + exact command consume in `ai_terminal_exec` (`cargo test ai_engineer::leases`)
- FE registers lease before host exec

### Network timed rollback — DONE
- Approval wraps dangerous network cmds via `compose_network_safe_script` (snapshot → schedule → apply → verify → cancel)
- Lease binds to wrapped `exec_command`

### Production dual-approval — DONE
- `security_mode=production` → `dual_confirm` + type exact command (`confirm_text`)

### OpsPlan + conclusion — DONE
- Tool `submit_ops_plan` + envelope approval + fail-stop remaining steps
- `conclusion` / `UNKNOWN_OUTCOME` on cancel-during-mutation (`tests/test_ops_network_conclusion.py`)

### LangGraph macro — DONE
- `start_run_via_graph` wraps AgentLoop with MemorySaver (`thread_id=run_id`)

### STOP / cancel / audit / memory / skills — DONE
- Prior phase evidence + cancel API

## Suite evidence

```
cd agent-sidecar && PYTHONPATH=. python3.12 -m pytest tests/ -q
→ 30 passed, 1 skipped (live optional)

cd src-tauri && cargo test ai_engineer::leases
→ 1 passed

npx tsc --noEmit → ok
cargo check → ok
```

## Live E2E

Optional: `TW_AI_LIVE_E2E=1` + sidecar URL + API key → `tests/test_live_e2e_optional.py`  
Requires running sidecar + configured model; skipped in CI by default.
