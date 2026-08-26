# DeepSeek Harness — adopted patterns

Source studied: `/tmp/ref-repos/deepseek-harness` @ `b150a551` (2026-08).

## Adopted into TerminalWisely

| Pattern | Upstream | TW location |
|---------|----------|-------------|
| Append-only session + surface + deriveMessages | `packages/core/session/` | `agent-sidecar/app/session/log.py` |
| Tool pipeline pre/around/post | `packages/core/tools/` | `agent-sidecar/app/harness/pipeline.py` |
| Repeat-tool advisory guard | `packages/guard/repeat-tool-reminder/` | `agent-sidecar/app/harness/guards/repeat_tool.py` |
| Timeout around-hook | `packages/guard/timeout-policy/` | `agent-sidecar/app/harness/guards/timeout.py` |
| Compaction + tool-pairing | `packages/compaction/` | `agent-sidecar/app/session/compaction.py` |
| JSONL session persistence | `packages/session/session-persistence/` | `agent-sidecar/app/session/store.py` |
| Depth-1 investigator | `packages/subagent/` (idea only) | `agent-sidecar/app/subagent/investigator.py` |

## Explicitly not ported

- Cordis Context / Fiber / Loader / HMR
- Nested investigators beyond depth=1
- ACP / Codex / Claude Code subagent bridges
- Multi-agent shared-cwd graphs (single SSH constraint)

## Invariants we keep

- Model-visible history ≡ `SessionLog.derive_messages()`
- Guards never bypass PolicyEngine / PrivilegeLease
- Investigator host waits bridge onto parent run (no second SSH)
- External content remains untrusted DATA
