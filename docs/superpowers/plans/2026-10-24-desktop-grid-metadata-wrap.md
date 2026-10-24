# Desktop 图标视图元数据换行修复计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent long owner/group metadata from overflowing and overlapping neighboring cards in Desktop's icon view.

**Architecture:** Keep the existing metadata content and grid card layout. Constrain the metadata element to its card width and allow long unbroken values to wrap within that width.

**Tech Stack:** CSS, React, Playwright.

**Spec:** User screenshot and request in this turn.

## Global Constraints

- Preserve the existing permission, owner/group, size, and modified-time data in icon view.
- Preserve list view, grid navigation, selection, and context-menu behavior.
- Do not change remote file metadata or add dependencies.

## Review Focus

- Long owner/group names wrap inside a grid card instead of covering adjacent cards.
- Short metadata remains readable and centered.
- List view metadata columns and behavior remain unchanged.

---

## 要保住的旧行为

- Icon view still shows permissions, owner/group, size, and modified time for each remote entry.
- List view still shows its separate metadata columns unchanged.
- Grid cards still select on click and open folders/files on double-click.

## 架构

| File | Responsibility |
|------|----------------|
| `src/styles/desktop.css` | Constrain `.local-fs-grid-meta` and enable wrapping for long metadata tokens. |
| `e2e/local-fs.spec.ts` | Inject a long owner/group value into a real grid card and assert metadata stays within that card. |

No component or data API changes are required.

## 设计

- Keep the existing combined metadata text and separators.
- Wrap any long token inside the card's available width, using the same muted text treatment.
- Keep the icon, name, metadata order, and card actions unchanged.

## Tasks

### Task 1: Keep grid metadata within its card

**Files:**
- Modify: `src/styles/desktop.css`
- Test: `e2e/local-fs.spec.ts`

- [x] **Step 1: Write failing Playwright coverage** — In Icon view, replace one card's metadata text with long owner/group values and assert its text width stays within its card.
- [x] **Step 2: Run the focused test and confirm it fails** — `./scripts/e2e-playwright.sh e2e/local-fs.spec.ts --grep "long metadata"`; expected failure is metadata width exceeding its card.
- [x] **Step 3: Fix the grid metadata wrapping** — Set a shrinkable max width and `overflow-wrap: anywhere` on `.local-fs-grid-meta`.
- [x] **Step 4: Run focused Desktop file tests** — Verify metadata wrapping and existing list/grid file interactions.
- [ ] **Step 5: Commit** — Commit the plan, stylesheet, and E2E test as `fix: wrap desktop icon view metadata`.

## 完成验证

- [x] `node scripts/check-no-agent-hardcoding.mjs`
- [x] `./scripts/run-all-tests.sh`
- [x] Confirm the focused Desktop file E2E paths pass.
