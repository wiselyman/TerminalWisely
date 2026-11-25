# 要保住的旧行为

- EditorWisely 继续使用现有 CodeMirror 文档状态、保存/另存为、最近文件和本机/SSH 目标隔离。
- MarkWisely 继续保留标签、恢复、导入导出、大纲及偏好状态。
- 现有预览中的 PDF、图片、HTML、Office、媒体和文本能力不回退。
- 现有文件树按当前路径展开祖先并高亮文件；目标切换不串用目录句柄。

# 架构

- 已有能力（不重复实现）：`src/lib/fileType.ts` 识别预览类型；`src/lib/editorWiselyLanguages.ts` 与 `syntaxHighlight.ts` 提供语法能力；`EditorWiselyTree.tsx` 已按 activePath 聚焦；`PreviewPanel.tsx` 已路由 PDF/图片等预览。
- 新建 `src/components/desktop/FileWiselyWindow.tsx` 作为桌面统一文件工作台，拥有当前文件和视图状态，组合现有 EditorWisely、MarkWisely 与预览能力。
- 通过新建窄职责的 `src/lib/fileWiselyRouting.ts`（如检查确认现有类型足够）完成“打开路径→内容面板”纯路由；复用现有文件读取/保存入口，不复制 IO。
- `src/App.tsx` 和 Desktop 工具入口接入统一工作台；现有独立 EditorWisely/MarkWisely 功能保持可访问的兼容入口，统一工作台打开某一文件时复用其状态，而非再造编辑器。
- 品牌配置依据实际打包链路更新 `package.json`、Tauri 显示名及用户可见标题/i18n；建议产品名 **FileWisely**，中文名“全能文件台”。不随意改 crate、更新源或用户数据标识。
- 更新 `docs/TEST_MATRIX.md` 与静态 smoke 检查。

依赖方向：文件工作台调用现有 store、组件和文件 API；纯路由只依赖类型，不触碰 UI/IO。目录使用现有 EditorWiselyTree，通过当前文件路径驱动聚焦。预览复用现有 PreviewPanel 支持的 renderer。

# 设计

- 用户在 Desktop 打开“文件”工具后看到统一 FileWisely 窗口；左侧目录树可折叠，右侧根据当前文件类型显示对应内容。
- 点击树中文本文件后，在 EditorWisely 编辑器中打开；支持语言显示语法高亮，可保存。
- 点击 Markdown 文件后在现有 MarkWisely 中打开，沿用 Markdown 标签和恢复状态。
- PDF/图片点击后在右侧内嵌已有预览；加载错误出现在内容面板，不关闭树或工作台。
- 类型不支持时显示文件名与可读提示。目录树始终按当前路径展开祖先并高亮文件；收起后保留文件状态。
- 品牌在应用菜单、窗口和安装包用户可见名称中显示 FileWisely / 全能文件台。

# 实施任务

## Task 1：统一工作台路由契约
- 测试：先在 `src/lib/fileWiselyRouting.test.ts` 为路径分类与目标视图添加失败测试：`.md/.markdown → markdown`、已知文本 → editor、pdf/image → preview、未知类型 → unsupported；验证路径大小写及无扩展名行为与 `fileType.ts` 一致。
- 实现：新增最小纯函数 `fileWiselyViewForPath(path: string): "editor" | "markdown" | "preview" | "unsupported"`，只组合既有 `previewKindFromExtension` 结果，不复制扩展名白名单。
- 验证：先确认新增测试失败，再实现后运行 `npm test -- --run src/lib/fileWiselyRouting.test.ts`。

## Task 2：统一工作台视图与文件树
- 测试：扩展 `e2e/host-desktop.spec.ts`，断言统一 FileWisely 入口只显示一个工作台，折叠/展开树不丢当前文件，切换路径后树聚焦新文件。
- 实现：新增 `FileWiselyWindow.tsx`，组合 `EditorWiselyTree`、现有文本编辑窗口/store 与 Markdown 窗口/store；提供统一文件打开与面板切换，按 active path 传递树聚焦。
- 验证：先运行对应 E2E 看到预期失败，再实现后运行该 Playwright 文件；已有两个编辑器入口和状态恢复用例保持通过。

## Task 3：PDF/图片接入统一工作台
- 测试：E2E 覆盖在工作台打开 PDF 与图片后，预览分别显示已有 PDF renderer 与图片元素；故意加载无效资源时错误显示在内容区且目录仍可见。
- 实现：通过已有预览 store/PreviewPanel API 在统一工作台打开二进制预览，避免复制资源加载实现。
- 验证：先运行新增 E2E 确认失败，实现后再跑该 E2E 文件。

## Task 4：应用改名
- 测试：扩展 `scripts/smoke-product-checklist.mjs`，检查 Tauri/package 用户显示名一致，并检查中英文品牌键；避免要求内部 crate/repository 名迁移。
- 实现：更新经过检查确认的打包显示名、窗口标题及中英文用户可见名称为 FileWisely/全能文件台。
- 验证：先运行 smoke 看到失败，实现后运行 smoke 与 `npm run build`。

## Task 5：测试矩阵和全量回归
- 测试/文档：为 FileWisely 工作台添加矩阵行，指向路由单测、目录聚焦和内容视图 E2E。
- 验证：`node scripts/check-no-agent-hardcoding.mjs` 与 `./scripts/run-all-tests.sh` 全通过，并实际走完工作台打开文本、Markdown、PDF、图片的 Playwright 路径。

# Review Focus

- 工作台复用既有 stores，不出现同一文件两份编辑状态（Task 2/3）。
- 本机与 SSH 文件路径仍按目标隔离（Task 2）。
- 图片与 PDF 失败不影响树或当前工作台（Task 3）。
- 未知扩展继续走既有内容探测/不支持行为，不添加扩展名白名单（Task 1）。
- FileWisely 品牌更改不破坏更新地址、内部 crate 或数据目录（Task 4）。

# 编码与完成门槛

每个任务先写测试并运行，确认目标行为失败，再写最小实现。任务测试完成后停下来等用户审阅该任务；用户审阅前不提交该任务。审阅后每任务单独提交，不合并多个任务。全部完成后运行硬编码禁检及 `./scripts/run-all-tests.sh`，并走计划中的 Playwright 界面路径。

