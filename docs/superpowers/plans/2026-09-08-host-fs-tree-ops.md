# Implementation Plan: Host file tree ops

See design: `docs/superpowers/specs/2026-09-08-host-fs-tree-ops-design.md`

Delivered:
- Tauri: `create_path`, `copy_path`, `duplicate_path`; move rejects self/descendant
- FE: new file/folder menus, tree DnD move, in-app copy/cut/paste/duplicate, multi-select
- Tests: Rust `fs_path_tests`, Vitest `localFsOps`, smoke `hostfs.*`
