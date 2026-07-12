# AGENTS.md

## Cursor Cloud specific instructions

TerminalWisely is a single **Tauri 2 desktop app** (no backend services, DB, or API tier):
React 19 + TypeScript + Vite frontend (`src/`) and a Rust/Tauri core (`src-tauri/`) that
compiles into the desktop binary. See `README.md` (product) and `BUILD.md` (build/dev).

### Toolchain notes (baked into the VM snapshot)
- Node 20+ and Rust are required. **Rust must be ≥1.85**: a transitive dependency
  (`zbus`) requires edition 2024, so the default toolchain is set to latest `stable`
  via `rustup default stable`. An older Rust (e.g. 1.83) fails `cargo check` with
  `feature edition2024 is required`.
- Tauri Linux system libraries are installed (webkit2gtk 4.1, libappindicator3, librsvg2,
  patchelf, gtk-3) — matching `.github/workflows/ci.yml`.

### Commands (standard; defined in `package.json` / `BUILD.md`)
- Install frontend deps: `npm install` (this is the update-script step).
- Lint/typecheck + frontend build: `npm run build` (runs `tsc && vite build`).
  There is **no ESLint config**; `tsc` is the type/lint gate.
- Rust check: `cd src-tauri && cargo check` (warnings only; no errors expected).
- Run the app in dev mode: `npm run tauri dev` (starts Vite on port 1420, compiles the
  Rust core, then launches the desktop window). The first Rust build takes ~1-2 min.

### Running the GUI headlessly (non-obvious)
- A display is available at `DISPLAY=:1` (used by computer-use). Launch the app with
  `DISPLAY=:1 WEBKIT_DISABLE_DMABUF_RENDERER=1 npm run tauri dev`.
- `WEBKIT_DISABLE_DMABUF_RENDERER=1` avoids blank/black WebKitGTK windows under software
  rendering (the app also sets this itself since v0.5.13). Harmless `libEGL warning: DRI3`
  lines are expected and non-fatal.
- Vite uses `strictPort` on 1420, so only one `tauri dev` can run at a time.

### Testing scope
- Local-terminal features need nothing external and can be exercised fully (open a local
  terminal from the pinned button in the left sidebar, run shell commands).
- Full SSH/SFTP end-to-end testing requires a reachable SSH server; none is provisioned
  here. There are no automated test suites in the repo.
