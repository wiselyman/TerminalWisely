# TerminalWisely — 构建与开发

本文档面向贡献者与自行编译安装的用户。产品功能说明见 [README.md](./README.md)。

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 19、TypeScript、Vite、xterm.js |
| 后端 | Rust、Tauri 2、Tokio |
| 本地 PTY | portable-pty |
| SSH / SFTP | russh、russh-sftp |

## 环境要求

- [Node.js](https://nodejs.org/) 20+
- [Rust](https://www.rust-lang.org/tools/install) 1.77+
- 各平台依赖见 [Tauri 前置条件](https://v2.tauri.app/start/prerequisites/)

## 开发

```bash
npm install
npm run tauri dev
```

## 构建安装包

```bash
npm run tauri build
```

产物位于 `src-tauri/target/release/bundle/`。

## CI

- **CI**（`.github/workflows/ci.yml`）：每次 push / PR 在 Windows、macOS、Linux 上跑编译检查。
- **Release**（`.github/workflows/release.yml`）：打 tag 或手动触发，构建全部安装包并上传到 GitHub Releases。

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

### 触发方式

1. **打版本 tag**（推荐）  
   1. 更新 `package.json`、`src-tauri/Cargo.toml`、`src-tauri/tauri.conf.json` 版本号  
   2. **编写 [`RELEASE_NOTES.md`](./RELEASE_NOTES.md)**（会出现在 GitHub Release 描述顶部，即更新说明红框位置）  
   3. 同步更新 [`CHANGELOG.md`](./CHANGELOG.md)  
   4. 提交后打 tag 并推送：
   ```bash
   git tag v0.2.0
   git push origin v0.2.0
   ```

2. **手动触发**  
   GitHub → Actions → Release → Run workflow

Release 默认直接发布（非 Draft），可在 [Releases](https://github.com/wiselyman/TerminalWisely/releases) 页面查看产物。

### 发布验收清单

CI 全绿只代表「能编出来」，以下需在**真实机器**上各测一遍（约 5 分钟/平台）：

- [ ] 应用能启动，欢迎页/侧栏正常
- [ ] 本地终端能输入命令并看到输出
- [ ] SSH 能连接，执行 `ls`、`docker ps` 正常
- [ ] 拖拽文件到 SSH 窗口能上传
- [ ] 拖拽文件到 SSH 标签能上传到该会话
- [ ] Ctrl/Cmd + 点击文件路径能下载
- [ ] Shift + 点击文件路径能发送到另一 SSH 会话
- [ ] Ctrl/Cmd + 拖动远程文件路径到另一 SSH 标签能跨服发送
- [ ] 关闭再打开应用无崩溃

| 平台 | 建议测试机 |
|------|-----------|
| Windows x64 | 日常 PC |
| Windows ARM | Surface / Snapdragon 设备 |
| macOS Apple Silicon | M 系列 Mac |
| macOS Intel | Intel Mac 或 Rosetta 环境 |
| Linux x64 | Ubuntu 22.04+ / Fedora |
| Linux ARM64 | ARM 服务器或树莓派 64 位 |

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
