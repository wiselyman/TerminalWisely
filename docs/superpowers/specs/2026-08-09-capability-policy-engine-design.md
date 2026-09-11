# Capability Policy Engine Design

**Date:** 2026-08-09  
**Status:** Approved for implementation  
**Related:** AI Linux Engineer sidecar `PolicyEngine`, `network_guard`

## Problem

Risk classification today is a large set of Python regexes and binary allowlists. Mentions of tool names (e.g. `iptables` inside `grep -E '…iptables…'`) falsely escalate to R3 and trigger network timed-rollback wrappers. Adding tools means editing Python. The model must not be the security authority.

## Goals

1. **Correct risk** from *what the leaf command does*, not substring presence.
2. **Data-driven policy** — product defaults in YAML; optional user overrides.
3. **Thin hard floor** — catastrophic patterns stay code/YAML deny, never LLM.
4. **Unknown binaries are strict (mode A)** — not a pure flag-only probe → at least require approval (R2+).
5. **Network guard** keys off capability tags (`net_mutate`, `sshd_mutate`), not bare tool names.

## Non-goals (this iteration)

- Model-suggested risk (even as advisory).
- Learning overrides from approve/reject UI (optional later).
- Host-side seccomp/eBPF.
- Perfect shell AST (no full bash parser); quote-aware split + `shlex` argv is enough.

## Architecture

```
command string
  → split segments (; && || \n) and pipes (|) outside quotes
  → peel sudo / xargs per leaf
  → argv[] via shlex
  → resolve capabilities from bundled YAML ⊕ user overrides
  → map capabilities → RiskLevel via risk_matrix.yaml
  → apply deny_floor.yaml (R4 / hard deny)
  → PolicyEngine.decide(security_mode) unchanged (ALLOW / APPROVAL / DENY)
  → if net_mutate|sshd_mutate → timed rollback wrap on approval exec path
```

**Authority:** Harness only. Model proposes commands; never lowers risk.

## Policy files

### Bundled (product-maintained)

Path: `agent-sidecar/policy/` (shipped with sidecar; loaded relative to package or `Path(__file__)`).

| File | Role |
|------|------|
| `capabilities.yaml` | binary → default caps; optional `subcommands:` map |
| `risk_matrix.yaml` | capability → risk; combine rule = **max** rank among leaf caps |
| `deny_floor.yaml` | catastrophic argv/pattern rules → R4 DENY |

### User overrides (optional)

Path: `{TW_AI_DATA_DIR or ~/.terminalwisely/ai-engineer}/policy/overrides.yaml`

Merge: **user overrides win** on same binary/subcommand key. Missing file = bundled only.

### Who maintains

| Layer | Owner |
|-------|--------|
| Bundled YAML + parser + matrix | Product (PR + unit tests) |
| `overrides.yaml` | End user / operator (optional) |
| Model | Does not write policy |

## Capability vocabulary

Small fixed set (extend only with matrix update):

| Cap | Meaning (examples) |
|-----|-------------------|
| `read` | Inspect: `ls`, `cat`, `du`, `docker ps`, `systemctl is-active` |
| `write` | Create/overwrite files: redirects, `tee`, `sed -i`, `cp`/`mv` targets |
| `delete` | `rm`, truncate destructive |
| `proc_signal` | `kill`, `pkill` |
| `svc_mutate` | `systemctl start/stop/restart/…` |
| `pkg_mutate` | apt/dnf/pip install/remove/… |
| `net_mutate` | Firewall/route/link changes that can lock out SSH |
| `sshd_mutate` | Write sshd config or restart/reload/stop sshd |
| `priv` | Elevated context after sudo peel still tags inner; sudo itself is not a cap |
| `unknown` | Binary not in tables |

Compound leaf: union of caps. Pipeline/segment: **worst** risk across leaves.

## Risk matrix (default)

| Caps present | Risk |
|--------------|------|
| only `read` (and optional inert) | R0 |
| mild temp write (future; optional R1) | R1 |
| `write` / `svc_mutate` / `pkg_mutate` / `unknown` (non-probe) | R2 |
| `delete` / `proc_signal` / `net_mutate` / `sshd_mutate` / dangerous pkg | R3 |
| deny_floor match | R4 |

Exact rows live in `risk_matrix.yaml`. Unknown + flag-only probe (existing `_is_flag_only_probe` semantics) → treat as `read` / R0 so `obscuretool --version` still works; unknown with positional args → R2 + approval in SAFE.

## capabilities.yaml shape (illustrative)

```yaml
binaries:
  du:
    capabilities: [read]
  systemctl:
    default: [svc_mutate]   # unknown subcommand → mutate
    subcommands:
      status: [read]
      is-active: [read]
      show: [read]
      start: [svc_mutate]
      restart: [svc_mutate]
  iptables:
    default: [net_mutate]
    subcommands:
      # list forms detected by flags in resolver, not only subcommand token
  docker:
    default: [unknown]      # becomes R2 unless subcommand mapped
    subcommands:
      ps: [read]
      images: [read]
      system:                # needs nested or flag rules
        df: [read]
        info: [read]
  which:
    capabilities: [read]
  grep:
    capabilities: [read]
  dpkg:
    capabilities: [read]
```

Nested subcommands (`docker system df`) supported via `subcommands` tree or `argv[1:]` walk.

**Flag-aware rules** (still data): optional `flag_caps` on a binary, e.g. iptables `-L`/`-S` → `read`, `-A`/`-P` → `net_mutate`. Prefer YAML lists over Python regex sprawl; tiny helpers in code interpret flag lists.

## deny_floor.yaml

Keep current R4 intent: wipe `/`, `/usr` roots (not `/usr/local/...`), `mkfs`, `dd of=/dev/…`, fork bomb, `curl|sh`, write to raw disks. Implemented as structured patterns or argv predicates loaded from YAML.

## network_guard

`is_network_dangerous(command)` becomes: any leaf has `net_mutate` or `sshd_mutate` after capability resolve. Timed rollback compose path unchanged.

## PolicyEngine API

Public surface stays:

- `classify(command) -> RiskLevel`
- `decide(command, security_mode) -> TerminalPolicyDecision` (+ `metadata.network_guard`, `metadata.capabilities`)

Internals swap regex forests for: parse → resolve → matrix → floor.

Security modes (OBSERVE / SAFE / AUTONOMOUS) behavior unchanged.

## Migration

1. Port current allowlists/subcommand maps into bundled YAML.
2. Port network mutation rules into capability flags / `flag_caps`.
3. Keep existing pytest suite green; add capability-focused tests (firewall probe R0; `iptables -P` R3+guard).
4. Delete or shrink obsolete `_R0_*` / `_R2_PATTERNS` once parity reached.

## Testing

- Unit: argv peel, unknown strict, `grep …iptables…` not `net_mutate`.
- Policy parity: existing `tests/test_policy.py`, network guard tests.
- Load: bundled YAML always; override merge with temp `TW_AI_DATA_DIR`.

## Success criteria

- Firewall presence probe auto-allows (R0), no rollback wrap.
- `sudo du …` R0; `sudo systemctl restart …` approval.
- Adding a read-only tool = YAML entry + test, no broker regex edit.
- Unknown `./install.sh /opt/app` → approval (A).
