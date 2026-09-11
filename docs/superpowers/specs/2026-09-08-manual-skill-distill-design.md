# Design: Manual skill distill (user-triggered)

**Date:** 2026-09-08  
**Trigger:** User asks after a successful task (chat phrase or UI shortcut), not auto-on-success.

## Flow

1. User: 「把这次做成 skill」 / assistant-reply toolbar icon (next to Copy on every completed assistant reply) sends the same instruction. Composer no longer hosts a text button.
2. Model drafts playbook from this turn’s evidence → calls `skill_save`.
3. Sidecar writes `~/.terminalwisely/ai-engineer/skills/user/<id>/SKILL.md`.
4. Later turns: existing tag match injects the handbook (guidance only).

## `skill_save` args

- `id`: slug `[a-z0-9-]{2,64}`
- `title`: heading
- `tags`: list used by matcher
- `body`: markdown steps (no permission claims)

## Rules

- User skills only (never overwrite bundled).
- Overwrite same `id` allowed (user re-save).
- Memory / Policy unchanged.
- Record usage `created` via curator on save.

## Non-goals

Auto-save every success; OS clipboard; editing UI for skills v1.
