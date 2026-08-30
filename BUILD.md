# TerminalWisely — 构建与开发

本文档面向贡献者与自行编译安装的用户。产品功能说明见 [README.md](./README.md)（English）/ [README.zh-CN.md](./README.zh-CN.md)（中文）。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19、TypeScript、Vite、xterm.js |
| 后端 | Rust、Tauri 2、Tokio |
| SSH / SFTP | russh、russh-sftp |

## 环境要求

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) 1.77+
- 各平台依赖见 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)

## 开发

```bash
npm install
npm run hooks:install   # 启用 .githooks（阻止 Cursor 署名 + push 前全量测试）
npm run tauri dev
```

## 测试（必读）

**每次开发新功能：必须添加测试，并在提交/推送前执行全量回归。**

```bash
./scripts/run-all-tests.sh    # 或 npm run test:all
```

包含：前端 Vitest、静态 smoke、Rust `cargo test`、Sidecar pytest、Eval 8/8、Playwright UI E2E。

| 命令 | 说明 |
|------|------|
| `npm test -- --run` | 仅前端单元 |
| `npm run test:smoke` | 静态 wiring / i18n |
| `npm run test:e2e` | Playwright（Platform / Eval / MCP） |
| `npm run test:all` | 全量（同 `run-all-tests.sh`） |

- 功能与测试映射：`docs/TEST_MATRIX.md`
- Agent 规范：`AGENTS.md`
- `git push` 默认触发 pre-push 全量测试；紧急跳过：`TW_SKIP_TESTS=1 git push`（**不可用于合 PR**）

### Git 署名（必读）

本仓库**只允许 Yunfei Wang / wiselyman** 作为作者。Cursor 会在 Agent 提交时自动插入 `Co-authored-by: Cursor <cursoragent@cursor.com>`，导致 GitHub Contributors 出现 `cursoragent`。

- 首次克隆后执行：`npm run hooks:install`（设置 `core.hooksPath=.githooks`）
- 推送前可自检：`npm run hooks:verify`
- CI 的 `author-guard` 任务会扫描整条历史，含 Cursor 署名则失败

**不要让 Cursor Agent 直接 `git commit`**；若由 Agent 代提交，必须在 message 中无任何 Cursor trailer，且 author 为 `wiselyman2008@gmail.com`。

## 构建安装包

```bash
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/`。

### 应用图标

源文件为 `src-tauri/icons/app-icon.svg`（深色底 + 蓝色 `>` 与绿色光标，象征终端提示符）。修改后重新生成各平台尺寸：

```bash
npx tauri icon src-tauri/icons/app-icon.svg -o src-tauri/icons
cp src-tauri/icons/128x128.png public/icon.png
```

## CI

- **CI**（`.github/workflows/ci.yml`）：4 个 runner 矩阵 — **linux-x86_64**、**linux-aarch64**、**macos-aarch64**、**windows-x86_64**；各跑 smoke、Vitest、build、Rust、Sidecar pytest；Linux/macOS 另跑 eval + Playwright（Ubuntu x64/ARM）；macOS 交叉检查 Intel triple，Windows 交叉检查 ARM64 triple。
- **Release**（`.github/workflows/release.yml`）：打 tag 时构建全部 OS×架构安装包。

## 发布安装包（GitHub Actions）

Release 工作流会构建以下产物：

| 平台 | 架构 | 格式 |
|------|------|------|
| macOS | Apple Silicon (aarch64) | `.app` `.dmg` |
| macOS | Intel (x86_64) | `.app` `.dmg` |
| Linux | x86_64 | `.deb` `.rpm` `.AppImage` |
| Linux | ARM64 | `.deb` `.rpm` |
| Windows | x86_64 | `.msi` NSIS `.exe` |
| Windows | ARM64 | NSIS `.exe` |

> Windows ARM64 不支持 MSI，仅生成 NSIS 安装包（Tauri 限制）。
> Linux ARM64 暂不提供 `.AppImage`（linuxdeploy-aarch64 在 CI 中不稳定）；请使用 `.deb` 或 `.rpm`。

### 在线升级签名（必配）

应用内更新依赖 Tauri updater 的 minisign 签名（与 Apple/Windows 代码签名无关）。仓库 Actions 需要这两个 Secrets：

| Secret | 说明 |
|--------|------|
| `TAURI_SIGNING_PRIVATE_KEY` | `tauri signer generate` 产出的私钥全文 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 私钥密码；无密码时可为空字符串 |

公钥写在 `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`。发布结束后 `enrich_latest` job 会上传带 Linux deb/rpm 自定义 target 的 `latest.json`。

本地可跑 `python3 scripts/test-enrich-latest-json.py` 校验平台 key 映射（不访问网络）。

#### 在线升级真机验收（下一版本起）

`v0.0.1` 发布时尚未接入 updater 签名，故没有 `latest.json` / `.sig`。从**含本功能的第一个 tag**起，按下列步骤验收：

1. Release 资产中应有各平台安装包、对应 `.sig`，以及根目录 `latest.json`（含 `linux-*-deb` / `linux-*-rpm`）。
2. 安装**旧版本** → 启动约 4s 后应弹出更新提示（版本号 + notes）；点「稍后」不下载。
3. 设置 → 关于 →「检查更新」→ 确认后才下载；进度条可见；失败可打开 Releases。
4. macOS：装完提示重启，点重启后为新版本。
5. Windows NSIS：确认后 installer 接管（可能退出应用）。
6. Linux：AppImage 装走 AppImage；deb/rpm 装会弹出系统密码框，装完提示重启。

### 触发方式

1. **打版本 tag**（推荐）  
   1. 更新 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 版本号  
   2. 更新 [`README.md`](./README.md) 顶部 **当前版本** 号，并补充本次用户可见的新功能（若有）  
   3. **编写 [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)**（会出现在 GitHub Release 描述顶部，即更新说明红框位置）  
   4. 同步更新 [`CHANGELOG.md`](./CHANGELOG.md)，并将该版本正文归档到 `release-notes/vX.Y.Z.md`  
   5. 提交后打 tag 并推送：
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

2. **手动触发**  
   GitHub → Actions → Release → Run workflow

Release 默认直接发布（非 Draft），可在 [Releases](https://github.com/wiselyman/TerminalWisely/releases) 页面查看产物。

### 发布验收清单

CI 全绿只代表「能编出来」，以下需在**真实机器**上各测一遍（约 5 分钟/平台）：

- [ ] 应用能启动，欢迎页/侧栏正常（无本地终端入口）；侧栏收起后工作区仍可见
- [ ] SSH 能连接，执行 `ls`、`docker ps` 正常
- [ ] 拖拽本机文件到 SSH 窗口能上传
- [ ] 拖拽本机文件到 SSH 标签能上传到该会话
- [ ] Ctrl/Cmd + 点击文件路径能下载到本机
- [ ] Shift + 点击文件路径能发送到另一 SSH 会话
- [ ] Ctrl/Cmd + 拖动远程文件路径到另一 SSH 标签能跨服发送
- [ ] AI 工程师可对已连接 SSH 会话执行 `terminal_exec`
- [ ] 关闭再打开应用无崩溃

| 平台 | 建议测试机 |
|------|-----------|
| Windows x64 | 日常 PC |
| Windows ARM | Surface / Snapdragon 设备 |
| macOS Apple Silicon | M 系列 Mac |
| macOS Intel | Intel Mac 或 Rosetta 环境 |
| Linux x64 | Ubuntu 22.04+ / Fedora |
| Linux ARM64 | ARM 服务器或树莓派 64 位 |

### Linux 窗口全黑 / 全白

部分 Linux 显卡驱动与 WebKitGTK 的 DMABUF 渲染路径不兼容，窗口能打开但内容不显示（x64 正常、ARM64 黑屏也可能由此引起）。v0.5.13 起应用启动时会自动设置 `WEBKIT_DISABLE_DMABUF_RENDERER=1`。

若仍异常，可在终端手动测试：

```bash
WEBKIT_DISABLE_DMABUF_RENDERER=1 terminal-wisely
# 仍不行再试：
WEBKIT_DISABLE_COMPOSITING_MODE=1 terminal-wisely
```

详见 [Tauri Linux 图形问题](https://v2.tauri.app/develop/debug/linux-graphics/)。

未签名安装包在 macOS / Windows 首次打开会有安全提示，属正常现象。

### 仓库权限

若出现 `Resource not accessible by integration`，到仓库 **Settings → Actions → General → Workflow permissions**，勾选 **Read and write permissions**。

## 项目结构（简要）

```
TerminalWisely/
├── src/                 # React 前端
├── src-tauri/           # Tauri / Rust 后端
├── README.md            # 产品介绍
└── BUILD.md             # 本文档
```
