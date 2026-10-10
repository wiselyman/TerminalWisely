# Agent 开发规范（TerminalWisely）

> 供 Cursor Agent 与 Cloud Agent 阅读。**每次开发新功能必须遵守。** 开发计划不交给 Codex 联合审查。产品里的 Codex 运行时与此无关。

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

## 功能五段

新功能和当轮缺陷都走五段。前三段先写进计划文件，三块没写全就不改产品源码。写完按任务实现，不交给另一个工具审查。

缺陷不另开例外：也先落计划三块，再写一条会失败的回归测试，看到它失败，再改代码。不顺手加计划里没有的行为。

计划文件是 `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`。任务列表之前必须有下面三块。

### 要保住的旧行为

每条写成以后能自动化的断言：谁做了什么，屏幕或接口上必须仍是什么。例如：打开数据库侧边栏不发起连接。

### 架构

新行为落在哪个文件。这次会改到、已经过大的文件要不要拆开。依赖方向是什么。一个改动说不清落点，就不写任务。

### 设计

用户的点击路径。加载、成功、失败各自出现在界面的哪一块、用哪句文案。

### 编码

计划里的每一项：先写会失败的测试，看到失败，再写刚好让它通过的代码，再跑这一层测试。一项任务一个提交。改完跑硬编码禁检。计划没写的行为不加。

### 测试

看到本次 `./scripts/run-all-tests.sh` 的通过输出，才说这项做完。计划里的界面路径用已有 Playwright 走一遍。假数据覆盖不到的真机项在回复里写明未测，不把已自动化项推给用户。

旧功能被改坏时，把缺的那条旧行为补进回归测试，先看到失败再修。

## 自己收口

不把开发计划或实现交给 Codex 审查。不维护审查队列。产品里可选的 Codex 运行时照旧，那是软件功能，不是这套开发流程。

1. 用户指定功能或当轮缺陷后，用 writing-plans 把计划写到 `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`。任务列表之前写「要保住的旧行为」「架构」「设计」。每项任务先写会失败的测试。三块没写全就停，只补计划。
2. 计划落盘后按任务实现。一项任务的顺序是：会失败的测试、看到失败、最少的实现、这一层测试通过。
3. 做完跑 `./scripts/run-all-tests.sh`，并走计划里写的界面路径。没看到本次通过输出，不说做完。
