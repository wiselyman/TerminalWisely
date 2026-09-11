# Architecture decision (Phase 0C)

## Decision

Build **Harness + Loop** on top of the existing Terminal:

```
FE Panel
  → Rust (ensure sidecar, ai_sidecar_request, ai_terminal_exec)
  → Python sidecar (LangGraph macro + AgentLoop + ModelGateway)
  → tool_call terminal_exec / web_* / ask_user
  → CommandBroker → PolicyEngine → ConnectedTerminalAdapter (exec capture)
```

## Stack

| Layer | Choice |
|-------|--------|
| Macro lifecycle | LangGraph + MemorySaver |
| Typed state | Pydantic v2 |
| LLM | ModelGateway → OpenAI-compatible HTTP (LiteLLM optional later) |
| Chat transport | Pull protocol + Rust HTTP proxy (no WKWebView SSE) |
| Remote exec | Existing `exec_command_capture` |
| DB | SQLite under app data `ai-engineer/` |

## Explicit non-goals for Phase 1–3

Ansible, MCP mutations, multi-model roles, network timed-rollback (Phase 8).

## Hard gates (Definition of Done for early slices)

1. Terminal → AI → real server command → AI continues  
2. Terminal → Web → Terminal verify (one task)  
3. ask_user → user answers → **same** task resumes  

## Security default

`SAFE`: R0 read-only auto; R2+ requires approval (Phase 4–5). Phase 1 PolicyEngine **blocks mutations**.
