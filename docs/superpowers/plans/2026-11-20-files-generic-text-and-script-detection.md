# Files generic text and script detection

## 要保住的旧行为

- 已知文本、Markdown、图片、PDF、Office、压缩包和媒体仍走现有预览/编辑处理器。
- 本机与 SSH 文件仍按当前目标打开；SSH 文件操作继续使用当前会话。
- 已有 `.sh` 右键运行能力继续可用；普通非脚本文件不显示运行入口。
- 二进制、无效 UTF-8 和超出 2 MiB 文本限制的文件不能作为可编辑文本打开。

## 架构

- `src-tauri/src/preview.rs`: 未知远程类型通过有上限的 SFTP 原始字节读取并作 UTF-8/控制字节判定，避免 exec 输出 lossy 解码后误判。
- `src-tauri/src/fs_local.rs` 与 `commands/mod.rs`: 提供本机文件脚本头探测 API，仅读取首行并返回 POSIX 执行位；远程脚本头通过新命令读取当前 SSH 文件的首行，避免前端下载整文件。
- `src/types/index.ts`, `src/lib/runShellScript.ts`, `LocalFsContextMenu.tsx`, `LocalFsPanel.tsx`, `LocalDesktopFileManager.tsx`: 共享 shebang/执行位/`.sh`/`.py` 识别、POSIX 与 PowerShell 命令构造，以及按能力展示右键项。
- 更新 Tauri 注册、i18n、E2E mock/API、Vitest、Rust 和 `e2e/local-fs.spec.ts`；不添加文件名白名单，语法高亮映射仍仅负责编辑器显示。

## 设计

- 未知扩展名文件打开时，受限检查内容；有效 UTF-8 文本进入文本编辑器，二进制/无效编码/超限在现有错误区提示。
- 右键文件时通过轻量脚本头探测确定能力：shebang 按声明解释器运行；可执行文件直接运行；无 shebang 的 `.sh` 用 bash、`.py` 用 python3；其他普通文本只编辑，不运行。
- 命令在脚本所在目录执行，路径与解释器参数安全转义。SSH 错误显示 toast；本机错误显示 Terminal 输出或现有错误反馈。
- 本机 Unix 使用 POSIX 命令，本机 Windows 使用 PowerShell 命令；远程当前 SSH 会话沿用 POSIX 命令行为。

## 任务

1. 先为未知文件字节分类、跨平台脚本命令决策和转义写 Vitest/Rust 回归，观察测试失败后实现。
2. 先写本机/SSH 脚本头探测与未知文本预览的失败测试，再实现轻量 Tauri API、共享类型与菜单接线。
3. 用 Playwright 覆盖未知文本打开、二进制拒绝、shebang/Python/普通文本菜单可见性、SSH 命令路由；更新 `docs/TEST_MATRIX.md`。
4. 运行硬编码禁检和 `./scripts/run-all-tests.sh`，修复所有回归。
