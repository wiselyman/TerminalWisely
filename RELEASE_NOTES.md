# TerminalWisely v0.0.5

## English

Hosts, clusters, and databases in one window. The sidebar is three surfaces. The title-bar AI follows whichever one is open, and each object keeps its own chat. Home is the welcome page and does not show a chat.

### Highlights

- **Databases** — direct connections to PostgreSQL, MySQL, MariaDB, SQLite, SQL Server, Oracle, MongoDB, and Redis. One service, one tab, one chat
- **Table tabs** show the database and schema on one line. After you run your own SQL, a restore icon returns the table’s default data. Editing the statement does not change the grid until you run
- **Groups** — database connections start under Ungrouped. Host groups are not copied onto the database list
- **AI** follows the open host, cluster, or database service. Read-only work can run; changes wait for approval. STOP ends the run

Installers: Windows, macOS (arm64 + x64), Linux (deb / rpm / AppImage where available).

### macOS

If macOS says the app is damaged and should be moved to the Trash, it is the download quarantine flag. After installing to `/Applications`:

```bash
xattr -cr /Applications/TerminalWisely.app
```

---

## 中文

主机、集群和数据库，在同一个窗口。侧栏分成三块。标题栏的 AI 跟到打开的那一块，每个对象有自己的聊天。Home 是欢迎页，不显示聊天。

### 要点

- **数据库** — 直接连接 PostgreSQL、MySQL、MariaDB、SQLite、SQL Server、Oracle、MongoDB、Redis。一个服务一个页签、一份聊天
- **表页签** 同一行标出库和 schema。执行自己的 SQL 之后，恢复图标回到这张表的默认数据。只改语句、不点执行，表格不动
- **分组** — 数据库连接先放在未分组。主机的分组不会抄到数据库列表
- **AI** 跟到已打开的主机、集群或数据库服务。只读可以自己跑；变更要批准。STOP 停掉这次运行

安装包：Windows；macOS（arm64 / x64）；Linux（deb / rpm / AppImage，视平台而定）。

### macOS

若提示「TerminalWisely」已损坏，无法打开，你应该将它移到废纸篓：应用没有损坏，是下载隔离属性。放入「应用程序」后执行：

```bash
xattr -cr /Applications/TerminalWisely.app
```
