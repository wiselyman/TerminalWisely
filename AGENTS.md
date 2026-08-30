# Agent 开发规范（TerminalWisely）

> 供 Cursor Agent / Cloud Agent 阅读。**每次开发新功能必须遵守。**

## 测试铁律

1. **新功能必须带测试** — 按改动范围选择：
   - 前端纯逻辑 → `src/**/*.test.ts`（Vitest）
   - Sidecar / Agent → `agent-sidecar/tests/test_*.py`（pytest）
   - Rust 纯函数 → `src-tauri` 内 `#[cfg(test)]`
   - UI 可点击流程 → `e2e/*.spec.ts`（Playwright，当前 **34** 项）+ 必要时 `data-testid`
   - 真实 SSH / SFTP → `scripts/e2e-ssh-integration.sh` + `src-tauri/src/ssh/live_integration.rs`
   - 真实 K8s（k3d）→ `scripts/e2e-k8s-integration.sh` + `src-tauri/src/k8s/live_integration.rs`
   - 静态 wiring / i18n → 扩展 `scripts/smoke-product-checklist.mjs`

2. **完成前必须跑全量测试并通过**：
   ```bash
   ./scripts/run-all-tests.sh
   ```
   等价于：`npm run test:all`

3. **不得**把 Platform / Eval / MCP 等已自动化项推给用户手动验收；Playwright 已覆盖见 `npm run test:e2e`。

4. **提交前**确认 CI 会跑的检查均本地通过（见 `BUILD.md` → 测试）。

## 新功能测试清单（Agent 自检）

- [ ] 已添加/更新对应层级的测试文件
- [ ] `./scripts/run-all-tests.sh` 全部 PASS
- [ ] 若改 UI：已加 `data-testid` 或 Playwright 用例
- [ ] 若改 Sidecar API：已更新 `test_api_surface_integration.py` 或同类集成测试
- [ ] 已更新 `docs/TEST_MATRIX.md` 中对应功能行（如有新模块）

## 常用命令

| 命令 | 用途 |
|------|------|
| `./scripts/run-all-tests.sh` | **全量回归（必跑）** |
| `npm test -- --run` | 前端单元 |
| `npm run test:smoke` | 静态功能检查 |
| `npm run test:e2e` | Playwright UI E2E |
| `cd agent-sidecar && pytest tests/ -q` | Sidecar |
| `cd src-tauri && cargo test` | Rust 单元 |

跳过项（仅本地调试，**不可作为发版依据**）：
- `./scripts/run-all-tests.sh --skip-eval`
- `./scripts/run-all-tests.sh --skip-rust`
- `SKIP_E2E=1 ./scripts/run-all-tests.sh`

## Git

- **直接在 `main` 分支开发**；不要开 PR、不要推 `cursor/*` 功能分支（除非你明确要求）。
- 测试通过后 `git push origin main`。
- **禁止 Cursor 署名**；提交作者必须是 `Yunfei Wang <wiselyman2008@gmail.com>`，message 中不得含 `Co-authored-by: Cursor` 或 `Made-with: Cursor`。见 `BUILD.md`。
- `npm run hooks:install` 启用 pre-push 全量测试。
- 跨平台回归由 GitHub Actions 矩阵覆盖（见 `docs/TEST_MATRIX.md` → 跨平台 CI 矩阵）。

## 文档

- 功能 ↔ 测试映射：`docs/TEST_MATRIX.md`
- 仅 SSH/拖拽等无法自动化项：`docs/USER_TEST_CHECKLIST.md`
