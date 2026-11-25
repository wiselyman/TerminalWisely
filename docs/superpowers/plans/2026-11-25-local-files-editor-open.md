# Local Files opens documents in their editor

## 要保住的旧行为

- 本机 Desktop 的 Files 双击目录仍进入目录。
- SSH Files 的双击与当前远程预览行为保持不变。
- 本机文本文件通过 EditorWisely 保留现有自动保存、失败保留和多标签状态。
- 本机 Markdown 文件既有打开和保存行为保持不变。
- 本机非目标文件类型保留现有打开行为。

## 架构

- 回归覆盖位于 `e2e/local-fs.spec.ts`，通过本机 Desktop Files 双击验证路由、窗口最大化、文档内容与目录树。
- 文件路由落在 `src/components/desktop/LocalDesktopFileManager.tsx`；使用现有 `fileType.ts` 类型语义、EditorWisely store、MarkWisely store 和 desktop window store。
- README / 0.1.4 release notes / test matrix 记录本机 Files 双击文本后直接最大化 EditorWisely。
- 不改文件读取 API 或 SSH Files 路由；不新增特定软件名或单个场景白名单。

## 设计

- 在本机 Desktop 打开 Files，双击纯文本文件后直接最大化显示 EditorWisely。
- EditorWisely 左侧显示“文件”目录树，中间显示请求文件内容，顶部标签显示文件名。
- 本次只改变本机纯文本双击的编辑器窗口呈现；Markdown 和非目标文件沿用既有打开行为。
- 文件读取失败沿用编辑器现有错误提示；目录读取失败显示在 EditorWisely 左侧树区域。

## 任务

- [x] 添加本机 Files 双击文本文件的 Playwright 回归，先运行并观察失败。
- [x] 本机 Files 双击文本文件后最大化 EditorWisely，再运行双击用例及 EditorWisely tree 多文件用例。
- [x] 更新 README、0.1.4 发布说明和 `docs/TEST_MATRIX.md`。
- [x] 运行硬编码检查和 `./scripts/run-all-tests.sh`，通过后按项目约定提交并推送 `main`。
