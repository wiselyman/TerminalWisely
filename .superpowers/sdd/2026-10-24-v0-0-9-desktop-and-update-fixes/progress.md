# SDD ledger — plan: docs/superpowers/plans/2026-10-24-v0-0-9-desktop-and-update-fixes.md

Ruling: develop directly on `main` because the user-provided repository instructions explicitly require it; this overrides the generic isolated-worktree recommendation.

Pre-flight: Task 1 and Task 2 both touch App.tsx but have separate effects (startup updater vs titlebar panels); execute sequentially and stage only intended hunks. Task 3 metadata plumbing does not alter Task 4's LocalFsPanel action implementations; Task 4 only changes Terminal surfaces and related tests. No other shared interfaces.

Task 1: complete — 3 updater store tests passed; update-dialog Playwright passed.

Ruling: the Chat panel remains mounted as an inert `aria-hidden` parked fiber when Desktop opens; this is intentional host chat continuity, so the one-click test must assert hidden accessibility state rather than DOM removal or CSS visibility. No product source change is justified by this result.

Task 2: browser E2E passed for one-click Chat/Desktop transitions in both directions; checked center hit target and `-webkit-app-region: no-drag`. Chat stays mounted inert/aria-hidden when Desktop is active. No root cause reproduced, so no product source change. Native script attempted but cannot run on this Mac because it hardcodes `/opt/cursor/artifacts` (permission denied). Mac mini native verification remains outstanding.

Task 3: metadata parser/UI implementation is complete locally. Rust `fs_remote::tests` passed (4); focused Local FS Playwright suite passed (5), covering list and grid display. Legacy fallback has optional metadata. Staging/commit follows after this ledger update.
