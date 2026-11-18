# Home Host Drag to Group Implementation Plan

> **For agentic workers:** Execute this plan task by task in the current session. Steps use checkbox syntax for tracking.

**Goal:** Allow a saved host card on Home to be dragged into a host group.

**Architecture:** Reuse `startEntityPointerReorder` and `useEntityLayoutStore.handleItemDrop`, which already implement pointer-based item and group drops for entity lists. `HomeHostDirectory` will expose its sections and cards as the drop targets and call a callback supplied by `App.tsx`; the app will update the existing persisted host layout.

**Tech Stack:** React, TypeScript, Zustand, Playwright.

**Spec:** User report and screenshot: saved hosts shown in Home groups cannot be dragged into a target group.

## Global Constraints

- Preserve the current Home host card click behavior: clicking a card opens its saved host.
- Preserve group order, host order, and the current saved host layout persistence.
- Use the existing pointer reorder flow so drag works in the app WebView.

## Review Focus

- Dragging a saved host from Ungrouped into an empty custom group assigns it to that group.
- Dragging a host card does not open a Desktop tab; an ordinary click still opens it.
- Dropping a host card over another card continues to support ordering through the existing entity drop behavior.
- The new assignment is reflected by group counts and card placement without reloading.

---

## 要保住的旧行为

- Clicking a Home host card still opens the corresponding SSH Desktop tab.
- Home shows every saved host exactly once, in the group and order stored by the host entity layout.
- Empty groups remain visible and can receive hosts.
- Local Desktop remains pinned first and is not treated as a draggable saved SSH host.

## 架构

| 职责 | 文件 |
|---|---|
| Drag detection and targets | `src/components/home/HomeHostDirectory.tsx`: add the pointer reorder root, group target identifiers, item identifiers, and card mouse-down behavior using `startEntityPointerReorder`. |
| Persisting group assignment | `src/App.tsx`: pass an item-drop callback to `HomeHostDirectory` that calls `useEntityLayoutStore.handleItemDrop("hosts", ...)`. |
| Regression coverage | `e2e/home-host-directory.spec.ts`: drag a fixture host card into an empty group, assert its group count/card placement, and retain the existing click-to-open test. `scripts/smoke-product-checklist.mjs`: check the static drag-to-store wiring. |

Dependencies: Home reads group ordering from `entityLayoutStore`; the new callback writes to the same store and its existing persistence path. The pointer helper resolves targets from `[data-entity-group-id]` and `[data-entity-item-id]` inside the Home list root.

## 设计

- User presses and drags a host card; once moved past the existing 4px threshold, a drag ghost follows the pointer and the target group receives the existing drop highlight.
- Releasing over a group header or empty group assigns the host to that group; the card moves and group counts update immediately.
- Releasing over another host card in the same group keeps the existing before/after ordering behavior.
- A click without a drag continues opening that host's Desktop tab. No new loading or error surface is needed because the layout update is local and synchronous.

## 任务

### Task 1: Add failing Home drag regression

- [x] In `e2e/home-host-directory.spec.ts`, drag `home-host-card-e2e-conn-1` from its current group onto the Target group header, then assert its card is inside that group and the group's count updates.
- [x] Run the focused Playwright test and confirm it fails because the Home card does not initiate entity pointer reorder and the Home group has no recognized drop target.

### Task 2: Wire Home cards to the persisted entity layout

- [x] In `HomeHostDirectory.tsx`, add a root ref, `data-entity-group-id` to each group header, `data-entity-item-id` to each card, and use `startEntityPointerReorder` from card mouse-down with the root as `listRoot`.
- [x] In `App.tsx`, provide `HomeHostDirectory` an `onItemDrop` callback backed by `handleItemDrop("hosts", hostEntityIds, dragId, target, ..., t("entityUngrouped"))`.
- [x] Run focused Home unit and Playwright tests; verify that drag assigns without triggering the host click path.

### Task 3: Full verification

- [x] Extend the smoke checklist to assert the Home drag targets and entity store callback remain wired.
- [x] Run `node scripts/check-no-agent-hardcoding.mjs` and `npm run test:smoke`.
- [x] Run `./scripts/run-all-tests.sh` and require all automated tests to pass.
- [x] Commit on `main` as `Yunfei Wang <wiselyman2008@gmail.com>` and push `origin main`.
