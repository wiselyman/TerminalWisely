# 要保住的旧行为

- EditorWisely 的 CodeMirror 文档、保存/另存为、最近文件及本机/SSH 隔离保持有效。
- MarkWisely 的标签、恢复、导入导出、大纲和偏好保持有效。
- 现有 PreviewPanel 对 PDF、图片、HTML、Office、媒体及文本的预览继续可用。
- 现有 EditorWiselyTree 展开当前路径祖先并高亮活动项；切换目标不串用状态。

# 架构

- 复用 `fileType.ts`、`editorWiselyLanguages.ts`、`syntaxHighlight.ts`、`EditorWiselyTree.tsx` 和 `PreviewPanel.tsx`，不重新实现识别、高亮、聚焦、renderer。
- `FileWiselyWindow.tsx` 是统一文件工作台入口；工作区窗口与文件树聚焦基于 EditorWisely 现有窗口和 store。
- 文本编辑阶段复用 Editor store 的 `open(target,path)` 和现有 CodeMirror；后续 Markdown 阶段再将 Mark store 的 `openDocument({target,sessionId,hostKey,path})` 内容嵌入同一窗口。
- PDF/图片阶段通过 PreviewPanel 已用的预览 store/API 打开；统一窗口保持树可见。
- `App.tsx` 的 EditorWisely desktop 入口改由 FileWiselyWindow 承载。MarkWisely 仍作为兼容独立入口，后续 Markdown 集成完成后从主工作台启动。
- `fileWiselyRouting.ts` 只组合既有文件分类结果；`package.json`、Tauri 用户显示名和中英文文案改为 FileWisely / 全能文件台，内部 crate、更新源和数据目录保持稳定。
- 更新 smoke 检查及 `docs/TEST_MATRIX.md`。

# 设计

- 用户启动 FileWisely 后看到单个窗口：可折叠目录树 + 活动文件内容区。
- 点击已知文本，内容区打开 EditorWisely 文档并支持高亮、修改、保存。
- 点击 Markdown，内容区打开 MarkWisely 文档和原有大纲/恢复体验。
- 点击 PDF/图片，内容区使用既有 viewer；加载错误留在内容区，目录树继续可用。
- 窗口内切换文件时展开并聚焦新文件祖先；折叠树不卸载内容文档。

# 实施任务

## Task 1：统一工作台路由契约（已实现，提交 8cdbfead）
- `fileWiselyViewForPath` 复用既有分类；8 项单测通过。

## Task 2：FileWisely 文本工作区入口与目录树
- 测试：扩展 `e2e/host-desktop.spec.ts`，验证 FileWisely 工作区显示、文本文件聚焦、折叠/展开树不会卸载当前编辑器；保留现有 EditorWisely 独立入口的兼容测试。
- 实现：新增 FileWiselyWindow 入口并复用 EditorWisely 窗口/store；默认展开已有目录树，将窗口产品标题标为 FileWisely。
- 验证：先见 E2E 失败，再跑新增用例和已有文本保存用例。

## Task 3：MarkWisely Markdown 嵌入统一窗口
- 测试：E2E 从统一目录树打开 Markdown 文件，断言同一工作区显示 MarkWisely 编辑器及大纲/恢复能力，没有第二个窗口。
- 实现：MarkWiselyWindow 提供内容嵌入模式并复用现有 store；FileWiselyWindow 按路由挂载 Markdown 内容。
- 验证：新增 Markdown 工作区 E2E 与原 MarkWisely 恢复、保存用例通过。

## Task 4：PDF/图片统一窗口预览
- 测试：E2E 打开 PDF/图片后断言对应 renderer 出现在 FileWisely 内容区、树仍可见；资源错误显示在内容区。
- 实现：复用 PreviewPanel 的 store/API 在工作台内容区路由 PDF 与图片。
- 验证：先运行用例确认失败，再运行新增 E2E 与现有预览测试。

## Task 5：应用品牌改名
- 测试：smoke 检查 package/Tauri 显示名和中英文 UI 品牌一致。
- 实现：改用户可见产品名为 FileWisely / 全能文件台，避免更动内部 crate、更新源、数据目录。
- 验证：smoke、`npm run build` 通过。

## Task 6：矩阵与全量回归
- 更新 TEST_MATRIX 功能映射。
- 运行硬编码禁检、`./scripts/run-all-tests.sh` 并走通文本、Markdown、PDF、图片界面路径。

# Review Focus

- 两种编辑器仍只拥有各自 store 中的一份文档状态；同文件切换不产生第二份副本（Task 2/3）。
- 本机与 SSH 路径使用正确目标（Task 2）。
- PDF/图片加载失败不关闭工作台（Task 3）。
- 未知类型沿用既有拒绝/内容探测行为，不增白名单（Task 1）。
- 品牌修改不触及更新地址、内部 crate、数据目录（Task 4）。

# 编码与完成门槛

每项任务先写测试、看到失败、再实现并验证。任务验证后停下等待用户审阅；审阅通过后单独提交该任务，不合并提交。最终执行硬编码禁检、`./scripts/run-all-tests.sh` 及计划界面路径。
