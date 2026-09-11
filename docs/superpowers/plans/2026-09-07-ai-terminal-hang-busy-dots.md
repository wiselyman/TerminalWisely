# AI terminal hang + busy dots — Implementation Plan

> **For agentic workers:** implement task-by-task; run the listed verify after each.

**Spec:** `docs/superpowers/specs/2026-09-07-ai-terminal-hang-busy-dots-design.md`

## Files

| File | Role |
|------|------|
| `src-tauri/src/ssh/client.rs` | `exec_command_capture_with_limits` |
| `src-tauri/src/preview_sudo.rs` | sudo AI capture uses limits |
| `src-tauri/src/ai_engineer/terminal.rs` | wire limits; set `timed_out` |
| `src/lib/aiEngineer/api.ts` / `toolBridge.ts` | pass/show timed_out |
| `src/components/aiEngineer/AiBusyDots.tsx` | shared 2×3 morphing dots |
| `src/App.css` | grid + frame keyframes |
| `src/components/aiEngineer/AiEngineerPanel.tsx` | use `AiBusyDots` |

## Tasks

1. Rust capture with first-byte 45s + total default; unit-testable helpers if any.
2. Wire `ai_terminal_exec` + sudo capture; `timed_out` true on limit.
3. FE toolBridge timed_out error string.
4. `AiBusyDots` + CSS morphing grid; replace 7-dot markup.
5. Targeted tests + `SKIP_E2E=1 bash ./scripts/run-all-tests.sh` if time; else cargo/vitest/smoke.
