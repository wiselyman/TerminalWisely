# AI Engineer panel — Cursor-like UI

Date: 2026-08-15  
Status: implemented (UI landed; smoke in app)  
Scope: frontend shell + `aiEngineerStore` session model. No sidecar / PolicyEngine changes.

## Problem

The AI Linux Engineer right panel does not match Cursor’s chat chrome: single
thread per host, settings buried behind a gear, a separate 5-icon tool rail, and
message chrome that feels like stacked cards rather than a chat timeline.

## Goal

Make the right panel feel like Cursor’s agent chat while keeping TerminalWisely
semantics: SSH-bound execution, approval/ask interrupts, existing model profiles.

## Non-goals

- `@` mentions / file attachments / Agent-vs-Ask mode pills
- Per-thread model selection (profiles stay global)
- Conversation branches / parallel agents / Todo or Canvas cards
- Changing CommandBroker, PolicyEngine, or `exec_command_capture` paths
- Rewriting Anthropic/provider stack (separate initiative)

## Decisions (approved)

| Topic | Choice |
|-------|--------|
| Multi-chat | Per SSH host: many threads under `server:{id}` (fallback `session:{tabId}`) |
| Composer | Model dropdown + “Manage models…” → existing settings; no `@` |
| Header | Collapse, New, History dropdown, Tools menu |
| Tool rail | Remove the 5-icon right rail; one edge button opens AI |
| Tools menu | Find · Host stats · Task Manager · Command navigator |
| Approach | Cursor shell + per-host multi-thread (not skin-only, not full Agent branches) |

---

## 1. Panel chrome & header

### Entry / exit

- Remove the workspace right tool rail (command / host stats / Find / task
  manager / AI).
- When the AI panel is closed, show a single edge affordance (AI icon) that
  opens the panel.
- Header **Collapse** hides the panel and restores the edge button.
- Panel width + drag-resize: keep current `AiEngineerPanel` behavior.

### Header layout

Left: current thread title (truncated; empty thread → localized “New chat”).

Right icon cluster (Cursor-like top-right):

1. **New chat** (`+`) — create empty thread in current host scope, switch to it  
2. **History** — dropdown of threads for this host (by `updatedAt`)  
3. **Tools** — dropdown (not four separate icons)  
4. **Collapse** — close panel  

Stop does **not** live in the header (composer only).  
Primary settings entry is the composer model dropdown (no mandatory header ⚙).

### Tools menu

Items: Find · Server resources · Task Manager · Command navigator.

- Activate the existing workspace panel for that tool in the **same right column**
  (swap view; do not resurrect a second rail).
- From a tool view, user returns to AI via the edge button or an explicit
  “Back to AI” control in that tool’s chrome if needed.
- With no active SSH tab: items disabled; reuse `toolNeedTab` (or equivalent).

### Out of scope for header

- Left bookmark/SSH sidebar unchanged  
- No `@`  

---

## 2. Per-host multi-thread model

### Scope key

Unchanged identity: `server:{serverId}` when present, else `session:{sessionId}`.

### ChatThread

| Field | Notes |
|-------|--------|
| `id` | Stable id |
| `title` | From first user message (truncated); default “New chat” / “对话 1” |
| `createdAt` / `updatedAt` | For history sort |
| `messages[]` | Existing `ChatLine` kinds |

Run state (`busy`, active run, streaming) is bound to the **active thread**.
Switching thread or host scope **aborts** the in-flight run (same rule as today’s
host switch).

### Operations

| Action | Behavior |
|--------|----------|
| New | Empty thread in current scope; focus it |
| History select | Switch active thread |
| History delete | Confirm, then remove; if active deleted, select newest or create empty |
| Bind SSH tab/host | Load that scope; restore last active thread id; if none, create one |
| Send | API history from **current thread** only (keep ~last 16 user/assistant turns) |

### Persistence

- `localStorage`, keyed by scope → list of threads + `activeThreadId`.
- Persist message kinds: `user | assistant | tool | error` only (drop ask/approval
  on reload), same as today.
- Caps: e.g. 200 lines per thread; max N threads per scope (evict oldest by
  `updatedAt` when over cap). Exact N chosen at implement time (suggest 20).

### Migration

Legacy blob `{ [scope]: ChatLine[] }` → one thread per scope (title from first
user line or “对话 1”). Do not drop history.

---

## 3. Composer

### Layout

Bottom rounded card: multiline textarea + footer row.

- Placeholder: describe the problem / what to do on this host  
- Enter = send; Shift+Enter = newline; Cmd/Ctrl+Enter = send  

Footer left → right:

- **Model dropdown**: saved profiles (display name + model id); active highlighted  
  - Last item: **Manage models…** → existing `AiEngineerSettings` overlay  
- **Stop** (only when busy)  
- **Send** (primary); when busy, prefer disabled Send + clear Stop (avoid dual
  interrupt semantics on one button)

### Behavior

- Selecting a profile sets the global active profile (not per-thread).
- No profiles: dropdown shows empty state; Manage models… opens settings; send
  keeps current “not configured” error path.
- Interrupt-on-send hint may remain as secondary copy when busy; Stop is primary.

### Explicitly deferred

`@`, attachments, Agent/Ask pills, per-thread model.

---

## 4. Message & process chrome

### Principle

Presentation-only. Kinds and sidecar/approval semantics unchanged.

### Timeline

- User: plain text, light bubble / right bias OK  
- Assistant: existing `AiMarkdown` + stream cursor; idle busy → one-line
  “thinking…” not a full-panel spinner  
- Error: compact strip  

### Tools / exec

- Non-exec tools: one-line collapsible row (name + short detail)  
- `terminal_exec` / AI exec: collapsible step — title (command summary), status,
  expandable live `<pre>`, exit + elapsed when done  
- Default: expanded while running; collapsed after success (user can re-expand)  

### Ask / Approval

Stay **inline** in the timeline (not modals). Tighten spacing/typography toward
Cursor inline confirms; keep risk colors, dual-confirm, remember-read, approve/
reject behavior as implemented today.

### Deferred visuals

Cursor Todo progress cards, Canvas, branch UI.

---

## 5. Architecture sketch

```
Edge button ──► AiEngineerPanel (open)
                    │
                    ├─ Header: title | + | History | Tools | Collapse
                    ├─ Message timeline (active ChatThread)
                    └─ Composer: model ▾ | Stop | Send
                              └─ Manage models… → AiEngineerSettings

Tools menu ──► same right column swap (Find | HostStats | TaskMgr | CmdNav)
localStorage: scope → { activeThreadId, threads[] }
```

Primary touch points:

- `src/components/aiEngineer/AiEngineerPanel.tsx` — chrome, composer, timeline  
- `src/stores/aiEngineerStore.ts` — threads, migration, persistence  
- `src/App.tsx` / tool rail / `workspacePanelSwitch` — remove 5-icon rail; edge
  open; tools from menu  
- `src/App.css` — Cursor-like panel styles  
- i18n: new chat, history, tools menu, manage models, collapse  

## 6. Acceptance

- [ ] No 5-icon right rail; single edge button opens AI  
- [ ] Header: New, History, Tools, Collapse (top-right cluster)  
- [ ] Per host: create / switch / delete threads; history lists only that host  
- [ ] Legacy single-thread history migrates without loss  
- [ ] Model dropdown switches profile; Manage models opens existing settings  
- [ ] No `@`  
- [ ] Ask/approval/exec still work; SSH `terminal_exec` unchanged  
- [ ] Tools menu opens Find / stats / task / commands in same right column  
- [ ] `npm run build` (+ relevant UI smoke) passes  

## 7. Risks

- Tool swap in one column must not strand users without a path back to AI  
- Abort-on-thread-switch can surprise; mirror today’s abort-on-host-switch UX  
- localStorage size with many threads — enforce caps  

## Open implementation details (non-blocking)

- Exact max threads per scope (suggest 20)  
- Whether tool views show a explicit “Back to AI” chip vs only edge button  
- Precise CSS tokens (stay within existing dark app palette; avoid purple-glow
  clichés per product UI rules)
