# Home AI Local Implementation Plan

> **For agentic workers:** Implement task-by-task with test-first steps. Each task should be committed independently after its checks pass.

**Goal:** Show an `AI Local` application in Home Desktop that opens the existing Home local chat inside a Desktop window, while keeping `AI Linux` exclusive to SSH desktops.

**Architecture:** Keep the shared Desktop app/window system. Add distinct `aiLocal` and `aiLinux` app IDs and select the visible app by `DesktopTarget`; route the Local AI window to the existing `LOCAL_CHAT_SESSION` panel through the current desktop embed host, without creating or rebinding a chat. Keep SSH AI binding and host snapshots unchanged.

**Tech Stack:** React, TypeScript, Zustand, Vitest, Playwright.

**Spec:** User correction in the 2026-10-28 conversation.

## 要保住的旧行为

- Home chat stays on `LOCAL_CHAT_SESSION`; opening AI Local preserves its draft and transcript and creates no SSH session.
- AI Linux appears only for SSH Desktop targets, and each SSH host keeps its existing AI chat binding and window state.
- Switching out of Home Desktop returns to the existing Home Terminal and respects the user's Home chat visibility preference.

## 架构

- `desktopApps.ts` selects `aiLocal` or `aiLinux` from the explicit `DesktopTarget`; `desktopStore.ts` owns separate per-target app state.
- `AiEngineerPanel.tsx` owns the existing chat instance and portals it into `DesktopAiWindow.tsx` only when Home's local AI app is open. `App.tsx` composes the Home and SSH desktop routes.
- `smoke-product-checklist.mjs`, `README.md`, and `docs/TEST_MATRIX.md` record the public contract. No Windows shell or backend behavior changes in this task.
- The screenshot baseline masks the dynamic Desktop clock using fixed bounds so locale-dependent date text does not make unrelated screenshots flaky.

## 设计

- Home user selects Desktop, opens the Dock's **AI Local** app, and sees the current local chat in a standard Desktop window. Minimize/restore/close follow shared window controls.
- While the window is loading, the existing chat panel stays mounted. Success shows the current Home chat; routing errors remain in the existing chat error area. Closing the window returns to Home without clearing chat or draft.

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
- [x] **Step 5: Commit** `feat: distinguish local and ssh desktop ai apps`.

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

- [x] **Step 1: Write a failing Playwright test** that opens Home Desktop, opens `AI Local`, verifies the Local window is visible and SSH `AI Linux` is absent, then closes it and confirms Home chat remains the same mounted conversation.
- [x] **Step 2: Run the targeted E2E and confirm RED** because Home Desktop currently has no AI Local entry/window.
- [x] **Step 3: Implement target-aware window hosting and visibility** while retaining the existing `LOCAL_CHAT_SESSION` component instance.
- [x] **Step 4: Run the focused Playwright test and confirm GREEN.**
- [x] **Step 5: Commit** `feat: open Home chat as AI Local desktop app`.

### Task 3: Product contract and documentation

**Files:**
- Modify: `scripts/smoke-product-checklist.mjs`
- Modify: `README.md`
- Modify: `docs/TEST_MATRIX.md`

**Interfaces:**
- Records Home Desktop as Files, Processes, Browser, Terminal, AI Local, and MarkWisely; AI Linux remains SSH-only.

- [x] **Step 1: Add a failing smoke contract** for Local AI visibility/name and SSH-only AI Linux.
- [x] **Step 2: Run `npm run test:smoke` and confirm RED.**
- [x] **Step 3: Update the product contract and documentation** to match the implemented app split.
- [x] **Step 4: Run smoke, hardcoding ban, and `./scripts/run-all-tests.sh`; confirm GREEN.**
- [ ] **Step 5: Commit** `docs: describe Home AI Local desktop app`.
