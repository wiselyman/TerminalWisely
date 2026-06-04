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

GitHub Actions 会在 Windows、macOS（x86_64 / aarch64）、Linux（x86_64 / aarch64）上执行构建与冒烟验证。

## 项目结构（简要）

```
TerminalWisely/
├── src/                 # React 前端
├── src-tauri/           # Tauri / Rust 后端
├── README.md            # 产品介绍
└── BUILD.md             # 本文档
```
