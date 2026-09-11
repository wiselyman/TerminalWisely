# Host stats status bar

Date: 2026-08-15  
Status: approved  
Scope: frontend — replace Host Stats right panel with Cursor-like bottom status bar.

## Goal

Show condensed SSH host resource metrics in a persistent bottom status bar when a session tab is active. All primary metrics visible at once (no click-to-reveal for main values). Hover may show extended detail.

## Decisions

| Topic | Choice |
|-------|--------|
| Placement | App bottom status bar under workspace (Cursor-like) |
| Visibility | Only when an SSH tab is active (not Home) |
| Detail UX | Direct display of all key metrics; hover tooltip for extras |
| Right panel | Remove `HostStatsPanel` and title-bar Host Stats tool |
| Polling | Background interval while active tab connected (~2s), independent of any panel |

## Status bar segments (left → right)

1. Host: `hostname · os`  
2. CPU: `CPU nn%`  
3. Mem: `Mem nn%`  
4. Load: `Load x.xx`  
5. Net: `↓rate ↑rate`  
6. Disk I/O: `R rate W rate`  
7. Disk: prefer `/` mount else fullest — `mount nn%`  
8. Procs: `n procs`

Hover title/tooltip: kernel, arch, uptime, timezone, memory bytes, swap, all disks summary.

## Non-goals

- Persist status-bar layout preferences  
- Per-metric click popovers  
- Showing stats on Home / disconnected tabs  

## Out of scope cleanup

Keep fetch/rate math in `hostStatsStore`; drop panel open/width UI paths from App chrome.
