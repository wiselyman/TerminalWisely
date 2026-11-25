# Files 双击文本进入 EditorWisely

## 要保住的旧行为

- 在连接主机的 Files 中双击目录仍进入该目录，目录树仍同步展开到该目录。
- 在连接主机的 Files 中双击 Markdown 文件仍按既有预览行为打开。
- 在本机 Files 中双击纯文本仍最大化 EditorWisely 并显示目录树。
- 在连接主机的 Files 中双击普通文本文件后，EditorWisely 显示对应文件内容和目录树，不打开通用预览窗口。

## 架构

- 改动落点：`src/components/LocalFsPanel.tsx` 的文件双击入口与 `e2e/local-fs.spec.ts`。
- `LocalFsPanel` 已持有 SSH session、当前 desktop target、EditorWisely store 与应用启动入口；复用 `EditorWiselyStore.open` 的 SSH 读取能力，不新增 API。
- Markdown 双击保持原有预览路径；文本文件复用已有 EditorWisely 目标会话路由。
- 不拆分组件；本次只改单一入口和对应端到端回归。

## 设计

- 用户在 SSH Files 内容区双击普通文本文件后，Files 保持在后方，最大化 EditorWisely 覆盖桌面，左侧展示目录树，编辑区加载该文件。
- Markdown 双击继续打开现有预览窗口。
- 文件加载失败时，错误显示在 EditorWisely 编辑区；目录树保留。

## 任务

1. 在 `e2e/local-fs.spec.ts` 增加 SSH Files 双击普通文本的失败回归，断言 EditorWisely 最大化、目录树可见、文件内容出现且通用预览不打开；先运行并确认失败。
2. 让 SSH Files 普通文本双击打开并最大化 EditorWisely；Markdown 仍走原预览入口。
3. 更新 `docs/TEST_MATRIX.md` 对应功能映射，运行本层回归与硬编码禁检。
4. 运行 `./scripts/run-all-tests.sh` 并确认通过。
