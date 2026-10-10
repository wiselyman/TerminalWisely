# App type & density polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify app type/spacing via CSS tokens; densify DB chrome; replace the analog time picker with a digital Navicat-style editor.

**Architecture:** Tokens live on `:root` / theme in `src/App.css`. Dense DB surfaces and the cell picker consume those tokens. Picker markup in `DateTimeCellPicker.tsx` drops the clock face; tests and e2e assert digital-only chrome. No Rust/sidecar/font-package changes.

**Tech Stack:** React, Vitest, Playwright, existing `App.css` theme variables.

**Spec:** [`docs/superpowers/specs/2026-10-10-app-type-density-design.md`](../specs/2026-10-10-app-type-density-design.md)

## Global Constraints

- Develop on `main` only; no feature branches; no Cursor commit trailers.
- Keep OS system fonts; do not add webfont packages.
- Picker commit formats unchanged: `HH:MM:SS`, `YYYY-MM-DD`, `YYYY-MM-DD HH:MM:SS`.
- Opening DB sidebar must not connect.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.
- Do not commit unless the user asks (plan steps may say commit; skip until asked).

---

## 要保住的旧行为

- Opening the database sidebar does not start a connection.
- Object browse, grid edit, filter/sort, Run SQL paths still work; Playwright `e2e/db-workbench.spec.ts` scenarios still pass aside from clock-face assertions updated in this plan.
- Date/time picker still portals above the grid; Escape / backdrop cancel; OK commits the same string formats.
- Light and dark themes both remain usable; color tokens unchanged.
- No NULL cell shortcut reintroduced.

## 架构

| Piece | File |
|---|---|
| Type/spacing tokens | `src/App.css` (`:root` / `[data-theme="dark"]`) |
| Dense DB chrome | `src/App.css` (`.db-object-tree`, `.db-object-list`, `.db-object-search`, grid toolbars, results) |
| Picker UI | `src/components/db/DateTimeCellPicker.tsx` + `.db-cell-picker-*` in `App.css` |
| Unit | `src/components/db/DateTimeCellPicker.test.ts` |
| Smoke | `scripts/smoke-product-checklist.mjs` |
| E2E | `e2e/db-workbench.spec.ts` |
| Matrix | `docs/TEST_MATRIX.md` |

Dependency direction: tokens → CSS consumers → React markup. No new modules.

## 设计

- User edits a time cell → digital hour/minute/second + steppers + preview + 取消/好; no analog face.
- Sidebar tree and schema list use 12px dense type and consistent row rhythm.
- Toolbars / picker use 13px UI type and `--tw-space-*` padding.
- Loading/success/failure copy and SQL status messages unchanged.

---

### Task 1: Failing tests for digital picker + type tokens

**Files:**
- Modify: `src/components/db/DateTimeCellPicker.test.ts`
- Modify: `scripts/smoke-product-checklist.mjs` (near other `App.css` checks)
- Modify: `e2e/db-workbench.spec.ts` (time picker assertions ~268–276)

- [ ] **Step 1: Write the failing unit test**

Replace the clock-face assertion with digital-only:

```ts
it("ships digital time fields and OK/Cancel without an analog clock", () => {
  expect(src).toContain("db-cell-picker-calendar");
  expect(src).toContain('data-testid="db-cell-picker-hour"');
  expect(src).toContain("db-cell-picker-ok");
  expect(src).toContain("db-cell-picker-cancel");
  expect(src).not.toContain("db-cell-picker-clock-face");
  expect(src).not.toContain("db-cell-picker-ampm");
  expect(src).not.toContain("db-cell-picker-hand");
});
```

Keep portal and workbench wiring tests.

- [ ] **Step 2: Add smoke check for tokens**

In `scripts/smoke-product-checklist.mjs`, after an existing `read("src/App.css")` block (or a small new block):

```js
{
  const css = read("src/App.css");
  if (
    css.includes("--tw-font-dense") &&
    css.includes("--tw-font-ui") &&
    css.includes("--tw-space-1")
  ) {
    pass("ui.type-density-tokens", "App.css defines dense/ui font and space tokens");
  } else {
    fail("ui.type-density-tokens", "missing --tw-font-dense / --tw-font-ui / --tw-space-1");
  }
}
```

- [ ] **Step 3: Update e2e picker expectations**

```ts
const picker = page.getByTestId("db-cell-input-time");
await expect(picker).toBeVisible();
await expect(page.getByTestId("db-cell-picker-hour")).toBeVisible();
await expect(page.getByTestId("db-cell-picker-clock-face")).toHaveCount(0);
const box = await picker.boundingBox();
expect(box && box.width).toBeGreaterThan(120);
```

Remove the assertion that `db-cell-picker-clock` must be visible if that wrapper is renamed; prefer asserting `db-cell-picker-hour` + outer `db-cell-picker`.

- [ ] **Step 4: Run unit test — expect FAIL**

Run: `npx vitest run src/components/db/DateTimeCellPicker.test.ts`
Expected: FAIL on missing digital-only constraints (source still has clock-face/ampm).

---

### Task 2: CSS tokens + dense DB chrome

**Files:**
- Modify: `src/App.css` (theme root ~lines 1–50; DB section ~14618+; picker ~15310+)

- [ ] **Step 1: Add tokens on `:root` / dark theme**

Inside `:root, [data-theme="dark"] { ... }` after `--tw-mono-font`:

```css
  --tw-font-dense: 12px;
  --tw-font-ui: 13px;
  --tw-font-title: 15px;
  --tw-lh-dense: 1.25;
  --tw-lh-ui: 1.35;
  --tw-space-1: 4px;
  --tw-space-2: 8px;
  --tw-space-3: 12px;
  --tw-space-4: 16px;
```

Light theme inherits (do not redefine unless needed).

- [ ] **Step 2: Apply dense tokens to DB chrome**

Examples (map existing hard-coded 12px/8px where present):

```css
.db-workbench-nav {
  padding: var(--tw-space-2);
  gap: var(--tw-space-2);
  font-size: var(--tw-font-dense);
  line-height: var(--tw-lh-dense);
}
.db-object-search {
  font-size: var(--tw-font-dense);
  line-height: var(--tw-lh-dense);
}
.db-object-tree {
  font-size: var(--tw-font-dense);
  line-height: var(--tw-lh-dense);
}
.db-object-list {
  font-size: var(--tw-font-dense);
  line-height: var(--tw-lh-dense);
}
.db-object-list th,
.db-object-list td {
  font-size: var(--tw-font-dense);
  line-height: var(--tw-lh-dense);
  padding: var(--tw-space-1) var(--tw-space-2);
}
.db-grid-chrome,
.db-grid-toolbar-top,
.db-grid-toolbar-bottom {
  font-size: var(--tw-font-ui);
  line-height: var(--tw-lh-ui);
}
```

Adjust only selectors that already style these surfaces; do not restyle unrelated panels in this task.

- [ ] **Step 3: Run smoke for tokens**

Run: `node scripts/smoke-product-checklist.mjs` (or the subset that includes the new check via `npm run test:smoke`)
Expected: `ui.type-density-tokens` PASS.

---

### Task 3: Digital DateTimeCellPicker

**Files:**
- Modify: `src/components/db/DateTimeCellPicker.tsx`
- Modify: `src/App.css` (`.db-cell-picker-*`)

- [ ] **Step 1: Remove analog face from JSX**

In the `showTime` block, keep only time fields + steppers. Remove `db-cell-picker-clock-face`, hands, and ampm. Wrap fields in:

```tsx
<div className="db-cell-picker-time" data-testid="db-cell-picker-time">
  <div className="db-cell-picker-time-fields">...</div>
</div>
```

Use `type="text"` (or keep number but hide native spinners in CSS) so OS spinner chrome does not show. Prefer `type="text"` with existing numeric clamping in `onChange`.

Shrink `useLayoutEffect` height for `kind === "time"` (e.g. ~160 instead of 260).

- [ ] **Step 2: Restyle picker with UI tokens**

```css
.db-cell-picker {
  font-size: var(--tw-font-ui);
  line-height: var(--tw-lh-ui);
  padding: var(--tw-space-3);
}
.db-cell-picker-time {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--tw-space-2);
  min-width: 160px;
  padding: var(--tw-space-2) 0;
}
.db-cell-picker-time-unit input {
  width: 40px;
  height: 28px;
  font-size: var(--tw-font-ui);
  font-variant-numeric: tabular-nums;
  /* hide native number spinners if type=number kept */
  -moz-appearance: textfield;
}
.db-cell-picker-time-unit input::-webkit-outer-spin-button,
.db-cell-picker-time-unit input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.db-cell-picker-stepper button {
  font-size: 10px;
  padding: 2px 4px;
  color: var(--tw-fg-muted);
}
.db-cell-picker-time-sep {
  font-size: var(--tw-font-ui);
  font-weight: 600;
  padding: 0 2px;
}
```

Delete unused `.db-cell-picker-clock-face`, hand, and ampm rules (or leave unused rules removed — prefer delete).

- [ ] **Step 3: Run unit + e2e path**

Run: `npx vitest run src/components/db/DateTimeCellPicker.test.ts`
Expected: PASS

Run: `npx playwright test e2e/db-workbench.spec.ts` (or full e2e via suite later)
Expected: time picker assertions PASS

---

### Task 4: TEST_MATRIX + full suite

**Files:**
- Modify: `docs/TEST_MATRIX.md` (Navicat / DB workbench row — note digital picker + type tokens)

- [ ] **Step 1: Update TEST_MATRIX**

Note: digital time picker (no analog face); smoke `ui.type-density-tokens`; dense DB chrome uses `--tw-font-dense` / `--tw-font-ui`.

- [ ] **Step 2: Full gate**

Run: `./scripts/run-all-tests.sh`
Expected: `All automated tests PASSED.`

- [ ] **Step 3: Commit only if user asks**

Do not commit unless explicitly requested.

---

## Spec coverage check

| Spec item | Task |
|---|---|
| Token table | Task 2 |
| Hybrid density on DB surfaces | Task 2 |
| Digital-only picker | Task 3 |
| Unit / smoke / e2e | Task 1 + 3 |
| TEST_MATRIX + full suite | Task 4 |
| No webfonts / no behavior change | Global Constraints |
