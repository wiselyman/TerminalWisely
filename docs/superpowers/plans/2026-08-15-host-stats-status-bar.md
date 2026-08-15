# Host Stats Status Bar Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox syntax.

**Goal:** Replace the Host Stats right panel with a Cursor-like bottom status bar that shows all key metrics at once.

**Architecture:** Poll `get_host_stats` whenever an SSH tab is active; render a compact `HostStatsStatusBar` under the workspace. Remove title-bar tool + panel.

**Tech Stack:** React, Zustand `hostStatsStore`, existing `hostStatsFormat` helpers.

## Global Constraints

- AI remote commands still via existing session only (unchanged).  
- No new agent frameworks.  
- i18n en + zh-CN for new strings.

---

### Task 1: Status bar component + CSS

- [ ] Add `src/components/hostStats/HostStatsStatusBar.tsx`
- [ ] Add `.host-stats-statusbar*` styles in `App.css`

### Task 2: Wire polling + mount in App

- [ ] Poll when `activeTabId` set (not gated on panel open)
- [ ] Mount status bar in `workspace-frame`
- [ ] Remove title-bar HostStats tool + `HostStatsPanel` mount

### Task 3: Remove panel entry points

- [ ] Drop `hostStats` from `workspacePanelSwitch` / pin store
- [ ] Update welcome / smoke / i18n labels as needed
- [ ] `tsc` + smoke checklist
