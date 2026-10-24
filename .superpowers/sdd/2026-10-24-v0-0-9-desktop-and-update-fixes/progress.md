# SDD ledger — plan: docs/superpowers/plans/2026-10-24-v0-0-9-desktop-and-update-fixes.md

Ruling: develop directly on `main` because the user-provided repository instructions explicitly require it; this overrides the generic isolated-worktree recommendation.

Pre-flight: Task 1 and Task 2 both touch App.tsx but have separate effects (startup updater vs titlebar panels); execute sequentially and stage only intended hunks. Task 3 metadata plumbing does not alter Task 4's LocalFsPanel action implementations; Task 4 only changes Terminal surfaces and related tests. No other shared interfaces.

Task 1: complete — 3 updater store tests passed; update-dialog Playwright passed.

Ruling: the Chat panel remains mounted as an inert `aria-hidden` parked fiber when Desktop opens; this is intentional host chat continuity, so the one-click test must assert hidden accessibility state rather than DOM removal or CSS visibility. No product source change is justified by this result.

Task 2: browser E2E passed for one-click Chat/Desktop transitions in both directions; checked center hit target and `-webkit-app-region: no-drag`. Chat stays mounted inert/aria-hidden when Desktop is active. No root cause reproduced, so no product source change. Native script attempted but cannot run on this Mac because it hardcodes `/opt/cursor/artifacts` (permission denied). Mac mini native verification remains outstanding.

Task 3: metadata parser/UI implementation committed as `d136eb4`. Rust `fs_remote::tests` passed (4); focused Local FS Playwright suite passed (5), covering list and grid display. Legacy fallback has optional metadata.

Task 4: committed as `bd2246f`. Old path preview/menu and drag upload/overlay behaviors were confirmed by pre-change E2E, then removed from Terminal. The plain blank selection menu remains. Desktop menu assertions cover download, preview, send-to-chat, cross-server send, rename, delete, move, and upload entry. Focused Terminal/drag/Desktop E2E passed (5), with expanded Desktop action E2E passing.

Task 5: hardcoding gate passed (7 rules, 95 Python files). The first full run showed only the expected local-files screenshot change from the new metadata columns and variable-width clock mask. Fixed the clock mask to 140px in the E2E harness, updated only the dark/light local-files baselines, then verified that test without update mode. Final `./scripts/run-all-tests.sh`: 260 checks passed, zero failed, one environment-blocked live-integration check; Python 502 passed/3 skipped; Playwright 100/100 passed. SSH/K8s live integration was unavailable because Docker/k3d are not installed. `git diff --check` passed. The Mac mini native titlebar double-click report remains unverified; browser one-click regression passes, and no speculative product-code changes were made.
