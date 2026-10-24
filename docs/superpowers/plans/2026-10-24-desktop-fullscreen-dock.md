# Desktop Fullscreen Dock Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a maximized Desktop app cover the Dock area and reveal the Dock as an overlay when the pointer reaches the Desktop panel's bottom edge.

**Architecture:** `DesktopPanel` derives whether any open, non-minimized Desktop app is maximized from `desktopStore`, manages a short pointer-leave delay for Dock reveal, and renders a bottom-edge reveal target. `desktop.css` removes the Dock from normal flow only in that state, overlays it above the maximized app, and animates it in without changing the app surface bounds.

**Tech Stack:** React, Zustand, CSS, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-24-desktop-fullscreen-dock-design.md`

## Global Constraints

- Preserve current behavior outside Desktop maximized state.
- Preserve Dock app actions, labels, open/minimized indicators, and keyboard focus access.
- Avoid platform-specific native APIs; implement in the shared React/CSS Desktop shell.
- The Dock must not resize a maximized app when it appears.

## Review Focus

- Pointer moves from the bottom-edge trigger toward the animated Dock; the Dock must remain revealed long enough to enter it.
- A maximized floating window must reach the Desktop stage bottom without its surface being clipped or shortened.
- Keyboard focus into Dock buttons must reveal the visually hidden Dock and preserve normal tab activation.
- Minimized or closed apps must not keep the Dock in auto-hide mode.
- Restoring the maximized app must return the Dock to normal in-flow layout.

## 要保住的旧行为

- Clicking a Dock app button when its app is closed still launches that app.
- Clicking a Dock app button for an already open app still focuses it; clicking a minimized app still restores it.
- A non-maximized Desktop app remains bounded by the existing desktop surface and the Dock remains visible in its current position.
- Maximizing and restoring Desktop apps continues using the existing maximize control and `data-maximized` state.

## 架构

- `src/components/desktop/DesktopPanel.tsx`: derive maximized state from `desktopStore`, track reveal state and delayed dismissal, render the edge trigger beside Dock.
- `src/components/desktop/DesktopDock.tsx`: accept reveal state and pointer/focus callbacks; retain existing `toggleDockApp` behavior and app status rendering.
- `src/styles/desktop.css`: add maximized-stage layout, hidden/revealed dock overlay, reveal target, focus-visible behavior, and reduced-motion handling alongside existing Desktop Dock rules.
- `e2e/host-desktop.spec.ts`: assert maximized bounds, default hidden state, bottom-edge reveal, unchanged bounds on reveal, Dock app focus/click continuity, and restoration to normal layout.

## 设计

- User maximizes a Desktop app. The app fills the stage down to its bottom edge; Dock becomes visually hidden without reserving space.
- Moving the pointer to a narrow bottom-edge trigger reveals Dock floating above the app. A short dismissal delay lets the pointer move from the trigger onto Dock; entering Dock cancels dismissal.
- Keyboard focus within Dock reveals it. Returning the app to windowed mode restores the original visible Dock layout.
- Loading/error states are not introduced by this visual interaction; app content and failures remain owned by each Desktop app.

## Tasks

### Task 1: Auto-hide and reveal Dock over maximized Desktop apps

**Files:**
- Modify: `src/components/desktop/DesktopPanel.tsx`
- Modify: `src/components/desktop/DesktopDock.tsx`
- Modify: `src/styles/desktop.css`
- Test: `e2e/host-desktop.spec.ts`

**Interfaces:**
- Consumes: `useDesktopStore` app window state (`open`, `minimized`, `maximized`) and existing `DesktopDock` `toggleDockApp` action.
- Produces: `DesktopDock` reveal props (`visible`, `onPointerEnter`, `onPointerLeave`, `onFocus`) and stage state indicating an open, non-minimized maximized app.

- [x] Add Playwright coverage for full-height maximization, initially hidden Dock, bottom-edge reveal, unchanged app bounds, Dock click/focus behavior, restore, minimize, and close.
- [x] Run `npm run test:e2e -- --grep 'maximized Desktop app covers the Dock'` before implementation; it failed on the expected 98px gap between maximized app and stage bottom.
- [x] Implement maximized stage state in `DesktopPanel`, reveal/focus callbacks in `DesktopDock`, and overlay/transition/focus CSS in `desktop.css`; preserve existing Dock actions.
- [x] Run the focused Playwright test and `npm run test:e2e -- e2e/host-desktop.spec.ts`; confirm maximized and restored layouts plus existing Dock app actions pass.
- [x] Run `node scripts/check-no-agent-hardcoding.mjs` and `./scripts/run-all-tests.sh` after the final test updates: hardcoding gate passed; Playwright 101/101, Python 502 passed (3 skipped), Rust 160 passed (4 ignored), cross-arch Rust 2 targets passed, 260 static checks passed. SSH/K8s live integration was skipped because Docker/k3d are unavailable.
- [x] Inspect `git diff --check`; commit this task on `main`, then push `origin main` as required by repository instructions.
