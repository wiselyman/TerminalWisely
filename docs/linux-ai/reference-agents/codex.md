# Codex — adopted public patterns

Sources (primary):
- https://developers.openai.com/codex/cli/reference.md
- https://github.com/openai/codex (agent-loop, prompt.md)
- https://developers.openai.com/codex/guides/agents-sdk

## Confirmed public behavior

1. **Agent loop**: model streams text + tool/function calls; harness executes tools; observations return to the model.
2. **Sandbox ≠ approval**: sandbox modes (`read-only`, `workspace-write`, `danger-full-access`) are OS containment; approval policies (`untrusted`, `on-request`, `never`) gate when the human must confirm.
3. **Permissions are harness-enforced**, not model-enforced.
4. **Web search** is a first-class capability (CLI `--search` / cached modes).
5. **Plans** (`update_plan`) are UI/progress tools — not authority.
6. **Interrupt / continuation**: MCP `codex` + `codex-reply` with `threadId` preserves the same run.

## Adopt for TerminalWisely

| Pattern | Mapping |
|---------|---------|
| Tool loop | Inner `AgentLoop` |
| Sandbox modes | SecurityMode OBSERVE / SAFE / … |
| Approval policy | PolicyEngine + ApprovalManager |
| Plan updates | UI events only |
| Thread continuity | LangGraph checkpoint + pull run_id |
