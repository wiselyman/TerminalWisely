# TerminalWisely 用户验收清单

> **已由 Playwright 自动覆盖**：Platform 面板、MCP、Memory 搜索、Run eval 8/8、Platform/Chat 切换、**拖拽上传 UI**（`e2e/ssh-drag-upload.spec.ts`）。  
> **已由 Docker + Rust 自动覆盖**：SSH 密码连接、SFTP 上传（`scripts/e2e-ssh-integration.sh`）。  
> 本清单仅保留自动化难以替代的场景：Tauri 原生窗口交互、K8s 真集群 Pod Shell、大文件/弱网体验。

## 准备

- [ ] 已 `./scripts/run-all-tests.sh` 全部 PASS（含 Playwright E2E + SSH live integration）
- [ ] （可选）有可用的 K8s 集群（或 k3s/kind）用于 Pod Shell 手测
- [ ] AI 模型已配置（Ollama 本地或 API Key）

---

## A. 应用壳层

| # | 步骤 | 预期 | ✓ |
|---|------|------|---|
| A1 | 启动应用，切换中/英文 | 界面文案切换，无报错 | |
| A2 | 打开设置，查看版本号 | 显示 v0.0.x | |
| A3 | 调整侧边栏宽度 / 折叠 | 布局正常，刷新后保持 | |

## B. SSH 终端

| # | 步骤 | 预期 | ✓ |
|---|------|------|---|
| B1 | 新建 SSH 连接并登录 | 终端出现 shell 提示符 | **自动**（`e2e-ssh-integration.sh`） |
| B2 | 执行 `ls -la`，点击目录名 | 自动 cd 进入 | |
| B3 | 点击文件名 | 打开预览或下载 | |
| B4 | 从桌面拖拽文件到终端 | 上传到当前目录 | **自动**（Playwright + Rust SFTP） |
| B5 | 断开网络后按 Enter | 显示重连 overlay，重连成功 | |
| B6 | Tab 右键：关闭其他 / 关闭左侧 | Tab 管理正常 | |

## C. 文件预览与 Local FS

| # | 步骤 | 预期 | ✓ |
|---|------|------|---|
| C1 | 预览 Markdown / 文本 / 图片 | 正确渲染 | |
| C2 | 编辑文本预览并保存 | 远程文件更新 | |
| C3 | 打开 Local FS 面板 | 本地+远程双树可见 | |
| C4 | Find in files 搜索关键字 | 结果可打开预览 | |
| C5 | Task manager 查看进程并 kill 测试进程 | 进程列表刷新 | |

## D. 传输与状态栏

| # | 步骤 | 预期 | ✓ |
|---|------|------|---|
| D1 | 上传大文件 (>10MB) | 状态栏显示进度与速度 | |
| D2 | 取消传输 | 传输停止，无卡死 | |
| D3 | 连接 SSH 后观察状态栏 | CPU/内存等指标更新 | |

## E. Kubernetes 工作台

| # | 步骤 | 预期 | ✓ |
|---|------|------|---|
| E1 | 导入 kubeconfig，选择集群 | 侧边栏显示 k8s 资源树 | |
| E2 | 浏览 Pods 列表，筛选 namespace | 列表与集群一致 | |
| E3 | 查看 Pod 详情 / YAML | YAML 可复制 | |
| E4 | 查看 Pod 日志 | 日志流正常 | |
| E5 | Pod Shell（如可用） | 可 exec 进入 | |
| E6 | Overview 页 | Pending/Running 统计正确 | |

## F. AI Engineer — Linux 模式

| # | 步骤 | 预期 | ✓ |
|---|------|------|---|
| F1 | SSH Tab 下打开 AI 面板 | 显示 Linux Engineer | |
| F2 | 发送「查看 8888 端口占用」 | Agent 调用 terminal_exec，给出结论 | |
| F3 | 出现审批卡片时点击批准 | 命令执行，继续回复 | |
| F4 | 新建对话 / 切换历史线程 | 多线程正常 | |
| F5 | 切换安全模式 Safe / Autonomous | 行为符合模式说明 | |

## G. AI Engineer — K8s 模式

| # | 步骤 | 预期 | ✓ |
|---|------|------|---|
| G1 | K8s 集群选中时打开 AI 面板 | 显示 K8S Engineer | |
| G2 | 发送「列出 demo namespace 的 pods」 | 调用 k8s_list，中文分析状态 | |
| G3 | 观察 Run trace | 可见 model/tool 耗时 | |

## H. AI 平台面板

> ✅ **自动化**：`npm run test:e2e` — Platform、MCP、Memory、Run eval 8/8、Toggle

| # | 步骤 | 预期 | ✓ |
|---|------|------|---|
| H1 | （可选）有 DISPLAY 时跑 `python3 scripts/e2e-desktop-tauri.py` | 原生 Tauri 窗口同样通过 | |

## I. 回归热点（新功能易破坏旧功能）

| # | 步骤 | 预期 | ✓ |
|---|------|------|---|
| I1 | AI 面板打开时切换 SSH Tab | 上下文绑定正确 | |
| I2 | K8s 工作台 + AI 同时打开 | 无布局重叠/卡死 | |
| I3 | 预览面板 + AI 面板同时打开 | 均可操作 | |
| I4 | 关闭 AI 面板再打开 | 历史消息保留 | |

---

## 签字

| 项目 | 值 |
|------|-----|
| 测试人 | |
| 版本 | |
| 日期 | |
| 结果 | PASS / FAIL |
| 备注 | |
