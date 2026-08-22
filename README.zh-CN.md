# TerminalWisely

[English](./README.md) | **中文**

**用自然语言修 Linux。** 跨平台桌面终端：SSH/SFTP，以及内置的 **AI Linux Engineer**——在已连接的主机上用中文/英文描述问题，由 AI 提出命令、在安全策略下执行与验证。

当前版本：**v1.0.0**

[下载安装包](https://github.com/wiselyman/TerminalWisely/releases) · [自行构建](./BUILD.md) · [变更日志](./CHANGELOG.md)

<p align="center">
  <img src="./docs/images/promo-ai-engineer.jpg" alt="TerminalWisely — SSH 终端与 AI Linux Engineer 并排：自然语言查显存与进程" width="920" />
</p>

<p align="center">
  <img src="./docs/images/promo-model-settings.jpg" alt="TerminalWisely — AI 模型配置：多 profile，一键切换 Active" width="920" />
</p>

---

## AI Linux Engineer：自然语言解决 Linux 问题

打开标题栏的 **AI 工程师**，选中某台已连接主机，直接描述现象即可。模型通过侧车在**当前 SSH 会话**上执行与验证——查的是真机，不是空想答案。

### 支持接入哪些大模型

设置里按 **模型配置（Profile）** 管理，可保存多套并一键切换 Active。四种接入类型覆盖常见在线 API 与本地离线部署：

| 类型 | 适合什么 | 说明 |
|------|----------|------|
| **OpenAI 兼容** | 绝大多数云端与自建服务 | 填 Base URL（`/v1`）+ Key + 模型名。兼容 OpenAI、DeepSeek、通义 / 智谱等兼容网关，以及 **vLLM、LM Studio、LocalAI** 等自建 OpenAI 协议端点 |
| **Ollama** | 本机 / 内网离线模型 | 直连本机 Ollama，通常**无需 API Key**；适合内网、气隙或本地试跑 |
| **Anthropic 兼容** | Claude 系经兼容网关 | 走提供 Anthropic 模型的 OpenAI 兼容网关 |
| **Gemini** | Google Gemini | 使用 Gemini 的 OpenAI 兼容端点 |

多数「网上能买到的」或「自己用 vLLM / Ollama 拉起来的」模型，只要提供 **OpenAI 风格 Chat Completions**（或上述专用类型），都可以接到 AI Linux Engineer，无需改客户端。

### Agent 技术特点与能力

AI Linux Engineer 不是聊天窗口里贴一段「建议命令」——它是跑在应用内的 **运维 Agent**，围绕已连接主机闭环工作：

1. **真机会话执行**  
   通过应用已有的 SSH/终端捕获通道下发命令（`terminal_exec`），不另开一套静默登录；你看到的终端与 AI 操作的是同一台机。

2. **多工具闭环**  
   - 在主机上执行与读回输出  
   - **向你提问**（`ask_user`）澄清目标，提问不等于批准变更  
   - **网页检索 / 拉取文档**（`web_search` / `web_fetch`）作参考；外部内容只当数据，不当权限  
   - 需要时整理操作计划（`submit_ops_plan`）

3. **动态排查，而非写死剧本**  
   未知问题靠「观察 → 假设 → 再执行」推进；不依赖硬编码故障树。只读步骤可自动跑；写改删、网络变更等必须你在 UI **精确批准**（目标变了批准失效）。

4. **安全由 Harness 裁决，不靠模型自觉**  
   策略引擎按命令能力定级（只读 / 变更 / 灾难级）；未知二进制偏严；防火墙 / SSH 等危险变更可带**定时回滚**。你始终可以 **停止 AI**。

5. **按主机隔离的对话与可控运行**  
   会话按服务器分桶；支持历史会话、运行中停止或插话纠正；可切换安全模式（如更严的生产二次确认）。

### 你可以这样说

| 你说 | AI 大致会做 |
|------|-------------|
| 「磁盘又满了，帮我找出最大的目录」 | `df` / `du` 分层排查，只读命令自动跑；要动数据时再请你批准 |
| 「8080 被谁占了，能不能腾出来」 | `ss`/`lsof` 定位进程，结束进程前弹出确认 |
| 「nginx 502 了」 | 查状态、错误日志、上游与端口，给出结论与下一步 |
| 「Docker 占了几十 G，看看是镜像还是 overlay」 | `docker system df`、镜像/容器列表等只读探查 |
| 「这台机防火墙开了没有」 | `which`/`systemctl is-active` 等探测，**不会**为了查状态去改 iptables |
| 「现在显存占用情况」 | 在 GPU 主机上跑 `nvidia-smi` 等，汇总占用与进程 |

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

---

## 其他亮点

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
| AI 排障 | 标题栏「AI 工程师」；对当前主机用自然语言提问 |
| 批准危险命令 | 批准卡片中查看命令与风险等级后点「批准」/「拒绝」 |
| 进入目录 | 单击 `ls` 中的目录名 |
| 预览文件 | 单击 `ls` 中的文件路径 |
| 下载 / 上传 | Ctrl/Cmd+点击；拖拽；右键 |
| 命令导航 | 贴边工具栏命令图标 |

## 快速开始

1. 侧栏连接 **远程 SSH**。  
2. 打开右侧 **AI 工程师**，在设置里填入 OpenAI 兼容的 Base URL / 模型（本地模型可免 Key）。  
3. 用自然语言描述问题；只读步骤会自动跑，变更步骤按提示批准。  
4. 需要文件操作时继续用拖拽、点击与右键菜单（本机文件可拖到 SSH 窗口上传）。  

## 下载与自行构建

预编译安装包由 GitHub Actions 在打 tag 后自动构建，见 [Releases](https://github.com/wiselyman/TerminalWisely/releases)（Windows / macOS / Linux，含 x86_64 与 ARM64）。

AI 侧车随应用分发，并内嵌独立 Python 运行时。首次打开「AI 工程师」时，应用会在本机数据目录**自动**创建私有环境并安装依赖（界面提示进度，无需用户执行 pip）。

自行编译请参考 [BUILD.md](./BUILD.md)。版本变更见 [CHANGELOG.md](./CHANGELOG.md)。

## 许可证

本项目采用 [MIT License](./LICENSE) 开源。
