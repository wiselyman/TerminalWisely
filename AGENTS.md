# Agent 开发规范（TerminalWisely）

> 供 Cursor Agent / Cloud Agent 阅读。**每次开发新功能必须遵守。**

## 绝对禁止硬编码（铁律 · 优先于「先修 UX」的冲动）

用户已多次明确：**绝对不允许硬编码**。再犯视为严重失误。

**禁止：**
- 任务/场景特判（「用户问测 tok/s → 拦某脚本 / 强制某命令」）
- 为某一类错误 Agent 输出写正则/关键词黑名单当「智能拦截」
- 在 Broker / AgentLoop / Policy 里为单个用户故事写死命令模板
- **每遇到一个软件就往 `capabilities.yaml` 加白名单**（本机软件无限；未知 CLI 保持 unknown，靠终端发现 + 用户批准 / 会话记住）
- **用正则特判「命令里的版本号/标签名必须来自用户或本轮工具」**（仍是硬编码特判）
- 臆造主机上的模型名、端口、服务名（必须来自本轮工具输出或用户原话；靠提示与证据原则约束，不靠名字黑白名单）
- 在 `prompts.py` / gateway 里**点名** ollama、sglang、Nemotron 等做分支或「禁止清单」
- 给 `web_search` **改写 query 塞年份**（year-append）

**允许：**
- 通用原则（提示词、无证据不得报本机测量数字、最新用户消息优先、注入 Today UTC 日期）
- 通用机制（`bash -c` 展开看内部命令、循环体风险归类）
- 能力表维护**风险语义**（read vs write），不是「软件名录」

**CI 闸门（必过）：**
```bash
node scripts/check-no-agent-hardcoding.mjs
```
已挂入 `npm run test:smoke` / `./scripts/run-all-tests.sh`。命中即 FAIL。

细则见 `.cursor/rules/linux-ai-engineer.mdc`。

## 测试铁律

1. **新功能必须带测试** — 按改动范围选择：
   - 前端纯逻辑 → `src/**/*.test.ts`（Vitest）
   - Sidecar / Agent → `agent-sidecar/tests/test_*.py`（pytest）
   - Rust 纯函数 → `src-tauri` 内 `#[cfg(test)]`
   - UI 可点击流程 → `e2e/*.spec.ts`（Playwright，当前 **34** 项）+ 必要时 `data-testid`
   - 真实 SSH / SFTP → `scripts/e2e-ssh-integration.sh` + `src-tauri/src/ssh/live_integration.rs`
   - 真实 K8s（k3d）→ `scripts/e2e-k8s-integration.sh` + `src-tauri/src/k8s/live_integration.rs`
   - 静态 wiring / i18n → 扩展 `scripts/smoke-product-checklist.mjs`
   - **硬编码禁检** → `node scripts/check-no-agent-hardcoding.mjs`

2. **完成前必须跑全量测试并通过**：
   ```bash
   ./scripts/run-all-tests.sh
   ```
   等价于：`npm run test:all`

3. **不得**把已自动化项推给用户手动验收；Playwright 已覆盖见 `npm run test:e2e`。

4. **提交前**确认 CI 会跑的检查均本地通过（见 `BUILD.md` → 测试）。

## 新功能测试清单（Agent 自检）

- [ ] 已添加/更新对应层级的测试文件
- [ ] `node scripts/check-no-agent-hardcoding.mjs` PASS
- [ ] `./scripts/run-all-tests.sh` 全部 PASS
- [ ] 若改 UI：已加 `data-testid` 或 Playwright 用例
- [ ] 若改 Sidecar API：已更新 `test_api_surface_integration.py` 或同类集成测试
- [ ] 已更新 `docs/TEST_MATRIX.md` 中对应功能行（如有新模块）
- [ ] **未**引入任务特判 / 单软件白名单 / 场景正则黑名单 / 年份改写 query

## 常用命令

| 命令 | 用途 |
|------|------|
| `./scripts/run-all-tests.sh` | **全量回归（必跑）** |
| `npm run test:smoke` | 静态功能检查（含硬编码禁检） |
| `node scripts/check-no-agent-hardcoding.mjs` | **仅** Agent 硬编码禁检 |
| `npm test -- --run` | 前端单元 |
| `npm run test:e2e` | Playwright UI E2E |
| `cd agent-sidecar && pytest tests/ -q` | Sidecar |
| `cd src-tauri && cargo test` | Rust 单元 |

跳过项（仅本地调试，**不可作为发版依据**）：
- `./scripts/run-all-tests.sh --skip-rust`
- `SKIP_E2E=1 ./scripts/run-all-tests.sh`

## Git

- **只在 `main` 开发并推送**；禁止开功能分支、禁止推 `cursor/*` / Cloud Agent 分支、禁止擅自开 PR（除非用户明确要求）。
- 测试通过后 `git push origin main`。
- **禁止 Cursor 署名**；提交作者必须是 `Yunfei Wang <wiselyman2008@gmail.com>`，message 中不得含 `Co-authored-by: Cursor`、`Made-with: Cursor` 或 `cursoragent@cursor.com`。见 `BUILD.md`。
- `npm run hooks:install` 启用 pre-push 全量测试。
- 跨平台回归由 GitHub Actions 矩阵覆盖（见 `docs/TEST_MATRIX.md` → 跨平台 CI 矩阵）。

## 文档

- 功能 ↔ 测试映射：`docs/TEST_MATRIX.md`
- 仅 SSH/拖拽等无法自动化项：`docs/USER_TEST_CHECKLIST.md`
