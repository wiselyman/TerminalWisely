# Claude Code — adopted public patterns

Sources (primary):
- https://code.claude.com/docs/en/permissions.md
- https://code.claude.com/docs/en/tools-reference.md
- https://code.claude.com/docs/en/agent-sdk/permissions.md

## Confirmed public behavior

1. **Permission rules** (`allow` / `ask` / `deny`) evaluated in harness order; deny wins.
2. **CLAUDE.md / settings** guide behavior but **cannot** grant permissions.
3. First-class tools include Bash, Read/Edit, **WebSearch**, **WebFetch**, AskUserQuestion.
4. **AskUser** is an interactive tool requiring user response — distinct from bash approval.
5. Permission modes (`default`, `acceptEdits`, `plan`, `bypassPermissions`) are product profiles.

## Inferred (not claimed as internals)

Internal scheduling / compaction details are not public; we do not invent them.

## Adopt for TerminalWisely

| Pattern | Mapping |
|---------|---------|
| allow/ask/deny | PolicyEngine R0–R4 |
| CLAUDE.md | Skills (guidance only) |
| WebSearch/WebFetch | research tools |
| AskUserQuestion | `ask_user` + LangGraph interrupt |
| Permissions ≠ prompt | Policy never delegated to LLM |
