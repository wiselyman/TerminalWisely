# Design: Host file tree ops (mkdir / DnD / clipboard / multi-select)

**Date:** 2026-09-08  
**Priority:** 1 new folder/file → 2 tree DnD move → 3 copy/cut/paste/duplicate → 4 multi-select

## Scope

Enhance right-side Host (`LocalFs*`) remote tree. Keep existing dialog move/rename/delete.

## P1 — Create

- Context: directory entry + background → New folder / New file
- Dialog asks name; Tauri `create_remote_path` with `kind: file|directory`
- SFTP mkdir / create empty file; sudo fallback via `mkdir` / `touch`
- Refresh parent listing after success

## P2 — Tree DnD move

- Pointer-based move (not HTML5 DnD — conflicts with xterm / Tauri file-drop in WebView)
- Drop onto a **folder** → move into that folder
- Drop onto a **file** → move into that file's parent directory (Finder/Explorer style)
- Refuse drop into self/descendant / already-there
- Visual drop highlight + small follow ghost
- After SFTP mutate: **Host tree local reload only** — never inject `ls` into the interactive Terminal PTY

## P3 — Clipboard

- In-app clipboard (not OS file clipboard): `{ op: copy|cut, paths[], sessionId }`
- Menu: Copy / Cut / Paste / Duplicate
- Copy → recursive remote copy (`cp -a` via sudo-capable exec or SFTP walk); Cut+Paste → move
- Duplicate → copy beside with ` name copy` / `name (2)` style

## P4 — Multi-select

- Cmd/Ctrl+click toggle; Shift+click range
- Batch delete/move/copy/cut; download first selected only or batch if cheap

## Tests

- Rust unit: path join / name validate / refuse move into descendant
- FE: pure helpers for drop validity, clipboard, multi-select range
- E2E smoke: menu items present (static or Playwright if feasible)
