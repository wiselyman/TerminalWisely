# Skills list UI Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Title-bar Skills dropdown listing user skills + reveal file/folder.

**Architecture:** Sidecar `GET /v1/skills` over existing Bearer auth; FE menu like Outline; Tauri `reveal_local_path` for Finder.

**Tech Stack:** FastAPI, React, Tauri opener plugin.

## Global Constraints

- No agent hardcoding / no per-app skill whitelist.
- User skills only in UI v1.
- Absolute paths from sidecar `data_dir()` (App Support when desktop-launched).

---

### Task 1: list + API

- [x] `list_user_skills_catalog` in loader
- [x] `GET /v1/skills` in `main.py`
- [x] pytest + api surface check

### Task 2: reveal command

- [x] `reveal_local_path` Tauri command + register + e2e mock

### Task 3: FE menu

- [x] `fetchUserSkills` in api.ts
- [x] Skills icon + dropdown in `AiEngineerPanel` head actions
- [x] i18n en/zh + smoke checklist
