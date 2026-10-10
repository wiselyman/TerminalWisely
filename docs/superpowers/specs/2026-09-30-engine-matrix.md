# DBX 与 MindsHub 对标矩阵

本文件是分阶段引擎计划。**当前交付范围以下面的「当前能力」为准。** 更早的 `database-ops-design.md` 和 `database-ops.md` 里「只做 PostgreSQL / MySQL，排除 SQLite、Redis、MongoDB、ClickHouse」以及「密码进钥匙串」已被这一节取代。ClickHouse 已退出下拉框，保存过的连接会因引擎未知而打不开。驱动能连上，或一次 `SELECT 1`，不等于该引擎已支持。

## 当前能力

2026-10-01 代码里实际接通的行为。同一天对 `192.168.100.176` 跑过 PostgreSQL `15432`、MySQL `13306` 的 `live_postgres_and_mysql_match_the_security_contract`，以及 MariaDB `13307`、Redis `16379`、MongoDB `27017` 的读、错误语句和「写入停在审批、不执行」。这些测试在 CI 里仍然 ignored。SQLite 用临时文件证明只读打开不能改文件。SQL Server 与 Oracle 的真机测试保持 ignored，环境变量是 `TW_DB_MSSQL_*` 与 `TW_DB_ORACLE_*`；这块 aarch64 板不安装这两种服务，当前标为未测。对象树和导入导出的点击验收在原生窗口，不把驱动连上写成整棵树已在真机点过。

| 引擎 | 连接 | 对象浏览 | 数据查看 | 写入与拒绝 | 分页 | 取消 | CSV | 限制 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| PostgreSQL | 直连，或经已有 SSH 会话转发 | 库 → schema → 表/视图/实体化视图/函数 → 分组 → 列；对象右键打开/定义/重命名/Empty/Truncate/刷新 | 网格，`LIMIT 100`；单元格可置 NULL | 写和 DDL 走审批卡；驳回不执行；Empty=`DELETE`，Truncate=`TRUNCATE` | 表查看按页改 `OFFSET` | operation id：取消后端查询，迟到结果不进新标签 | 导出本页，或按当前筛选分批导出（最多 500 行，截断会说明）；导入已有表前有预览、列映射、跳过列、错行和分批进度，执行仍走审批 | 无图表、ER、结构比较、Excel、备份、Table Designer |
| MySQL | 同上 | 库 → 表/视图/函数/事件 → 分组 → 列 | 同上 | 同上；取消用 `KILL QUERY` | 同上 | 同上 | 同上 | 同上 |
| MariaDB | 同上，引擎 id 保持 `mariadb`，走 MySQL 协议 | 同 MySQL | 同 MySQL | 同 MySQL | 同 MySQL | 同 MySQL | 同 MySQL | 2026-10-01 在 `192.168.100.176:13307` 读通、错误语句返回且不含口令、写入停在审批未执行。CI 仍 ignored |
| SQLite | 只保存文件路径，不写 host、端口、用户 | `main` 下的表/视图 | 只读查询以只读方式打开文件，写语句不能借这次打开改文件 | 写语句另以读写方式打开，仍走审批 | 同上 | 进度回调看到取消标志后中断 | 同上 | 只读打开不会创建缺失文件。回归：只读 `INSERT` 后行数不变；长读可被取消标志打断 |
| Redis | 直连；用户可空；认证可关 | 库和键 | 打开键看值 | `SET` / `DEL` 要审批，驳回不执行 | 键列表按页 | `CLIENT KILL` | 不提供 SQL 表的导入导出 | 不是关系库。2026-10-01 在 `192.168.100.176:16379` 读通 `PING`、未知命令报错、`SET` 停在审批。用户留空。CI 仍 ignored |
| MongoDB | 直连；认证库默认为 `admin` | 库和集合 | 样本文档 | `insertOne` / `deleteOne` / `replaceOne` 要审批 | 样本有行数上限 | 取消时关闭这次客户端 | 不提供 SQL 表的导入导出 | 样例字段是样本。2026-10-01 在 `192.168.100.176:27017` 读通 `listDatabases`、未知调用报错、`insertOne` 停在审批。CI 仍 ignored |
| SQL Server | 直连 TDS。表单里的库是 database，默认端口 1433 | 库 → schema（默认 `dbo`）→ 表/视图/函数 → 列 | 网格 | 写和 DDL 走审批卡；驳回不执行 | 表查看按页改 `OFFSET` | 第二条连接按 `@@SPID` 发 `KILL` | 同 PostgreSQL | 真机未测。不在 aarch64 测试机上安装 SQL Server |
| Oracle | 直连 thin 协议，不安装 Instant Client。表单里的库填 service name，默认端口 1521 | 服务名 → schema（用户）→ 表/视图 → 列 | 网格 | 写和 DDL 走审批卡；读语句放在只读事务里 | 同上 | 第二条会话 `ALTER SYSTEM KILL SESSION` | 同 PostgreSQL | 真机未测。不在 aarch64 测试机上安装 Oracle，也不把客户端库打进应用 |

ClickHouse 已退出下拉框，引擎表里没有这项。命名查询存在应用数据目录的 `db-queries.json`（只有连接 id、名称和 SQL），退出再打开仍可读取、改名保存和删除。密码在 `vault.bin`，目录 JSON 只有 `secret_id`。

固定阅读版本：

- DBX `89964dafe411b6ad36d3db1ac03b0915ff52627c`
- MindsHub `780bbcbb8b9367c667e9b6af2aecc8277f24c0ad`
- cowork `4114336ee0cf1a8a04c20a96f4a92f30fe059c66`
- cowork-server `cb075bdf79242d865f5e8809cedfa1debb63e519`
- anton `6b83930e510a984aa822a2cc46a2143a4e94343f`
- data-vault `37ccd07febc9c4a20bd5c1fcd4f677efac553dc9`

DBX 该版本是 85 个连接类型描述、108 个产品入口、运行 manifest 里 33 native / 47 agent / 3 external / 2 file。MindsHub 该版本 data-vault 有 33 个 handler 目录，cowork-server 有 211 份连接表单。这些数字不是同等能力的原生驱动数，也不能写成 TerminalWisely 已支持的数量。

## 引擎能力差异（Navicat Mac）

对照本地手册 `/Users/wangyunfei/Downloads/navicat_mac_en.pdf`（Navicat for Mac English，Chapter 5 Server Objects、Chapter 6 Data Editor）。实现计划：`docs/superpowers/plans/2026-10-08-engine-capability-diff.md`。共用工作台壳，按引擎声明对象树、右键、维护命令与 Redis/Mongo 视图；不跟 Designer / BI / 同步 / Backup Enterprise。

| 引擎 | 对象 / 菜单（本批） | 维护命令（本批） | Redis·Mongo 加深（本批） | 不做 |
| --- | --- | --- | --- | --- |
| PostgreSQL | 能力表驱动右键；表 Maintain 入口 | Analyze / Vacuum / Reindex → 审批 | — | Extensions UI、用户角色 |
| MySQL / MariaDB | 同上 | Analyze / Optimize → 审批 | — | Tablespace / Sequence 设计器 |
| SQLite | 同上 | Analyze / Reindex → 审批 | — | 库级 Vacuum 可后补 |
| SQL Server / Oracle | 基本 SQL 右键；维护清单后补 | 本批可不接线 | — | 完整 Maintain、Debugger |
| Redis | 仅打开/刷新；无 Truncate/Rename | — | 类型徽章、TTL 展示与 EXPIRE/PERSIST 审批 | All Data 大网格、Pub/Sub |
| MongoDB | 仅打开/刷新 | Compact 等后补 | JSON 校验、非法禁用提交 | Grid/Tree 三视图、Pipeline、GridFS |

## Navicat 18 基本层对照

对照 [Navicat 18 Windows Online Manual](https://www.navicat.com/manual/online_manual/en/navicat_18/win_manual/) 章 4–6、9、15–16；Mac PDF 见上一节。本版只做运维基本客户端缺口；企业章与设计器不在 0.0.5。

| 章 | Navicat 行为 | TW 现状 | 0.0.5 |
| --- | --- | --- | --- |
| 4 Connection | 一般项、SSL、SSH 隧道、管理连接 | 直连、TLS 开关、可选 SSH 隧道、编辑/删除保存连接 | 已有 |
| 4 HTTP Tunneling | HTTP 隧道 | 无 | 不做 |
| 5 Server Objects | 左树对象、右键打开/维护 | 左树库→schema→对象→分组→列；工具栏删表/截断/定义 | 做：对象右键（打开、定义、重命名、Empty、Truncate、刷新） |
| 5 Table/View Designer | 字段/索引/外键设计器 | 无；可建简单表与看定义 | 不做 |
| 6 Data Editor | 网格编辑、筛选排序、单元格编辑器 | 网格、排序、筛选、失焦 UPDATE、插入/删行 | 做：单元格显式置 NULL |
| 6 Empty vs Truncate | Empty 清数据不重置自增；Truncate 截断 | 仅工具栏一项，文案混用 Truncate SQL | 做：Empty=`DELETE`，Truncate=`TRUNCATE`（SQLite 二者皆 `DELETE`） |
| 9 Query | 编辑器、选区执行、补全、Explain | 编辑器、选区执行、Explain、命名查询 | 已有选区执行；补回归。不做 Query Builder / 补全 |
| 15–16 Import/Export | 多格式向导 | CSV 本页/筛选导出与导入预览 | 已有 CSV；非 CSV 不做 |
| 7–8, 10–14, 17–23 | Profiling、Masking、AI、Model、同步、BI 等 | 无 | 不做 |

## 已对照的行为

| 业务问题 | 参考 | TerminalWisely | 取舍 | 验收 |
| --- | --- | --- | --- | --- |
| 连接和对象在左侧，查询和结果在中间，AI 在右侧 | DBX `AppSidebar.vue`、`DataGrid.vue`、`AiAssistant.vue` | `DbWorkbench.tsx` 左树、查询标签、结果网格/摘要/计划，右侧现有 AI 面板 | 图表、导出、ER 留到后面的阶段，不放进当前工具栏冒充已有 | `e2e/db-workbench.spec.ts` 与 `npm run tauri dev` 走通树、标签、执行、AI |
| AI 固定在当前连接、库、schema 和选区 | DBX `AiAssistant.vue` 按会话绑定 connection/database/schema | `db_context` 带 connection、revision、engine、database、schema、selected_sql；插入 SQL 只写当前标签 | 不把整库放进提示 | 切换连接后旧标签结果被丢掉，批准 revision 对不上就拒绝 |
| 写入按语句和连接审批 | DBX `tool_approval.rs` | 现有 lease：connection_id + revision + operation + SQL | 不照搬外部 Agent 绕过桌面审批 | 已有审批回归 |
| 凭据不进模型上下文 | MindsHub 把凭据写入 0600 JSON，表单却写 stored encrypted，两者不一致 | 数据库密码、SSH 记住的密码、模型 API key 进钥匙串；目录 JSON 只留 secret_id | 不采用 MindsHub 的明文文件库 | `api_key_moves_to_secret_store`、`saved_password_tests`、数据库目录测试 |
| 连接配置不能所有引擎共用 host/user/password | DBX 连接类型 YAML；data-vault `BaseHandler` | SQLite 只保存文件路径，不写 host、端口、用户和钥匙串。其余引擎保留 host、端口、库、用户；Redis 空用户记为 `default` | 密码仍只进钥匙串 | `sqlite_save_keeps_only_the_file_path` |
| 多引擎注册而不是「非 mysql 即 postgres」 | DBX `database-drivers.manifest.json` | 下拉框只列已接通的引擎。MariaDB 保持自己的 id，走 MySQL 协议。SQL Server 走 TDS，Oracle 走 thin 协议。未知引擎不能保存 | ClickHouse 已从引擎表删除 | `mariadb_stays_distinct_and_blocked_engines_cannot_be_saved` |

## 阶段

1. 已做：目录耐久性；PostgreSQL 与 MySQL 的三栏工作台。
2. 已做：适配器契约。SQL 引擎走 AST。Redis、MongoDB 按命令动词分类，不进 SQL AST。
3. 已做：SQLite 文件连接。测试使用临时文件。DuckDB 未做。
4. 已在 firefly `192.168.100.176` 的独立 Compose `/home/firefly/terminalwisely-engines` 接通并读通：MariaDB `13307`，Redis `16379`，MongoDB `27017`。库和用户是 `twreview`（Redis 库号 `0`，MongoDB 认证库是服务器默认的 `admin`）。ClickHouse 容器若仍在那台机器上，也不再是本仓库的引擎。
5. SQL Server 与 Oracle 是本机客户端：SQL Server 用纯 Rust TDS，Oracle 用 thin 协议，不链接 Instant Client。这块 aarch64 板不安装这两种服务，真机测试保持 ignored，未测。Elasticsearch/OpenSearch、消息队列、配置中心仍未做。Snowflake、达梦、KingbaseES、GaussDB、OceanBase、TiDB 不在这批。
6. AI 跨源：各源先按自己的权限查询，再在本机合并。不假设引擎支持跨库 SQL。知识连接器和数据库分开。外部 Agent 继续走 TW MCP，拿不到凭据。

每个声称支持的引擎要有真连接、对象树、读、该引擎适用的变更审批与拒绝、错误、超时取消。图表、导入导出、ER、结构比较在对应阶段交付，不从清单里删掉。
