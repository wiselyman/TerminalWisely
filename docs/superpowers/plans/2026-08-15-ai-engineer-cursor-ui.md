# AI Engineer Cursor-like UI — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Rebuild the AI Engineer right panel to Cursor-like chrome: per-host multi-thread chats, header actions, model dropdown composer, timeline styling; remove the 5-icon tool rail.

**Architecture:** Extend `aiEngineerStore` with `ChatThread[]` per scope + migration from v1 message maps. `AiEngineerPanel` owns header/composer/timeline UI. `App.tsx` replaces `WorkspaceToolRail` with a single edge open button; Tools menu calls `switchWorkspacePanel`.

**Tech Stack:** React 19, Zustand, existing i18n (`tools` / `shell`), existing workspace panel stores.

## Global Constraints

- No `@`, attachments, or Agent/Ask pills
- No sidecar / PolicyEngine changes
- Profiles remain global (not per-thread)
- Max 20 threads/scope; 200 persistable lines/thread
- Abort run on thread or host scope switch
- Ask/approval still inline; kinds unchanged

---

### Task 1: Multi-thread store + migration

**Files:**
- Modify: `src/stores/aiEngineerStore.ts`
- Test: manual via `npm run build` + console migration check optional

**Produces:**
- `ChatThread`, `createThread`, `switchThread`, `deleteThread`
- `threadsByScope` + `activeThreadId`; `messages` remains active-thread working copy
- Persistence key `tw.aiEngineer.chatByScope.v2` with v1→v2 migration

- [ ] Replace flat `messagesByScope` with scope bundles of threads; migrate v1 on load
- [ ] Wire bindContext / sendMessage / stop / event patches to active thread id
- [ ] Export thread CRUD used by panel header
- [ ] `npm run build` typechecks store consumers

---

### Task 2: Remove 5-icon rail; edge open button

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.css` (edge button styles)
- Keep: `AiEngineerTool.tsx` (reuse as edge button) or thin wrapper

- [ ] Remove `WorkspaceToolRail` children for Find/Task/Host/Cmd/AI
- [ ] When `!aiEngineerOpen`, show single edge AI button (disabled without ready tab)
- [ ] Tool panels remain mountable; opening them still closes AI via existing switch helper

---

### Task 3: Panel header (New / History / Tools / Collapse)

**Files:**
- Modify: `src/components/aiEngineer/AiEngineerPanel.tsx`
- Modify: `src/i18n/locales/en/tools.json`, `zh-CN/tools.json`
- Optionally: `scripts/generate-i18n-locales.mjs`

- [ ] Header left = thread title; right = + / history dropdown / tools dropdown / collapse
- [ ] Tools menu → `switchWorkspacePanel` for find/hostStats/taskManager/commandNav
- [ ] Remove header Stop and ⚙

---

### Task 4: Composer model dropdown + Stop/Send

**Files:**
- Modify: `src/components/aiEngineer/AiEngineerPanel.tsx`
- Modify: `src/App.css`
- Reuse: `AiEngineerSettings` via `setSettingsOpen(true)`

- [ ] Rounded composer card; model ▾ lists profiles + “Manage models…”
- [ ] Selecting profile → `saveSettings({ active_profile_id })`
- [ ] Stop when busy; Send disabled when busy (interrupt hint optional)

---

### Task 5: Timeline chrome (user bubble, collapsible exec)

**Files:**
- Modify: `src/components/aiEngineer/AiEngineerPanel.tsx` (`ToolExecCard`)
- Modify: `src/App.css`

- [ ] User bubble alignment; tighten ask/approval spacing
- [ ] Exec cards: expanded while running, collapsed after success (toggle)
- [ ] Non-exec tools: compact collapsible row

---

### Task 6: Verify

- [ ] `cargo check` not required (FE-only) unless rust touched
- [ ] `npm run build` passes
- [ ] Grep: no `WorkspaceToolRail` usage for the five tools; edge button present
- [ ] Update spec status to `approved / implemented`

---

## Spec coverage

| Spec section | Task |
|--------------|------|
| §1 chrome / rail / tools menu | 2, 3 |
| §2 multi-thread | 1 |
| §3 composer | 4 |
| §4 messages | 5 |
| Acceptance | 6 |
