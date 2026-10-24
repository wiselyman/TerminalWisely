# SDD ledger — plan: docs/superpowers/plans/2026-10-24-desktop-fullscreen-dock.md

Ruling: develop directly on `main` because the repository's user-provided AGENTS.md requires main-only development and push after tests; this overrides isolated-worktree defaults.

Task 1: the initial Playwright regression failed as expected: maximized Files ended 98px above the Desktop stage bottom (the in-flow Dock reservation). After implementation, the focused test exposed a test-path issue when opening Browser placed its window above Files; the test now clicks the existing Files Dock item to verify focus without introducing unrelated window overlap. The Desktop suite exposed an obsolete assertion requiring Terminal to stop above the Dock; updated it to the approved full-height behavior. Final focused test passes, including bottom-edge pointer reveal, unchanged app bounds, Dock click, focus reveal, minimize/restore/close state.

Task 1 complete: `node scripts/check-no-agent-hardcoding.mjs` passed. Final `./scripts/run-all-tests.sh` passed: 260 static checks, 160 Rust tests (4 ignored), 502 Sidecar tests (3 skipped), 101 Playwright tests, and 2 cross-arch targets. SSH/K8s live integration skipped because Docker/k3d are unavailable. `git diff --check` passed. Native Tauri smoke is blocked in this environment; browser regression exercises pointer and focus behavior.

Final review: self-review (repository instructions prohibit handing implementation to another Codex reviewer). Reviewed DesktopPanel/Dock state transitions, CSS stacking, pointer dismissal, focus retention, and minimize/close/restore regression coverage; no additional changes identified.
