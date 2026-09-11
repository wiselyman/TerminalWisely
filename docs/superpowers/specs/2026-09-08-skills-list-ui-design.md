# Design: Skills list UI (Approach A)

**Date:** 2026-09-08  
**Status:** approved

## Goal

Let the user see how many **user** skills exist on this machine, open the list, and reveal a skill file or the skills folder in Finder/Explorer — without a full skill manager.

## Placement

AI Engineer panel title bar icon cluster (with Find / Outline / New / History): one **Skills** icon button.

## Interaction

1. Click Skills → dropdown (same pattern as Outline/History).
2. Header: `Skills · N`.
3. Rows: `title` + muted `id`. Click row → reveal that `SKILL.md` in the OS file manager.
4. Footer action: `Open skills folder` → reveal `{data_dir}/skills/user/`.
5. Empty: copy + still allow open folder.
6. Scope: **user skills only** (not bundled, not archive). No edit/delete/preview body in v1.

## Backend

- `GET /v1/skills` (Bearer): `{ count, root, skills: [{ id, title, path }] }`
- `root` = absolute `user_skills_root()` (respects `TW_AI_DATA_DIR`).
- Limit high enough for personal use (e.g. 200).

## Desktop

- Tauri command `reveal_local_path(path)` → `opener.reveal_item_in_dir`.

## Non-goals

Composer count badge only; skill editor; auto-migrate `~/.terminalwisely` ↔ Application Support.
