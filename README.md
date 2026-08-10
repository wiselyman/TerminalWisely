# TerminalWisely

**用自然语言修 Linux。** 跨平台桌面终端：本地 Shell + SSH/SFTP，以及内置的 **AI Linux Engineer**——在已连接的主机上用中文/英文描述问题，由 AI 提出命令、在安全策略下执行与验证。

当前版本：**v1.0.0**

[下载安装包](https://github.com/wiselyman/TerminalWisely/releases) · [自行构建](./BUILD.md) · [变更日志](./CHANGELOG.md)

---

## 为什么是 1.0.0

运维日常大量时间花在「想起该敲哪条命令、会不会敲错、会不会把自己锁在机房外」。TerminalWisely 1.0 把终端、文件操作和 **带审批的 AI 排障** 放在同一窗口：你说目标，AI 在真实 SSH 会话里查、改、验；危险操作必须你点批准。

---

## AI Linux Engineer：自然语言解决 Linux 问题

打开右侧工具轨的 **AI 工程师**，选中某台已连接主机，直接描述现象即可。模型通过侧车（Python sidecar）调用本机终端捕获通道在**那台机器**上执行，而不是空想答案。

### 你可以这样说

| 你说 | AI 大致会做 |
|------|-------------|
| 「磁盘又满了，帮我找出最大的目录」 | `df` / `du` 分层排查，只读命令自动跑；要动数据时再请你批准 |
| 「8080 被谁占了，能不能腾出来」 | `ss`/`lsof` 定位进程，结束进程前弹出确认 |
| 「nginx 502 了」 | 查状态、错误日志、上游与端口，给出结论与下一步 |
| 「Docker 占了几十 G，看看是镜像还是 overlay」 | `docker system df`、镜像/容器列表等只读探查 |
| 「这台机防火墙开了没有」 | `which`/`systemctl is-active` 等探测，**不会**为了查状态去改 iptables |

对话按主机隔离；可配置 OpenAI 兼容接口（含本地 vLLM / Ollama）。运行中可停止或插话纠正。

### 安全如何保证（重点）

**模型只负责提议；能不能执行由 Harness 说了算。**

1. **能力策略引擎（非「提到某个词就报警」）**  
   命令先拆成叶命令、剥掉 `sudo`/`xargs`，再按 argv 查表打上能力标签（`read` / `write` / `delete` / `net_mutate` / …），映射到 R0–R4。  
   产品默认表在 [`agent-sidecar/policy/`](./agent-sidecar/policy/)；你可在数据目录放 `overrides.yaml` 覆盖。

2. **分级处置**  
   - **R0 只读**：自动执行（如 `du`、`systemctl status`、防火墙**是否安装**的探测）  
   - **R2/R3 变更**：必须在 UI 上**精确批准**这条命令  
   - **R4 灾难级**：直接拒绝（如 `rm -rf /`）

3. **未知命令偏严**  
   策略里没有的二进制，只要不是「纯 flag 探测」，默认要批准（避免 `./install.sh /opt/...` 静默跑掉）。

4. **网络防锁死**  
   真正可能改防火墙 / SSH / 路由的变更，批准后会套 **定时回滚**（先备份相关配置，约一分钟后自动恢复；成功则取消回滚），降低把自己踢下线的风险。

5. **Sudo 与密钥**  
   需要提权时走应用内密码流程；API Key 等存在本机安全存储，不进仓库。

6. **执行边界**  
   AI 只能通过已建立的终端/SSH 会话操作；没有单独的「静默 root 通道」。

设计说明见 [`docs/superpowers/specs/2026-08-09-capability-policy-engine-design.md`](./docs/superpowers/specs/2026-08-09-capability-policy-engine-design.md)。

---

## 终端与文件（原有能力）

### 文件与目录

- **拖拽上传**：拖入 SSH 终端或标签，SFTP 到当前远程目录  
- **点击进目录 / 预览**：`ls` 里点目录或文件；文本可编辑与搜索  
- **快捷下载**：Ctrl/Cmd + 点击路径；或右键下载  
- **右键菜单（SSH）**：下载、跨服发送、编辑预览、查看大小、压缩/解压  
- **跨服发送**：右键或 Ctrl/Cmd + 拖到目标 SSH 标签  

### 会话与工作区

- 本地 / SSH 多标签、书签、中英文界面  
- Find、任务管理器、命令导航（90+ 运维命令，插入终端不自动执行）  
- 服务器资源：CPU / 内存 / 磁盘 / 网络  

首次启动无页签时显示功能介绍；打开终端后进入工作区。

## 常用操作

| 操作 | 方式 |
|------|------|
| AI 排障 | 右侧工具轨「AI 工程师」；对当前主机用自然语言提问 |
| 批准危险命令 | 批准卡片中查看命令与风险等级后点「批准」/「拒绝」 |
| 进入目录 | 单击 `ls` 中的目录名 |
| 预览文件 | 单击 `ls` 中的文件路径 |
| 下载 / 上传 | Ctrl/Cmd+点击；拖拽；右键 |
| 命令导航 | 贴边工具栏命令图标 |

## 快速开始

1. 侧栏打开 **本地终端** 或连接 **远程 SSH**。  
2. 打开右侧 **AI 工程师**，在设置里填入 OpenAI 兼容的 Base URL / 模型（本地模型可免 Key）。  
3. 用自然语言描述问题；只读步骤会自动跑，变更步骤按提示批准。  
4. 需要文件操作时继续用拖拽、点击与右键菜单。  

## 下载与自行构建

预编译安装包由 GitHub Actions 在打 tag 后自动构建，见 [Releases](https://github.com/wiselyman/TerminalWisely/releases)（Windows / macOS / Linux，含 x86_64 与 ARM64）。

AI 侧车为 Python：发行包已打入 `agent-sidecar` 源码；本机需可用的 `python3`，并安装依赖：

```bash
pip install -r agent-sidecar/requirements.txt
```

（开发时在仓库根目录执行即可；打包路径由应用定位。）

自行编译请参考 [BUILD.md](./BUILD.md)。版本变更见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

本项目采用 [MIT License](./LICENSE) 开源。
