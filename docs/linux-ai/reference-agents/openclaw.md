# OpenClaw patterns (memory)

Public docs: `~/Download/lab/agent-references/openclaw/docs/concepts/memory.md`

## What we adopt

- Layered durable notes: preferences / facts / daily-style notes
- Inject with budget; treat as **UNTRUSTED DATA**
- Memory never grants Policy permission

## TW binding

- `agent-sidecar/app/memory/host_store.py` — host-scoped JSON under data dir
- Tools `host_memory_get` / `host_memory_put`
- Prompt injection via `build_system_prompt(memory_scope=…)`

## Rejected

- Chat channel sprawl / multi-messenger gateway as product core
- SaaS memory required for core SSH loop
