# App type & density polish (2026-10-10)

## Intent

The host UI (especially the database workbench and the date/time cell picker) reads as rough: inconsistent font sizes, cramped or uneven spacing, and a toy-like analog clock in the time picker. Fix this with a **token-driven type and spacing scale** for the whole app, applied first to dense data surfaces and dialogs; remove the analog clock in favor of a digital Navicat-style time editor.

## Decisions (approved)

| Topic | Choice |
|---|---|
| Scope | Whole-app token system (not DB-only) |
| Density | Hybrid: dense for tree / grid / terminal; slightly looser for popovers, forms, empty states |
| Time picker | Digital only — no analog clock face |
| Approach | CSS tokens on existing theme roots; keep OS system fonts (no new font packages) |

## Type & spacing tokens

Add to `:root` / `[data-theme="dark"]` and inherit under light theme:

| Token | Role | Value |
|---|---|---|
| `--tw-font-dense` | Object tree, data grid, schema lists, terminal chrome | `12px` |
| `--tw-font-ui` | Toolbars, buttons, forms, tabs, pickers | `13px` |
| `--tw-font-title` | Empty-state and dialog titles | `15px` |
| `--tw-font-mono` | Alias to existing `--tw-mono-font` for SQL / code | (unchanged stack) |
| `--tw-lh-dense` | Line-height for dense lists | `1.25` |
| `--tw-lh-ui` | Line-height for UI chrome | `1.35` |
| `--tw-space-1` … `--tw-space-4` | Padding / gaps | `4px` / `8px` / `12px` / `16px` |

Rules:

- Dense regions use `--tw-font-dense` + `--tw-lh-dense`.
- Popovers, pickers, settings forms, empty states use `--tw-font-ui` (+ larger padding from `--tw-space-*`).
- New UI must not invent one-off sizes like `0.68rem` / `9px` / `11px`; map to the nearest token.
- Light and dark themes share the same type/spacing tokens (colors stay as today).

## Time / date cell picker

- Remove the analog clock face, hands, and AM/PM watermark.
- Keep: hour / minute / second numeric fields with custom up/down steppers (not native `type=number` spinner chrome), preview field, Cancel / OK.
- Date and datetime keep the calendar; time section matches the digital-only layout.
- Visual language: `--tw-font-ui`, shared border radius, primary OK button aligned with existing toolbar primary actions.
- Behavior unchanged: commit value format, Escape / backdrop cancel, portal positioning via `anchorRect`.

## First delivery surfaces

1. Theme root token definitions in `App.css`.
2. Database workbench: connection/object tree, schema/table object lists, grid headers/cells, toolbars.
3. `DateTimeCellPicker` markup + `.db-cell-picker-*` styles.
4. Sidebar search field (“搜索对象”) type and row rhythm.

Later passes (same tokens, out of first merge if time-boxed): browser chrome, local FS, K8s, AI panel — replace scattered rem/px with tokens without redesigning those panels.

## Architecture

| Area | Files |
|---|---|
| Tokens | `src/App.css` (`:root` / theme blocks) |
| Picker UI | `src/components/db/DateTimeCellPicker.tsx` + picker CSS in `App.css` |
| DB chrome | `src/components/db/DbWorkbench.tsx` only if class hooks needed; prefer CSS selectors already present |
| Tests | `src/components/db/DateTimeCellPicker.test.ts`, smoke checklist if needed, `e2e/db-workbench.spec.ts` |
| Docs | this spec; implementation plan `docs/superpowers/plans/2026-10-10-app-type-density.md`; `docs/TEST_MATRIX.md` row touch-up |

No new dependencies. No Rust / sidecar changes.

## Preserved behavior

- Opening the DB sidebar does not connect.
- Object browse, grid edit, filter/sort, execute SQL paths unchanged.
- Picker commit formats: `HH:MM:SS`, `YYYY-MM-DD`, `YYYY-MM-DD HH:MM:SS`.
- Existing Playwright DB workbench scenarios still pass.
- No Cursor authorship on commits; develop on `main` only.

## Testing

1. Update `DateTimeCellPicker.test.ts`: assert **no** clock face / ampm; assert digital hour/minute/second + OK/Cancel + portal.
2. Static/smoke: `App.css` defines `--tw-font-dense`, `--tw-font-ui`, `--tw-space-1`.
3. E2E: time cell still opens picker; `db-cell-picker-hour` and OK visible; clock face absent.
4. Gate: `./scripts/run-all-tests.sh` green.

## Out of scope (this pass)

- Custom webfonts or brand display fonts.
- Full visual redesign of browser / AI / K8s (token adoption only when touching those files later).
- Changing SQL risk, connection, or catalog behavior.
- Navicat Designer / BI / sync features.
