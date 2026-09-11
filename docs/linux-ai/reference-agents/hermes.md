# Hermes Agent patterns (skills + curator)

Public tree: `~/Download/lab/agent-references/hermes-agent`

## What we adopt

- Skills as Markdown playbooks (guidance only)
- Usage tracking + archive of stale **user** skills
- Bundled skills never auto-archived
- Skills never grant permission

## TW binding

- Bundled: `agent-sidecar/skills/`
- User: `{data_dir}/skills/user/`
- Archive: `{data_dir}/skills/archive/`
- `agent-sidecar/app/skills/curator.py`, `loader.py`, `match.py`

## Rejected

- Second SSH terminal backend for AI
- Dangerous-command regex as Policy substitute
- Per-app hardcoding catalogs
