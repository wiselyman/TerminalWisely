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
| Linux | ARM64 | `.deb` `.rpm` `.AppImage` |
| Windows | x86_64 | `.msi` NSIS `.exe` |
| Windows | ARM64 | NSIS `.exe` |

> Windows ARM64 不支持 MSI，仅生成 NSIS 安装包（Tauri 限制）。

### 触发方式

1. **打版本 tag**（推荐）  
   确保 `src-tauri/tauri.conf.json` 里的 `version` 已更新，然后：
   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

2. **手动触发**  
   GitHub → Actions → Release → Run workflow

Release 默认为 **Draft**，可在 [Releases](https://github.com/wiselyman/TerminalWisely/releases) 页面检查产物后点击 Publish。

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
