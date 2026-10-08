# 0.0.5 数据库运维 Implementation Plan

> 2026-10-01：本文的任务记录保留。当前各引擎能做什么，以 [`../specs/2026-09-30-engine-matrix.md`](../specs/2026-09-30-engine-matrix.md) 的「当前能力」为准，不再以本文开头的「只有 PostgreSQL / MySQL」和「密码留在钥匙串」为准。

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让用户新建 PostgreSQL 或 MySQL 连接并做基本运维，再用现有 AI 工程师在这条连接上调查和提议语句。

**Architecture:** 侧栏新增 `db` 视图。新建连接默认由 Rust 驱动从本机直连主机和端口。可选地复用现有 SSH 会话的 `TcpTunnel` 做转发，不另开登录。密码留在钥匙串。语句风险由 AST 分成读、写、DDL，映射到现有安全模式和审批卡。`engineer_mode=db` 只增加 `db_search_objects`、`db_query`、`db_explain`；`terminal_exec` 仅在该连接选了主机转发时出现。

**Tech Stack:** Tauri/Rust（`sqlparser`、`tokio-postgres`、`mysql_async`）、现有 `src-tauri/src/ssh/tunnel.rs`、Python sidecar PolicyEngine（`sqlglot`）、React 工作台、现有 AI 聊天与 TW MCP。

**Spec:** [`docs/superpowers/specs/2026-09-30-database-ops-design.md`](../specs/2026-09-30-database-ops-design.md)

## Global Constraints

- 新建连接默认直连。主机转发是可选项，复用已有 SSH 会话，不另开登录，不刮 PTY。
- 密码不进 localStorage、sidecar 环境、工具参数、工具结果、聊天记录。
- 引擎范围以 `docs/superpowers/specs/2026-09-30-engine-matrix.md` 的「当前能力」为准。不要把引擎名写进 `capabilities.yaml`。
- 不新增 `diagnose_*` 工具，不用正则拦截某一类 SQL 错误。
- 不恢复 Ask、Plan、一起回答、问问别人。
- 安全模式仍是 observe / safe / autonomous / production。审批目标是「这条连接 + 这句原文」。
- 不提升版本号，不打 tag，不发版。
- 完成前 `./scripts/run-all-tests.sh` 通过，且 `node scripts/check-no-agent-hardcoding.mjs` 通过。

## File map

| Path | Responsibility |
|------|----------------|
| `fixtures/sql-risk.json` | Python 与 Rust 共用的语句分级夹具 |
| `agent-sidecar/app/policy/sql_risk.py` | AST 分级，供 PolicyEngine |
| `src-tauri/src/db/sql_risk.rs` | 执行前再次分级 |
| `src-tauri/src/db/connect.rs` | 直连，或在选了主机时经现有会话转发 |
| `src-tauri/src/db/postgres.rs` / `mysql.rs` | 对象树、查询、解释、三个只读运维页 |
| `src-tauri/src/db/secrets.rs` | 密码只进钥匙串 |
| `src/components/db/DbWorkbench.tsx` | 连接、对象树、编辑器、网格、运维页 |
| `src/stores/sidebarViewStore.ts` | 视图 `"db"` |
| `agent-sidecar/app/tools/schema.py` | 三个数据库工具 |
| `agent-sidecar/app/runtime/tw_mcp.py` | `engineer_mode=db` 的 MCP 名单 |
| `src/lib/aiEngineer/toolBridge.ts` | 工具调用转到 Rust |
| `e2e/db-workbench.spec.ts` | 侧栏、只读查询、safe 下写操作审批 |

---

### Task 1: 共用语句分级

**Files:**
- Create: `fixtures/sql-risk.json`
- Create: `agent-sidecar/app/policy/sql_risk.py`
- Create: `src-tauri/src/db/sql_risk.rs`
- Test: `agent-sidecar/tests/test_sql_risk.py`，`src-tauri/src/db/sql_risk.rs` 内 `#[cfg(test)]`

**Interfaces:**
- Consumes: 无
- Produces: `classify_sql(sql: str, dialect: Literal["postgres","mysql"]) -> Literal["read","write","ddl","transaction","unparsed"]`

夹具至少覆盖：`SELECT 1` → read；`SELECT * FROM t FOR UPDATE` → write；`EXPLAIN SELECT 1` → read；`EXPLAIN ANALYZE SELECT 1` → write；`UPDATE t SET a=1` → write；`DROP TABLE t` → ddl；`BEGIN` → transaction；`not sql` → unparsed；两条语句里含 `DELETE` → write。

- [ ] **Step 1: 写失败测试**

Python 测试读 `fixtures/sql-risk.json`，对每条断言 `classify_sql`。Rust 测试读同一文件。先只写测试和夹具，不提交失败状态；模块注册与依赖声明随 Task 1 一起完成。

- [ ] **Step 2: 跑测试确认失败**

```bash
cd agent-sidecar && . .venv/bin/activate && PYTHONPATH=. python -m pytest tests/test_sql_risk.py -q
```

Expected: FAIL，`classify_sql` 不存在。

```bash
cd src-tauri && cargo test db::sql_risk -- --nocapture
```

Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现**

Python 用 `sqlglot` 解析。Rust 用 `sqlparser`，方言只构造 `PostgreSqlDialect` 或 `MySqlDialect`。分类规则与规格表一致。多语句取最高风险，顺序为 unparsed > transaction > ddl > write > read。不要用正则匹配语句文本。

- [ ] **Step 4: 跑测试确认通过**

上面两条命令都 PASS。

- [ ] **Step 5: Commit**

```bash
git add fixtures/sql-risk.json agent-sidecar/app/policy/sql_risk.py agent-sidecar/tests/test_sql_risk.py src-tauri/src/db/sql_risk.rs src-tauri/Cargo.toml
git commit -m "feat: classify SQL by AST for database ops"
```

---

### Task 2: 直连、可选主机转发和钥匙串

**Files:**
- Create: `src-tauri/src/db/mod.rs`、`secrets.rs`、`connect.rs`、`postgres.rs`、`mysql.rs`
- Modify: `src-tauri/src/lib.rs`、`src-tauri/src/commands/mod.rs`
- Test: `src-tauri/src/db/connect.rs` 的单元测试；驱动测试使用本地起的一次性 PostgreSQL 与 MySQL（没有容器时跳过，并在测试名上标明 live）

**Interfaces:**
- Consumes: 直连用驱动自己的 TCP；仅当 `ssh_session_id` 非空时才用 `TcpTunnel::start_via_socks`。Task 1 的 `classify_sql`
- Produces: Tauri 命令 `db_save_connection`、`db_list_connections`、`db_delete_connection`、`db_search_objects`、`db_query`、`db_explain`、`db_status`

连接字段：`name`、`engine`、`host`、`port`、`database`、`user`、`tls`、可选 `ssh_session_id`。`ssh_session_id` 为空时从本机拨 `host:port`。非空时 `host:port` 是那台已连接主机看到的地址，流量走该会话已有隧道，不新建 SSH 登录。

`db_query` 的参数是 `connection_id`、`sql`、`row_limit`、可选 `lease_id`。另提供 `db_classify_sql(connection_id, sql)` 给工作台；该接口只返回风险，不创建授权。执行前 Rust 再跑一次分级。返回 `{ columns, rows, truncated, risk }`。行数上限：人用网格默认 500，调用方可以更小。超时默认 30 秒。

密码写入与 SSH 相同的系统钥匙串。`db_list_connections` 的 JSON 只有 `secret_id`，没有密码字段。

选了转发的会话断开时，只关闭这条连接的隧道。直连不依赖任何 SSH 会话。

`db_status` 的 `kind` 只有 `sessions`、`locks`、`sizes`。查询文本写在对应驱动里，不进 Agent 提示词。

- [ ] **Step 1: 写失败测试**

断言保存直连后列出的结构体没有 `password` 字段，且 `ssh_session_id` 为空。断言无 `ssh_session_id` 的查询不会调用 `TcpTunnel`。断言有 `ssh_session_id` 时才走隧道。断言 `classify` 为 unparsed 的语句在 observe 下返回错误且不拨号。

- [ ] **Step 2: 跑测试确认失败**

```bash
cd src-tauri && cargo test db:: -- --nocapture
```

Expected: FAIL。

- [ ] **Step 3: 实现命令和两个驱动**

对象查找返回 schema、表、列，限制条数。`db_explain` 对 postgres 执行 `EXPLAIN`，对 mysql 执行 `EXPLAIN`；若内层语句分级高于 read，仍走与 `db_query` 相同的审批前提，本任务只实现执行函数，审批门在 Task 4 接上。执行接口从一开始接受 `lease_id: Option<String>`，不接受调用方传入的 `approved: bool`。Task 4 接好策略与 lease 前，所有非 read 操作均拒绝；不暴露可绕过审批的临时 Tauri 接口。

- [ ] **Step 4: 跑测试确认通过**

`cargo test db::` PASS。有容器时再跑 live 测试。

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/db src-tauri/src/lib.rs src-tauri/src/commands/mod.rs src-tauri/Cargo.toml
git commit -m "feat: connect to Postgres and MySQL directly, with optional SSH forward"
```

---

### Task 3: 数据库工作台

**Files:**
- Create: `src/components/db/DbWorkbench.tsx`、`src/lib/db/api.ts`、`src/stores/dbStore.ts`
- Modify: `src/stores/sidebarViewStore.ts`、`src/App.tsx`、`src/i18n/locales/en/tools.json`、`src/i18n/locales/zh-CN/tools.json`、`src/App.css`
- Test: `src/stores/sidebarViewStore.test.ts`、`e2e/db-workbench.spec.ts`

**Interfaces:**
- Consumes: Task 2 的 Tauri 命令
- Produces: 侧栏按钮 `data-testid="sidebar-view-db"`；工作台 `db-connection-add`、`db-schema-tree`、`db-sql-editor`、`db-run`、`db-result-grid`

切到 `db` 时调用 `setEngineerMode("db")`，并关掉只属于主机的桌面、文件、进程、查找和浏览器面板，与切到 K8s 相同。从 `db` 切回主机时工程师模式回到 `linux`。

编辑器运行前调用与 Task 4 相同的分级。read 直接 `db_query`。write 和 ddl 先走现有审批卡，批准后携带一次性 `lease_id` 调用；分级来自 Rust `db_classify_sql`，前端不自行解析 SQL。Task 3 的审批流程在 Task 4 接好后统一验收。

e2e 用 Tauri mock：侧栏进入数据库，新建表单里隧道选项默认关闭，假直连的对象树出现，运行 `SELECT 1` 后网格有一行。不要求真实数据库。

- [ ] **Step 1: 扩展侧栏测试**

在 `sidebarViewStore.test.ts` 断言 `setView("db")` 调用 `setEngineerMode("db")`。

- [ ] **Step 2: 跑测试确认失败**

```bash
npx vitest run src/stores/sidebarViewStore.test.ts
```

Expected: FAIL，`"db"` 不是合法视图。

- [ ] **Step 3: 实现工作台和 i18n**

中英文都加侧栏名、连接表单、三个运维页、空状态。不要只加一种语言。新建表单默认只有直连字段；「经已连接主机转发」默认关闭，打开后才选择会话。`data-testid="db-connection-tunnel"` 标在这个可选项上。

- [ ] **Step 4: 跑测试**

```bash
npx vitest run src/stores/sidebarViewStore.test.ts
npx playwright test e2e/db-workbench.spec.ts
```

Expected: PASS。

- [ ] **Step 5: Commit**

```bash
git add src/components/db src/lib/db src/stores/dbStore.ts src/stores/sidebarViewStore.ts src/stores/sidebarViewStore.test.ts src/App.tsx src/App.css src/i18n/locales/en/tools.json src/i18n/locales/zh-CN/tools.json e2e/db-workbench.spec.ts
git commit -m "feat: add a database workbench with direct connections"
```

---

### Task 4: 工程师工具和审批

**Files:**
- Modify: `agent-sidecar/app/tools/schema.py`、`agent-sidecar/app/runtime/tw_mcp.py`、`agent-sidecar/app/agent/tools_dispatch.py`、`agent-sidecar/app/agent/prompts.py`、`agent-sidecar/app/policy/engine.py`
- Modify: `src/lib/aiEngineer/toolBridge.ts`、`src/lib/aiEngineer/attachments.ts`、`src/components/aiEngineer/AiEngineerPanel.tsx`、`src/stores/aiEngineerStore.ts`
- Test: `agent-sidecar/tests/test_db_tools.py`、`src/lib/aiEngineer/dbWorkflow.test.ts`

**Interfaces:**
- Consumes: `classify_sql`、Rust `db_query`
- Produces: 工具名 `db_search_objects`、`db_query`、`db_explain`

`openai_tools(engineer_mode="db")` 在直连时返回这三个工具，加上 `web_search`、`web_fetch`、`ask_user`，以及 Linux 模式里已有的记忆和技能工具，不返回 `terminal_exec`，也不返回 `k8s_*`。当前连接的 `ssh_session_id` 非空时，再加 `terminal_exec`。

`tw_mcp_tool_names(engineer_mode="db")` 同样处理：直连没有 `terminal_exec`；选了主机转发才有。

`db_query` 在 PolicyEngine 中按 `policy/risk_matrix.yaml` 映射：read → R0，write → R2，ddl → R3（`delete`），unparsed → R2（`unknown`）。`BEGIN` / `COMMIT` / `ROLLBACK` 直接拒绝，并说明 Agent 不能发事务控制语句。批准记录绑定连接 ID、连接配置 revision、操作种类（query/explain）和 SQL 原文（仅允许统一 trim，不能压缩空白、改大小写或重写字面量）。具体执行协议见下方审查补充。

提示词增加一段，不点名任何模型或本地推理运行时：当前连接用数据库工具取证；直连时不要改去开 SSH；只有连接选了主机转发时才使用 `terminal_exec`，并且只针对那一台、不要再开一次登录；不要索取或复述密码；没有读操作核对之前不要声称变更成功。

三个芯片函数返回中英文调查提示字符串，不含 SQL；实施时从关联规格取精确文案并在测试中断言全文，不能只检测两个关键词。

`toolBridge` 把这三个工具转成对应 Tauri 命令。写操作沿用今天 shell 的审批和 lease，不新做卡片。

- [ ] **Step 1: 写失败测试**

`test_db_tools.py` 断言直连时的工具名单不含 `terminal_exec`，选了 `ssh_session_id` 时才含有它。以及 `DROP TABLE t` 在 safe 下需要批准、`SELECT 1` 不需要、`BEGIN` 被拒绝。`dbWorkflow.test.ts` 断言三句提示都不包含 `SELECT` 或 `pg_stat`。

- [ ] **Step 2: 跑测试确认失败**

```bash
cd agent-sidecar && . .venv/bin/activate && PYTHONPATH=. python -m pytest tests/test_db_tools.py -q
npx vitest run src/lib/aiEngineer/dbWorkflow.test.ts
```

Expected: FAIL。

- [ ] **Step 3: 实现工具、策略和芯片**

- [ ] **Step 4: 跑测试确认通过**

上面两条 PASS。

- [ ] **Step 5: Commit**

```bash
git add agent-sidecar/app/tools/schema.py agent-sidecar/app/runtime/tw_mcp.py agent-sidecar/app/agent/tools_dispatch.py agent-sidecar/app/agent/prompts.py agent-sidecar/app/policy/engine.py agent-sidecar/tests/test_db_tools.py src/lib/aiEngineer/toolBridge.ts src/lib/aiEngineer/attachments.ts src/lib/aiEngineer/dbWorkflow.test.ts src/components/aiEngineer/AiEngineerPanel.tsx src/stores/aiEngineerStore.ts
git commit -m "feat: let the engineer query the open database connection"
```

---

### Task 5: 矩阵和全量测试

**Files:**
- Modify: `docs/TEST_MATRIX.md`、`scripts/smoke-product-checklist.mjs`（若侧栏按钮需要静态接线检查）

- [ ] **Step 1: 加一行**

`| 数据库工作台（Postgres/MySQL 直连，可选 SSH 转发，AI 三工具） | vitest dbWorkflow + sidebar | pytest test_sql_risk + test_db_tools | cargo db:: | e2e db-workbench | ✓ |`

- [ ] **Step 2: 跑全量**

```bash
./scripts/run-all-tests.sh
```

Expected: `All automated tests PASSED`。

- [ ] **Step 3: Commit**

```bash
git add docs/TEST_MATRIX.md scripts/smoke-product-checklist.mjs
git commit -m "docs: record database workbench in the test matrix"
```

## 规格覆盖

- 基本运维：Task 2、Task 3
- 默认直连，主机转发可选：Task 2、Task 3
- 密码不进模型：Task 2、Task 4
- AI 三工具和芯片：Task 4
- AST 分级和审批绑定：Task 1、Task 4
- 不做的引擎和产品：Global Constraints，没有对应任务

## 界面走查（给审查）

1. 侧栏点「数据库」，工程师模式变为数据库，主机桌面面板关掉。
2. 新建 PostgreSQL 或 MySQL 连接。表单默认是主机、端口、库名、用户名；「经已连接主机转发」是关闭的。保存后列表里看不到密码。直连查询不打开隧道。
3. 对象树展开到列。编辑器运行 `SELECT 1`，网格出现结果。
4. safe 模式下运行 `UPDATE`，出现现有审批卡，内容是这句 SQL 和这条连接。改一个字符后再运行，需要重新批准。
5. 打开三个运维页，会话、锁、大小都有结果或空状态，不出现密码。
6. 在该视图打开 AI 聊天，芯片是三句调查提示。问「谁在等锁」时，工具卡片是 `db_query` 或 `db_explain`，转录里没有密码。
7. 切回主机，工程师模式回到 Linux；切到 K8s，行为与现在一致。


## Codex 计划审查补充（2026-09-30，实施必遵守）

以下条款优先于任务中简写的描述；它们属于上述任务的验收条件，不增加独立产品范围。

### Task 1：保守分类与执行约束

- AST 必须遍历整棵树，包含 CTE、子查询、锁子句、SELECT INTO、文件输出、EXPLAIN 的内层语句。不能把所有 SELECT 根节点直接标为 read。未识别节点、解析器退回普通命令节点、解析失败、空输入均为 unparsed；禁止按文本正则、函数名黑名单或软件白名单补洞。
- 共用夹具按方言标明输入与期望，补上写入 CTE、SELECT INTO、MySQL 文件输出、锁定查询、EXPLAIN ANALYZE 写语句、混合 DDL/DML、注释与字符串分号、未知语句；两端必须对所有适用夹具得出相同结果。多语句仍作完整分级，但 v0.0.5 执行端只接受单条语句，多条直接拒绝（不拆开逐条执行）。
- transaction 对人用编辑器与 Agent 一律拒绝，驱动内部事务不受影响。unparsed 在 observe 拒绝；其他模式按 unknown 风险规则处理，不能降为 read。
- AST 的 read 不能证明函数没有副作用。所有 read 路径（查询、对象发现、运维页、只读解释）须在驱动管理的数据库只读事务中执行，完成或失败后清理事务；不得把失败的只读查询自动重试为可写查询。数据库只读限制的边界在工作台帮助文字说明，不声称能阻止数据库外部函数的一切副作用。
- Task 1 同时更新 Python 依赖清单、Cargo.toml/锁文件、Rust 模块注册；两套解析器不同导致的不一致必须解决，不能只跳过某一端断言。

### Task 2 / Task 4：执行端授权和连接生命周期

- 在 Rust 执行入口从可信当前配置获取引擎、安全模式和连接 revision，再分级并决定 allow / deny / require_approval；不可相信前端传来的 risk、requires_lease 或 approved。复用现有模式矩阵：observe 仅 read；safe/production 的 R2/R3 需精确批准；autonomous 的 R2 可自动执行、R3 仍需批准。自动允许与人工批准须在授权记录中区分。事务始终拒绝。
- 扩展 `src-tauri/src/ai_engineer/leases.rs`（必要时新增独立 DB lease 模块并更新 exports/commands）支持带类型的数据库目标，避免把 SQL 塞入 shell 命令或 SSH session_id。绑定 connection_id + revision + operation + trim 后的原文，带过期和单次执行计数。原子校验并消费，确保并发请求不能重放；授权检查在建立连接和发送 SQL 前完成。工作台与 AI 使用同一套审批和执行入口。
- 新增 Rust / Python / Vitest 测试：缺失、伪造、过期、已消费的 lease；改 SQL、连接 ID、连接配置、query/explain 操作时均失效；并发只执行一次；四种模式覆盖 read/write/ddl/unparsed/transaction。拒绝时确认驱动没有收到 SQL；失败不自动重放写操作。
- 密码通过单独保存命令的敏感入参进入系统钥匙串，此入参不得序列化到日志/历史/Agent 请求。连接元数据单独持久化；密码留空编辑时保留旧秘密，显式替换才更新；删除连接清理其 secret 和活动连接，保存失败不遗留孤立秘密。异常须脱敏，不能回显含凭据的连接串。复用现有跨平台 secrets 抽象，不只支持 macOS。
- `tls` 明确定义为 disabled / verify-full，新增 CA 配置需要时使用现有文件选择机制；verify-full 必须验证证书链和原始数据库 host。经本地转发不能改成验证 127.0.0.1，不能静默降级 TLS。两个驱动的 TLS、认证失败及直连/转发路径都要测试。
- 连接注册表持有驱动和隧道资源。SSH 会话断开时关闭绑定该会话的所有数据库资源，包括已接入的 relay 子任务，不能只停止 listener；切换连接取消旧请求，晚到结果不能写进新连接工作台；直连保持独立。
- row_limit 必须在服务端校验为 1..500；增读一行确定 truncated，流式收集并限制总结果字节，不能先把全部结果加载再截断。30 秒超时必须取消数据库执行或关闭并丢弃该连接，不能只丢弃前端等待。返回数值、NULL、时间和二进制采用稳定可序列化类型，不丢失大整数精度。对象检索参数化查询，不能拼接用户输入。
- Live 测试通过仓库脚本启动一次性 PostgreSQL/MySQL，验证真实写入审批、只读限制、超时及清理；缺少容器可明确报告 SKIP，但不能将其描述为已验证的发版依据。加入 CI 数据库服务覆盖与 TEST_MATRIX 对应行；完整 run-all-tests 仍为必过门槛。

### Task 3 / Task 4：模式与会话上下文接线

- 补全 `engineer_mode=db` 从前端 chatClient、侧栏冷启动恢复、sidecar models/main/state、AgentLoop metadata 到所有 runtime（builtin 与 CLI/TW MCP）的传递；按实际定义更新相关文件，不能只改 schema 工具名单。新增或扩展 `agent-sidecar/tests/test_api_surface_integration.py` 证明接口接通。
- 当前数据库上下文只有 connection_id、revision、engine、可选 ssh_session_id 和显示元数据，无密码。Rust 校验上下文与持久化配置一致；模型不能任意切换到另一个连接执行。切换连接、修改转发配置、SSH 断开、切离 db 都失效旧上下文和审批；旧数据库对话与主机对话不能复用错误目标。
- `openai_tools` / `tw_mcp_tool_names` / list_tools / dispatch 共享同一上下文约束。terminal_exec 只允许绑定连接实际选择的 SSH 会话；调度端也拒绝其他 session_id，不能只隐藏工具。memory/skills/web/ask_user 沿用现有工具的能力定义与策略。
- 补测 db 冷启动、db→hosts、db→k8s、两连接切换和运行中切换；保证当前 managed entity 绑定逻辑不会将 db 意外绑定到旧 server。前端/API/两种 runtime 名单与执行校验一致。

### Task 3 / Task 5：真实界面验收与交付

- 将上述七条界面走查逐条落到 `e2e/db-workbench.spec.ts`：两种引擎表单、可选转发默认关闭/开启、对象树展开到列、查询结果与空状态、safe 审批的 SQL/连接展示/拒绝/改字重批、三个运维页、AI 三芯片/工具卡片/脱敏、模式往返。另覆盖保存失败、认证/查询错误、超时、truncated、断开与晚到结果。Tauri mock 用于交互验证，Rust/live 覆盖真实驱动和授权，不能拿 mock 当数据库执行证据。
- 补 `data-testid`、中英文完整文案及静态 wiring 检查；TEST_MATRIX 写真实测试与 live/CI 路径，不以一个勾代替未跑的验证。
- 执行顺序为 Task 1 → Task 2 → Task 4 → Task 3 → Task 5，避免工作台依赖尚未接好的审批接口。过程中只在 main 写代码；任务里的 Commit 步骤改为暂存候选清单，未通过全量测试与 Codex 实现审查前不提交、不推送。新增依赖和锁文件也纳入候选清单。
- 实施完成按 AGENTS.md 写入待审查，包括本计划路径、实际 UI 用例与测试结果，等待用户启动 Codex 审查。最终提交由 Cursor 在审查通过后进行，作者为 Yunfei Wang <wiselyman2008@gmail.com>，全量测试通过后推送 origin main。
