# 0.0.5 数据库运维设计

**日期：** 2026-09-30  
**状态：** 待审计划

> 2026-10-01：当前能力以 [`2026-09-30-engine-matrix.md`](2026-09-30-engine-matrix.md) 的「当前能力」为准。下文「只做 PostgreSQL / MySQL」「SQLite、Redis、MongoDB 不在本版」「密码只进钥匙串」是当时的计划，不再作为交付范围。

## 目标

在主机和 K8s 旁边增加第三块工作面：用新建的数据库连接做基本运维，并让现有 AI 工程师在这条连接上调查和提议语句。默认从本机直连数据库地址。经已有 SSH 会话转发是同一张表单上的可选项，不是默认路径。人用的编辑器和 AI 用的工具走同一条执行路径。密码不进模型，变更不绕过现有安全模式和审批卡。

## 从外部项目拿走什么

读过的源码和业务：

- [DBX](https://github.com/t8y2/dbx)：桌面数据库工作台。有用的是「编辑器里的 SQL 先按语句类别分级，再执行」以及「AI 看见的是当前连接的对象，不是另一套登录」。它的 100 多种引擎、消息队列、中间件控制台、插件市场、自己的模型供应商，本版都不做。
- [MindsHub](https://github.com/mindsdb/mindshub) 及其数据层 [data-vault](https://github.com/mindsdb/data-vault)：有用的是「凭据留在保险库，代理只拿到工具结果」。它的联邦查询、知识库、200 个连接器、另一套 Agent 运行时，本版都不做。
- [DBHub](https://github.com/bytebase/dbhub)：工具面保持三条就够：执行语句、查找对象、看执行计划。另加行数上限和超时。
- Bytebase 的治理思路：写操作变成「批准这一条确切语句」，不另起一个平台。

## 三种做法

1. **推荐。** 侧栏增加「数据库」。新建连接默认填写引擎、主机、端口、库名、用户名，由 Rust 驱动从本机直连。需要从某台已连接主机才能到达时，同一张表单可以改选「经这台主机的现有会话转发」，复用 `TcpTunnel`（`src-tauri/src/ssh/tunnel.rs`），不另开 SSH。AI 在 `engineer_mode=db` 时使用 `db_search_objects`、`db_query`、`db_explain`。只有连接选了主机转发时，才额外带上那台主机的 `terminal_exec`。语句风险用 AST 分成读、写、DDL，映射到现有安全模式。
2. **只通过 `psql` / `mysql` 客户端。** 不建工作台，让模型在终端里敲客户端。结果是文本，网格和对象树都不成立；未知客户端按仓库规则必须保持 unknown，不能为了这个功能去白名单。
3. **内嵌 DBX 或 MindsDB。** 变成第二个产品，以及我们不需要的引擎和知识库。

采用第 1 种。直连是正常路径，主机转发是额外能力。

## 连接

一条保存的连接包含：名称、引擎（`postgres` 或 `mysql`）、本机要拨的主机和端口、数据库名、用户名、密码在本机钥匙串中的引用，以及可选的 TLS 开关。MariaDB 走 `mysql` 驱动。端口缺省时 PostgreSQL 为 5432，MySQL 为 3306。

可选字段 `ssh_session_id`：空着就是直连。填了则地址和端口表示「从那台已连接主机看到的地址」，流量走该会话已有的隧道。不为数据库另开一次 SSH 登录。会话断开时，这条连接的转发停止；直连不受影响。

SQLite 文件、Redis、MongoDB 以及其他引擎不在本版。

密码只存在 Rust 侧的钥匙串。侧边栏 JSON、sidecar 环境变量、工具参数、工具结果和聊天记录里都不出现密码。

## 人用的工作台

侧栏视图从 `"hosts" | "k8s"` 扩展为 `"hosts" | "k8s" | "db"`。切到数据库时，`setEngineerMode("db")`，与今天切到 K8s 会切到 `k8s` 一样。

工作台包含：

- 连接列表，以及新建连接。表单默认是直连；「经已连接主机转发」是折叠后的可选项。
- 对象树：库或 schema、表、列。
- SQL 编辑器。运行选中文本；没有选中时运行全文。
- 结果网格。默认最多 500 行，并标明被截断。
- 只读运维页：会话、锁、库大小。这三页由驱动执行固定的目录查询，相当于 K8s 的资源列表，不是 Agent 里的任务特判。

单元格内编辑、导入导出、ER 图、结构对比、定时备份不在本版。

安全模式沿用现有四档，不新做一套开关：

- 只读语句在 observe 和 safe 下直接执行。
- 写和 DDL 在 observe 下拒绝；在 safe 下弹出现有审批卡，卡片上的目标是这条连接上的这句原文。语句或连接一变，批准作废。
- autonomous 与 production 沿用今天对同等风险 shell 命令的处理。

无法解析的 SQL 不当成只读。多条语句取其中最高风险。

## AI

不新增聊天模式，不恢复 Ask / Plan / 一起回答 / 问问别人。数据库视图打开时，现有右侧工程师使用 `engineer_mode=db`。

工具只有：

| 工具 | 作用 |
| --- | --- |
| `db_search_objects` | 按名字查找当前连接的 schema、表、列 |
| `db_query` | 执行一条语句，带 `intent` |
| `db_explain` | 对一条语句取执行计划，本身不改数据 |
| `terminal_exec` | 仅当当前连接选了主机转发时提供，且只用于那台主机 |
| `web_search` / `web_fetch` / `ask_user` | 与 Linux 模式相同 |

没有 `diagnose_slow_query`、`check_locks` 或任何按用户故事命名的工具。慢查询、锁和空间由模型自己用上面的工具调查。提示词只说明：用当前连接的数据库工具取证；直连时不要改去开 SSH；选了主机转发时，主机命令只针对那一台，且不要再开一次登录；不要索取或复述密码；变更后用读操作核对，再声称成功。

工作流芯片是三句调查提示，与 K8s 芯片一样，不是命令模板：

- 哪些会话在等待
- 解释编辑器里这段语句为什么慢；没有选中语句时，先找出当前最重的语句
- 各数据库占多大空间

外部 Agent（Cursor、Codex、Claude）在 `engineer_mode=db` 时通过现有 TW MCP 看到同一组工具。执行仍回到 Rust，不让外部运行时自己拿连接串。

工具结果默认最多 200 行。已有的工具结果预算继续生效。

## 语句风险

分类器读 AST，不用关键词正则去认某一种错误或某一个软件。

| 类别 | 例子 | 映射到 `policy/risk_matrix.yaml` |
| --- | --- | --- |
| 读 | `SELECT`、`SHOW`、`EXPLAIN`（不含 ANALYZE） | `read` → R0 |
| 写 | `INSERT`、`UPDATE`、`DELETE`、`MERGE`、`SELECT … FOR UPDATE`、`EXPLAIN ANALYZE` 的内层若会执行写 | `write` → R2 |
| DDL | `CREATE`、`ALTER`、`DROP`、`TRUNCATE`、`GRANT`、`REVOKE` | `delete` → R3 |
| 事务控制 | `BEGIN`、`COMMIT`、`ROLLBACK` | Agent 直接拒绝，不映射成风险等级。人在编辑器里运行时，整段按其中最高风险审批 |
| 无法解析 | 解析失败、不支持的方言 | `unknown` → R2，不自动执行 |

Python `sqlglot` 在 PolicyEngine 里分类，决定要不要审批。Rust `sqlparser` 在真正执行前再分类一次。两边共用同一份语句夹具，测试必须一致。方言只认 `postgres` 和 `mysql`。

不把 postgres 或 mysql 写进 `capabilities.yaml`。不在 `prompts.py` 里点名具体数据库产品以外的模型运行时。驱动里为两种引擎各写目录查询是允许的，和 K8s 工具知道 Pod 一样。

## 明确不做

Redis、MongoDB、ClickHouse、Oracle、SQL Server、SQLite、消息队列、配置中心、ER 图、结构对比、数据对比、导入导出、定时备份、联邦查询、向量知识库、内嵌 DBX 或 MindsDB、新的模型供应商、为数据库另开一次 SSH 登录、版本号提升和发版。

## 验收

- 侧栏可以进入数据库，新建一条 PostgreSQL 或 MySQL 直连，对象树出现，`SELECT` 在网格里显示。
- 同一张新建表单里可以改选经某台已连接主机转发；不选时不打开隧道。
- safe 模式下一条 `UPDATE` 弹出现有审批卡，卡片里是这句原文和这条连接；改一个字之后旧批准无效。
- 聊天里问「谁在等锁」时，模型通过 `db_query` 或 `db_explain` 取证，转录中没有密码。
- `node scripts/check-no-agent-hardcoding.mjs` 通过。
- `./scripts/run-all-tests.sh` 通过。
