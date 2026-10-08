# 本地存储与数据库工作台

已丢失的主机无法从侧栏布局还原。布局只剩分组和书签 id，没有地址、用户和密钥。本计划保证以后不再这样丢，不编造那些记录。

## 存储

两套目录都会被收成一份：

- 正本：`app.path().app_data_dir()`，即 `com.wangyunfei.terminalwisely`。
- 镜像：`~/.terminal-wisely/catalog/`。镜像不含密码和 API key。
- 写入：同目录临时文件，`fsync`，再改名。改名前把上一份正本复制为同名 `.bak`。
- 拒绝把非空目录写成空。用户在界面里删掉最后一条时，调用方显式允许变空。启动过程不得保存空列表。正本是合法空文件、镜像也没有记录时，不从 `.bak` 复活。
- 启动时：正本缺失或为空、镜像或 `.bak` 有记录，则恢复正本，并在界面提示已从备份恢复。旧的 `Application Support/TerminalWisely` 里还在的 kubeconfig 索引和副本迁入正本，只迁一次。
- SSH 记住的密码、数据库密码、模型 API key 只进钥匙串，JSON 只留 `secret_id`。读取旧 JSON 时把明文秘密迁入钥匙串再写回，不 trim。钥匙串缺失时连接仍显示，连接时再问密码。
- 侧栏分组另存一份到正本 `entity-layout.json`，并随镜像走。
- `clear_dir_for_rebuild` 只允许删除 `ai-engineer` 下的 Python 环境目录。

覆盖文件：`connections.json`、`device-history.json`、`db-connections.json`、`ai-engineer.json`、`k8s-kubeconfig-paths.json`、导入的 kubeconfig 副本、`entity-layout.json`。浏览器历史和聊天记录沿用现有文件，改为同一套原子写入。

## 数据库工作台

只对已有 PostgreSQL / MySQL 驱动做真：

- 左栏：搜索框；连接可展开为库 → schema → 表，表再展开列。视图、函数作为同类分组。空状态是「还没有连接」。「新建连接」只打开弹窗。
- 中栏：查询标签，可新建、关闭、切换。标签绑定当前连接、库和 schema。工具栏有执行和取消。执行选区沿用已有 `chosenSql`。下方结果用子页：数据网格、执行摘要。执行计划走现有 `db_explain`。
- 右栏：现有 AI 工程师面板。上下文固定为当前标签的连接、库、schema 和选中 SQL。插入 SQL 只写入这个标签。切换连接使旧上下文和批准失效。
- 弹窗字段仍按驱动来。PostgreSQL / MySQL 要 host、端口、库、用户、密码、TLS、可选已连接 SSH 隧道。

图表、导出、ER、结构比较和新引擎不在这一批里实现。对标矩阵见 `docs/superpowers/specs/2026-09-30-engine-matrix.md`。MariaDB 在独立验收前不声称支持。
