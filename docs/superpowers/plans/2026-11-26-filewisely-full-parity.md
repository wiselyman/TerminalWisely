# 要保住的旧行为

- 打开 Markdown 后仍保留 MarkWisely 的多文档标签、WYSIWYG/源码切换、文件/文件夹打开、新建、保存/另存为、导入导出、恢复草稿、大纲、统计、主题与编辑偏好。
- 打开文本或源码文件后仍保留 EditorWisely 的 CodeMirror 高亮、标签切换/关闭保护、查找、保存/另存为、最近文件、编码换行信息与本机/SSH 隔离。
- PDF/图片仍复用现有预览器；树折叠或文件切换不能卸载未保存的编辑状态。
- 本机与 SSH 工作区使用各自 target/session，不发起重复连接；远程文件能力受当前会话约束。

# 架构

- `FileWiselyWindow.tsx` 成为唯一文件工作台，拥有统一窗口标题栏、文档标签栏、左侧文件树、内容区、状态栏和文件操作菜单。
- 将 EditorWiselyWindow 与 MarkWiselyWindow 中依赖应用外壳的编辑器内容、工具栏/操作菜单拆为独立组件；保留各自 store、编辑器实现、文件 API 和领域逻辑，避免复制状态或重写编辑器。
- 用 `FileWiselyWindow` 统一协调当前活动路径与两套 store；活动 tab、tree focus、保存/关闭保护只由当前文件类型对应的领域 store 提供。
- Dock/App 只注册 FileWisely；删除旧独立窗口渲染与旧入口测试，但保留 store、language、Markdown 编辑器组件及必要兼容数据。
- E2E 覆盖从单一 FileWisely 窗口完成原两产品的主要操作路径；smoke 检查禁止旧 Dock 项与独立窗口入口。

# 设计

- 用户只看到 FileWisely 一个文件应用。标题栏显示当前文档标签和统一操作按钮；左侧可折叠文件树始终聚焦活动文档。
- 无文档时显示 FileWisely 欢迎页，提供新建 Markdown、打开文件、最近文件；从树打开文件直接进入对应内容，不显示旧产品欢迎页。
- Markdown 内容保留 WYSIWYG 默认视图，可切源码、打开大纲、执行文档操作；源码及普通文本使用 CodeMirror 高亮。
- 保存、导入、导出、恢复草稿等反馈显示在活动文档工作区；失败时保留原文与当前标签。
- PDF/图片显示原 renderer 和加载/错误状态；所有按钮、状态与错误文案支持中英文。

# 实施任务

## Task 1：功能基线与单入口约束
- 测试：扩展 Playwright 用例，FileWisely 单一 Dock 入口；工作区不渲染旧产品独立窗口标题/欢迎页。
- 实现：先移除旧 Dock 注册和 App 独立窗口渲染，将统一工作区设为唯一启动入口；旧独立组件暂保留供嵌入复用。

## Task 2：EditorWisely 完整能力嵌入
- 测试：在 FileWisely 内打开两份文本，切换/关闭标签、触发查找、保存、另存为、确认未保存关闭、验证高亮和状态栏；本机/SSH 路径分别断言。
- 实现：拆出可组合的 Editor 内容组件与统一窗口 header actions，避免嵌入模式隐藏标签/操作。

## Task 3：MarkWisely 完整能力嵌入
- 测试：在 FileWisely 内完成新建/打开、多文档标签、WYSIWYG/源码切换、大纲、保存/另存为、导入导出、恢复/丢弃草稿。
- 实现：拆出 Markdown 编辑器工作区组件；共用 FileWisely 文件树与标题栏，保留 Mark store 和现有 Markdown 编辑器行为。

## Task 4：统一欢迎页、操作与预览状态
- 测试：欢迎页打开/新建/最近文件；各类工具按钮和中英文反馈；PDF/图片加载、失败及切换期间编辑状态保留。
- 实现：在 FileWisely 聚合统一空态与操作入口，补充本地化的 preview 状态。

## Task 5：移除旧应用产品表面
- 测试：smoke 与 E2E 断言不存在 MarkWisely/EditorWisely Dock/独立窗口入口，FileWisely 功能全路径仍通过。
- 实现：移除旧 window wrapper、旧 icon/label/app ids 和过期测试/文案；继续保留被复用的领域 stores、编辑器组件和语言识别模块。

## Task 6：矩阵与全量回归
- 更新 `docs/TEST_MATRIX.md`，逐条映射旧功能的统一入口覆盖。
- 执行 `node scripts/check-no-agent-hardcoding.mjs`、`./scripts/run-all-tests.sh`，并用 Playwright 走通计划中的全部路径。
