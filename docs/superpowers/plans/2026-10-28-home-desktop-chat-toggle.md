# Home Desktop Chat Toggle and AI Local Icon Plan

> **For agentic workers:** Implement task-by-task with test-first steps. Each task should be committed independently after its checks pass.

**Goal:** Make the Home titlebar Chat control return from Home Desktop to the Home chat, and make the AI Local Dock icon easy to see.

**Architecture:** Keep the existing Home/SSH target routing. When Home's local Desktop is active, the titlebar Chat action closes that Desktop target and sets Home chat open; in other Home states it keeps the existing toggle behavior. Add a dedicated saturated background for the existing AI Local Dock glyph in the shared Desktop stylesheet.

**Tech Stack:** React, TypeScript, Zustand, CSS, Playwright.

**Spec:** User report and screenshot in the 2026-10-28 conversation.

## 要保住的旧行为

- In Home chat mode, the titlebar Chat button still toggles the chat without leaving Home.
- Home Desktop and Home chat share the same local terminal and chat state; returning to chat does not create SSH or clear the existing conversation.
- SSH Desktop Chat/Desktop controls continue to switch in one click, and the SSH AI window remains bound to its host.
- AI Local remains visible only in the Local Desktop Dock; its label and click behavior remain unchanged.

## 架构

- `src/App.tsx` owns the titlebar Chat click route. It will close `DesktopTarget.local` and open Home chat when both Home and local Desktop are active; otherwise it will retain `toggleHomeChat()`.
- `src/styles/desktop.css` owns `.host-desktop-glyph.is-aiLocal`, using the same icon tile sizing and a saturated theme-compatible gradient so the existing white chat glyph contrasts with the Dock.
- `e2e/home-local-terminal-chat.spec.ts` verifies both the toolbar round trip and the rendered icon contrast through browser computed style. No store/API changes are needed.

## 设计

- From Home Desktop, the user clicks the top-right Chat button. Desktop closes, the local Terminal returns beside the expanded Home chat, and the existing draft remains available.
- In Home Desktop, the AI Local Dock icon uses a distinct saturated tile with a clear white chat outline. Hover and click still use the existing Dock label/window behavior.
- These are synchronous UI transitions; success is shown by the visible Home chat and Desktop panel removal. Existing chat error states remain owned by the chat panel.

---

### Task 1: Return from Home Desktop to Home Chat

**Files:**
- Modify: `src/App.tsx`
- Test: `e2e/home-local-terminal-chat.spec.ts`

**Interfaces:**
- Consumes: `desktopMode`, `desktopTarget`, `useDesktopStore.close()`, and `useManagedEntityStore.setHomeChatOpen()`.
- Produces: Home titlebar Chat closes only the active Local Desktop target and opens Home chat; normal Home toggles and SSH Chat/Desktop routing stay intact.

- [x] **Step 1: Write a failing Playwright test** that opens Home Desktop, clicks the titlebar Chat control, and expects Desktop to disappear and Home chat to appear while the local Terminal remains visible.
- [x] **Step 2: Run the focused test and confirm RED** because the current handler only toggles `homeChatOpen`.
- [x] **Step 3: Implement the Home Local Desktop branch** in the existing titlebar Chat handler; keep the current behavior for all other modes.
- [x] **Step 4: Run the Home chat and SSH titlebar switch tests and confirm GREEN.**
- [x] **Step 5: Commit** `fix: return from Home desktop to chat`.

### Task 2: Improve the AI Local Dock Icon Contrast

**Files:**
- Modify: `src/styles/desktop.css`
- Test: `e2e/home-local-terminal-chat.spec.ts`

**Interfaces:**
- Consumes: existing `.host-desktop-glyph` and `is-aiLocal` class emitted by `DesktopDock`.
- Produces: the AI Local icon tile has a non-transparent saturated background, while other app tile styling is unchanged.

- [ ] **Step 1: Write a failing Playwright test** that opens Home Desktop and checks the AI Local Dock glyph has a visible background image/color rather than a transparent tile.
- [ ] **Step 2: Run the focused test and confirm RED** because `.is-aiLocal` currently has no tile background rule.
- [ ] **Step 3: Add a dedicated AI Local gradient** in `desktop.css`, using sufficient contrast for the existing white chat glyph.
- [ ] **Step 4: Run the focused Home Desktop test and confirm GREEN.**
- [ ] **Step 5: Commit** `fix: improve AI Local dock icon contrast`.
