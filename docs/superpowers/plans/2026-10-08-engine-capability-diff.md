# 0.0.5 引擎能力差异（Navicat Mac 手册对照）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按引擎声明并实现差异化能力：能力矩阵与菜单显隐、SQL 维护命令第一批、Redis/Mongo 工作区加深；对照 Navicat Mac 手册，不进入 Designer / BI / 同步。

**Architecture:** 共用工作台壳（连接树、查询标签、审批、AI 绑定）；能力表与 SQL/命令生成落在 `workbenchModel.ts`；菜单由能力表驱动 `ObjectContextMenu`；维护语句走现有 `mutate` + lease 审批；Redis/Mongo 加深各自视图组件，不伪造 schema。

**Tech Stack:** React/TS workbench、Vitest、Playwright E2E、Rust `db::` 执行与风险分级、i18n `shell.json`。

**对照源:**
- `/Users/wangyunfei/Downloads/navicat_mac_en.pdf`（Navicat for Mac，英文，379 页）— 主对照：Ch5 Server Objects、Ch6 Data Editor（RDBMS / MongoDB / Redis）
- 既有：`docs/superpowers/specs/2026-09-30-engine-matrix.md`「Navicat 18 基本层对照」
- 不做：Ch7–8 Profiling/Masking、Ch11 Model、Ch15–23 向导/同步/BI、Ch24 Backup Enterprise 章、Debugger、Pub/Sub、Aggregation Pipeline UI

## Global Constraints

- 仍属 0.0.5 运维基本客户端；不声称 Enterprise 能力。
- 绝对禁止硬编码特判进 Agent Broker / `capabilities.yaml` 软件白名单；引擎差异写在 DB workbench 的能力表与 SQL 生成里（与现有 `objectKinds` 同类）。
- 写/DDL/维护命令一律走现有审批；驳回不执行。
- 每项任务：先红测 → 最少实现 → 该层测试通过；计划外行为不加。
- 完成前：`node scripts/check-no-agent-hardcoding.mjs` + `./scripts/run-all-tests.sh` PASS。
- SQL Server / Oracle 真机仍可标未测；mock + Vitest + 已有 live 引擎优先。

---

## 要保住的旧行为

- 打开侧栏 / 保存连接不自动连接；只有点击连接才拨号。
- 连接失败保持折叠；`db-connect-hint`；表单错误不写进工作区 `db-error`。
- 对象右键：打开 / 定义 / 重命名 / Empty / Truncate / 刷新（SQL 表；非 SQL 仅适用项）。
- Empty=`DELETE`，Truncate=`TRUNCATE`（SQLite 二者皆 DELETE）；单元格可置 NULL；SQL 选区执行。
- 写语句审批卡：展示 SQL、连接、驳回/批准；改 SQL 使 lease 失效。
- Redis：`PING`/键打开/SET/DEL 审批；Mongo：样本字段标注、insertOne/replaceOne/deleteOne 审批。
- 硬编码禁检通过；ClickHouse 不回下拉框。

## 架构

| 落点 | 职责 |
| --- | --- |
| `docs/superpowers/specs/2026-09-30-engine-matrix.md` | 新增「引擎能力差异」表：对象种类、菜单、维护、Redis/Mongo 视图；引用 Mac PDF 路径与章节 |
| `src/components/db/workbenchModel.ts` | `engineCapabilities` / `objectMenuActions` / `maintainSql` / Redis TTL·类型命令 / Mongo JSON 校验辅助；纯函数 + Vitest |
| `src/components/db/ObjectContextMenu.tsx` | 按 `engine` + `kind` + 能力表过滤菜单；维护子项 `data-testid` |
| `src/components/db/DbWorkbench.tsx` | 挂载维护 action → `mutate`；Redis/Mongo 视图加深（类型徽章、TTL 编辑、JSON 校验提示） |
| `e2e/db-workbench.spec.ts` + `src/e2e/tauriCoreMock.ts` | 菜单显隐、维护进审批、Redis TTL、Mongo JSON 编辑回归 |
| `src/i18n/locales/{en,zh-CN}/shell.json` | 维护项与 Redis/Mongo 新文案 |
| `scripts/smoke-product-checklist.mjs` | `db.engine-capability-diff` 挂钩矩阵段落 |
| `docs/TEST_MATRIX.md` | 新功能行 |

依赖方向：`workbenchModel`（无 UI）← `ObjectContextMenu` / `DbWorkbench` ← E2E。不拆 `DbWorkbench` 整文件，除非单次任务内新增独立小组件文件（如 `RedisKeyView.tsx` / `MongoDocView.tsx`）且计划任务写明。

## 设计

### A. 能力矩阵 + 菜单显隐

用户路径：连上某引擎 → 对象树右键 → 只看见该引擎适用项（灰掉/不渲染不适用项，不弹「不支持」空菜单）。

| 引擎 | 对象（相对现状） | 右键（相对现状） |
| --- | --- | --- |
| postgres | 已有 + 能力表声明 | 表：+ Maintain→Analyze / Vacuum / Reindex |
| mysql / mariadb | 已有 | 表：+ Maintain→Analyze / Optimize |
| sqlite | 已有 | 表：+ Maintain→Analyze / Reindex；库级 Vacuum 可第二批 |
| sqlserver / oracle | 已有对象 | 菜单同 SQL 基本项；维护命令本批可不做或仅文档标「后补」 |
| redis | key | 打开 / 刷新；无 Empty/Truncate/Rename/Definition |
| mongodb | collection | 打开 / 刷新；Empty≈删文档集合策略本批不做 drop |

成功：菜单项与矩阵一致，E2E 按引擎断言 `db-object-menu-*` 有无。失败：不适用项不可见。

### B. 维护命令第一批

用户路径：右键表 → Maintain → 选一项 → 编辑器填入 SQL → 走审批 → 批准后执行 → 刷新对象（若需要）。

| 引擎 | 动作 | SQL（示意，以实现为准） | 风险 |
| --- | --- | --- | --- |
| postgres | Analyze | `ANALYZE "schema"."table"` | 写/维护 → 审批 |
| postgres | Vacuum | `VACUUM "schema"."table"` | 同上 |
| postgres | Reindex | `REINDEX TABLE "schema"."table"` | 同上 |
| mysql/mariadb | Analyze | `ANALYZE TABLE \`db\`.\`table\`` | 同上 |
| mysql/mariadb | Optimize | `OPTIMIZE TABLE \`db\`.\`table\`` | 同上 |
| sqlite | Analyze | `ANALYZE "main"."table"` | 同上 |
| sqlite | Reindex | `REINDEX "main"."table"` | 同上 |

加载：菜单点击后 SQL 进当前标签。成功：审批通过后无错误。失败：驱动错误进结果/表单既有通道，不含口令。

### C. Redis / Mongo 工作区加深

**Redis**（对照 PDF Ch5 Redis / Ch6 Redis Data Editor）：

- 键视图展示类型徽章（string/list/hash/…）、TTL（秒或 persistent）。
- 可编辑 TTL：`EXPIRE` / `PERSIST`（写审批）；字符串值仍 SET/DEL。
- 列表区（All Data 级）本批不强制做完整网格；至少键打开路径类型与 TTL 正确。

**Mongo**（对照 PDF Ch6 MongoDB Data Editor 子集）：

- 文档区：JSON 格式校验（非法 JSON 禁用 replace/insert，短错误提示，不撑布局）。
- 保留样本字段条；replace/delete 仍审批。
- 不做 Grid/Tree/JSON 三视图切换、不做 Aggregation Pipeline UI。

---

## 任务

### Task 1: 引擎能力矩阵文档 + smoke

**Files:**
- Modify: `docs/superpowers/specs/2026-09-30-engine-matrix.md`
- Modify: `docs/TEST_MATRIX.md`
- Modify: `scripts/smoke-product-checklist.mjs`

- [x] **Step 1:** 在 engine-matrix 增加「引擎能力差异（Navicat Mac）」节：引用 PDF 路径；对象/菜单/维护/Redis·Mongo 四列表；标明本批做/后补/不做。
- [x] **Step 2:** smoke 增加 `db.engine-capability-diff`，断言该节标题与 PDF 文件名/`Chapter 5` 字样存在。
- [x] **Step 3:** `node scripts/smoke-product-checklist.mjs` 中相关断言 PASS。

### Task 2: `engineCapabilities` + 菜单过滤（先红测）

**Files:**
- Modify: `src/components/db/workbenchModel.ts`
- Modify: `src/components/db/workbenchModel.test.ts`
- Modify: `src/components/db/ObjectContextMenu.tsx`
- Modify: `src/components/db/DbWorkbench.tsx`（传入 engine）
- Test: Vitest；E2E 菜单显隐

- [ ] **Step 1:** 写失败 Vitest：`objectMenuActions("redis","key")` 不含 truncate；`objectMenuActions("postgres","table")` 含 maintain 项 id；`objectMenuActions("mongodb","collection")` 不含 rename。
- [ ] **Step 2:** 跑 Vitest 见红。
- [ ] **Step 3:** 实现 `objectMenuActions(engine, kind)`（或等价），`ObjectContextMenu` 改按能力表渲染；维护项可先占位 id 未接线。
- [ ] **Step 4:** Vitest 绿；E2E：mock redis 连接右键无 truncate；postgres 表右键有 maintain 入口（若 UI 用子菜单，测 `db-object-menu-maintain`）。

### Task 3: `maintainSql` + 审批接线

**Files:**
- Modify: `workbenchModel.ts` / `.test.ts`
- Modify: `ObjectContextMenu.tsx` / `DbWorkbench.tsx`
- Modify: i18n en/zh-CN
- Modify: `e2e/db-workbench.spec.ts`、`tauriCoreMock.ts`
- 若风险分级不认 VACUUM/OPTIMIZE：Modify `src-tauri/src/db/sql_risk.rs`（或现有 AST 路径）使维护句进入需审批而非静默放行/误拒；附 Rust 单测

- [ ] **Step 1:** 失败 Vitest：各引擎 `maintainSql(engine, action, schema, table)` 生成预期 SQL；未知 action → null。
- [ ] **Step 2:** 见红后实现生成函数与标识符引用（复用现有 quote）。
- [ ] **Step 3:** 菜单 Maintain → 填 SQL → `mutate`；写/审批 E2E：出现 `db-approve`（或既有审批 testid），驳回不执行。
- [ ] **Step 4:** `cargo test` 相关风险测 + Vitest + 该 E2E 绿。

### Task 4: Redis 类型 / TTL 加深

**Files:**
- Modify: `workbenchModel.ts`（`redisExpireCommand` / `redisPersistCommand`）
- Modify: `DbWorkbench.tsx` 键视图（或抽出 `RedisKeyView.tsx`）
- Modify: i18n；E2E + mock（TYPE/TTL/EXPIRE）

- [ ] **Step 1:** 失败 Vitest：expire/persist 命令形状；非法 key → null。
- [ ] **Step 2:** 见红后实现；UI：类型与 TTL 只读展示 + TTL 输入/Persist；写走审批。
- [ ] **Step 3:** E2E：打开键见 type/ttl testid；改 TTL 触发审批或 mock 执行路径与现有 SET 一致。
- [ ] **Step 4:** 该层测试绿。

### Task 5: Mongo JSON 校验与编辑提示

**Files:**
- Modify: `workbenchModel.ts`（`parseMongoJson` / 错误短讯）
- Modify: `DbWorkbench.tsx` 文档区（或 `MongoDocView.tsx`）
- Modify: i18n；E2E

- [ ] **Step 1:** 失败 Vitest：合法 JSON ok；非法 JSON 返回短错误；空对象可插入策略与现有 `mongoInsertCommand` 一致。
- [ ] **Step 2:** 见红后实现；非法时 disable insert/replace，状态行短红字（不撑开整页）。
- [ ] **Step 3:** E2E：填坏 JSON → 按钮 disabled 或点按不发 invoke；修好后可走审批。
- [ ] **Step 4:** 该层测试绿。

### Task 6: 全量回归

- [ ] **Step 1:** `node scripts/check-no-agent-hardcoding.mjs`
- [ ] **Step 2:** `./scripts/run-all-tests.sh`
- [ ] **Step 3:** 回复中写明 SQL Server/Oracle 维护与真机未测项；不把已自动化项推给用户手测。

---

## 验收走查（计划内界面路径）

1. Postgres 连接 → 表右键 → Maintain → Vacuum → 审批驳回 → 再批准。
2. MySQL 表右键 → Optimize → 审批。
3. Redis 打开 string 键 → 见类型与 TTL → 改 TTL → 审批。
4. Mongo 集合 → 坏 JSON 不能提交 → 好 JSON replace 走审批。
5. Redis 右键无 Truncate；Postgres 右键无 Redis 专用项。

## 明确不做（本计划）

- Table Designer、Query Builder、Model、BI、Structure/Data Sync、Backup 向导、HTTP 隧道。
- Oracle/SQL Server 完整 Maintain 清单、用户/角色管理、Debugger、Pub/Sub、Aggregation Pipeline。
- Redis 全库 All Data 大网格、Mongo GridFS、三视图切换。
