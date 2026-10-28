# Home AI Local Implementation Plan

> **For agentic workers:** Implement task-by-task with test-first steps. Each task should be committed independently after its checks pass.

**Goal:** Show an `AI Local` application in Home Desktop that opens the existing Home local chat inside a Desktop window, while keeping `AI Linux` exclusive to SSH desktops.

**Architecture:** Keep the shared Desktop app/window system. Add distinct `aiLocal` and `aiLinux` app IDs and select the visible app by `DesktopTarget`; route the Local AI window to the existing `LOCAL_CHAT_SESSION` panel through the current desktop embed host, without creating or rebinding a chat. Keep SSH AI binding and host snapshots unchanged.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Playwright.

**Spec:** User correction in the 2026-10-28 conversation.

## Global Constraints

- AI Local reuses Home's current local chat and does not start another conversation or SSH session.
- AI Linux remains available only for SSH targets.
- Existing Home chat open/collapsed state, transcript, host AI session isolation, and SSH Desktop behavior remain intact.
- Do not change Windows shell behavior in this task.

## Review Focus

- Local app routing must not open or bind the SSH AI Linux chat.
- Returning from Home Desktop must preserve the same local chat transcript and Home chat visibility preference.
- Switching between Home and SSH Desktop must never expose the wrong AI app or share its window state.
- Minimizing, restoring, and closing AI Local must use the shared Desktop window lifecycle.
- Local and SSH title, accessible name, and test IDs must remain unambiguous.

---

### Task 1: Target-aware AI Desktop app entries

**Files:**
- Modify: `src/components/desktop/desktopApps.ts`
- Modify: `src/components/desktop/DesktopDock.tsx`
- Modify: `src/components/desktop/DesktopIcons.tsx`
- Test: `src/components/desktop/desktopApps.test.ts`
- Test: `src/stores/desktopStore.test.ts`

**Interfaces:**
- Produces `getDesktopAppsForTarget(target: DesktopTarget | null)`, returning the shared app list with `aiLocal` for `{kind:"local"}` and `aiLinux` for SSH.
- Adds `aiLocal` to `DesktopAppId` and the per-target desktop snapshot.

- [x] **Step 1: Write failing tests** for visible app IDs by target and for Local/SSH launch guards and independent window state.
- [x] **Step 2: Run tests and confirm RED** because `aiLocal` and target-aware app selection are missing.
- [x] **Step 3: Implement target-aware app selection and store state** without changing SSH AI binding.
- [x] **Step 4: Run the focused Vitest files and confirm GREEN:** `desktopApps.test.ts`, `desktopStore.test.ts`, `hostWorkspaceMemory.test.ts` (15 tests); `npm run build`.
- [ ] **Step 5: Commit** `feat: distinguish local and ssh desktop ai apps`.

### Task 2: Embed the existing Home chat in the Local Desktop window

**Files:**
- Modify: `src/components/desktop/DesktopAiWindow.tsx`
- Modify: `src/components/aiEngineer/AiEngineerPanel.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/home/HomeWorkspace.tsx` only if the Desktop-mode layout contract requires it
- Test: `e2e/home-local-terminal-chat.spec.ts`

**Interfaces:**
- Consumes `aiLocal` and the current desktop AI host from Task 1.
- The Home `AiEngineerPanel` stays mounted for `LOCAL_CHAT_SESSION`; in Home Desktop it portals into the `AI Local` window only while that app is open and restored.

- [ ] **Step 1: Write a failing Playwright test** that opens Home Desktop, opens `AI Local`, verifies the Local window is visible and SSH `AI Linux` is absent, then closes it and confirms Home chat remains the same mounted conversation.
- [ ] **Step 2: Run the targeted E2E and confirm RED** because Home Desktop currently has no AI Local entry/window.
- [ ] **Step 3: Implement target-aware window hosting and visibility** while retaining the existing `LOCAL_CHAT_SESSION` component instance.
- [ ] **Step 4: Run the focused Playwright spec and confirm GREEN.**
- [ ] **Step 5: Commit** `feat: open Home chat as AI Local desktop app`.

### Task 3: Product contract and documentation

**Files:**
- Modify: `scripts/smoke-product-checklist.mjs`
- Modify: `README.md`
- Modify: `docs/TEST_MATRIX.md`

**Interfaces:**
- Records Home Desktop as Files, Processes, Browser, Terminal, AI Local, and MarkWisely; AI Linux remains SSH-only.

- [ ] **Step 1: Add a failing smoke contract** for Local AI visibility/name and SSH-only AI Linux.
- [ ] **Step 2: Run `npm run test:smoke` and confirm RED.**
- [ ] **Step 3: Update the product contract and documentation** to match the implemented app split.
- [ ] **Step 4: Run smoke, hardcoding ban, and `./scripts/run-all-tests.sh`; confirm GREEN.**
- [ ] **Step 5: Commit** `docs: describe Home AI Local desktop app`.
