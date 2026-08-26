# TerminalWisely

<p align="center">
  <img src="./docs/images/app-icon.svg" alt="TerminalWisely" width="160" height="160" />
</p>

[English](./README.md) | **中文**

**SSH 终端 + AI Linux Engineer。** 连接服务器，在可视化工作区里管理文件，用自然语言描述问题——内置 Agent 在**当前会话**上排查，只读检查自动执行，任何会改动系统的操作都会先请你批准。

[下载安装包](https://github.com/wiselyman/TerminalWisely/releases) · [自行构建](./BUILD.md)

<p align="center">
  <img src="./docs/images/promo-ai-engineer.jpg" alt="SSH 终端与 AI 工程师" width="920" />
</p>

---

## 能做什么

| 模块 | 能力 |
|------|------|
| **终端** | 多标签 SSH、书签、断线重连、中英文界面 |
| **文件** | 拖拽上传、`ls` 点击进目录或预览、下载、压缩、跨服务器发送 |
| **AI 工程师** | 对已连接主机自然语言排障；按服务器保存对话 |
| **模型** | OpenAI 兼容、Olloma、Anthropic 兼容网关、Gemini |
| **安全** | 命令能力分级（只读 / 变更 / 拒绝）；批准卡片；随时停止 |
| **可观测** | 状态栏显示 CPU、内存、磁盘读写、网络 |

<p align="center">
  <img src="./docs/images/promo-model-settings.jpg" alt="模型配置" width="920" />
</p>

---

## AI Linux Engineer

点击标题栏 **AI 工程师**，选择已连接的主机，直接说需求——磁盘满了、端口被占、服务挂了、显存多少，等等。

- **同一会话** — 走你已有的 SSH 连接，不另开静默登录。  
- **先看证据** — 在真机上读输出再下结论。  
- **你说了算** — 只读探测可自动跑；写删改、网络变更必须在 UI 上对**这条命令**点批准。  
- **自带模型** — 设置里保存多套 Profile（云端或本地），一键切换当前模型。

### 可以这样问

| 你说 | 它会 |
|------|------|
| 「磁盘满了，找大目录」 | `df` / `du` 逐层查 |
| 「8080 谁占着」 | 查监听与进程；结束进程需批准 |
| 「nginx 502」 | 状态、日志、上游检查 |
| 「现在显存多少」 | `nvidia-smi` 等只读命令 |

---

## 终端与文件

- **上传** — 文件拖到终端或标签 → SFTP 到当前目录  
- **进目录** — 点击 `ls` 里的目录名  
- **预览编辑** — 点击文件路径；文本支持高亮与搜索  
- **下载** — Ctrl/Cmd + 点击路径，或右键菜单  
- **跨服发送** — 右键路径，或拖到另一个 SSH 标签  
- **命令导航** — 90+ 运维命令片段插入终端（不自动执行）

---

## 快速开始

1. 侧栏添加 SSH 主机并连接。  
2. 可选：打开 **AI 工程师** → 设置 → 添加模型 Profile（Base URL + 模型名；Ollama 通常免 Key）。  
3. 照常使用终端；需要排障时用自然语言提问。  
4. 对标记为「系统变更」的命令选择批准或拒绝。

---

## 下载

**Windows**、**macOS**（Apple Silicon / Intel）、**Linux**（deb、rpm、AppImage；x86_64 / ARM64）安装包见 [Releases](https://github.com/wiselyman/TerminalWisely/releases)。

AI 运行时已打包在应用内。首次打开 AI 工程师时，会在后台自动完成依赖安装（界面有进度提示）。

---

## 许可证

[MIT](./LICENSE)
