# MarkWisely 工具栏文件操作

## 要保住的旧行为

- 用户在 MarkWisely 编辑文档时，编辑器内容变化仍触发自动保存；保存成功时状态仍显示“已保存”，失败时保留当前内容并显示错误。
- Markdown 文档仍按当前 Desktop target 保存；Local 文档不调用 SSH preview 命令，SSH 文档不调用本机文件读写命令。
- 标题栏中央仍显示当前 Markdown 文件名；窗口关闭前仍先保存脏内容。
- MarkdownWysiwygEditor 现有格式操作、主题变化、远程图片上传与编辑器 flush 注册保持可用。
- 取消文件选择或系统导出对话框不会切换当前文档，也不会丢失编辑内容。

## 架构

- `src/components/preview/MarkdownWysiwygEditor.tsx`：新增可选的 MarkWisely 文件操作接口，将 Vditor 自定义菜单项注入现有 toolbar；通过 callback ref 保持编辑器实例稳定，不改变普通预览调用。
- `src/components/desktop/MarkWiselyWindow.tsx`：连接 Open、Open Folder、Save、Save As 和 Export；打开/另存为前先 flush 并保存；沿用 `MarkWiselyFilePicker`；标题栏与自动保存逻辑保持不变。
- `src/stores/markWiselyStore.ts`：增加按 Local/SSH target 写入另存文档的动作，成功后再切换当前文档并更新各 target 最近文件；失败保留源文档。
- `src/components/desktop/MarkWiselyWindow.css`：仅增加 MarkWisely 编辑器工具栏的 flex/两端对齐/窄宽横向滚动样式，避免影响文件预览工具栏。
- `src/i18n/locales/{en,zh-CN}/tools.json`：增加五个操作、导出文件过滤器和反馈文案。
- `e2e/host-desktop.spec.ts`、相关 store 测试：回归交互及目标隔离。需要在 E2E Tauri mock 中补充导出保存对话框支持时，仅扩展测试 mock。
- 依赖方向：窗口通过 store 和 localFs API 操作文档；Vditor 组件只负责呈现工具栏按钮和回调，不直接访问文件系统或 store。

## 设计

- 用户路径：编辑页工具栏左端显示 Open、Open Folder；原格式工具在中间；右端显示 Save、Save As、Export。使用已有文件选择器和系统保存对话框。
- 点击 Open 或 Open Folder 后先保存当前脏文档；加载中的文件选择器按现有弹窗状态显示。取消返回当前编辑文档。
- 点击 Save 后立即提交当前编辑器缓冲并保存；完成/失败分别由右下角保存状态和编辑窗口错误区显示。
- 点击 Save As 后先 flush 编辑器缓冲，再选目录、输入建议文件名；仅创建新副本，不覆盖源文件；成功后进入新副本，失败留在源文档。
- Export 使用本机系统保存对话框。取消时不反馈；成功用 toast 提示保存路径，失败在窗口错误区反馈。
- 工具栏两端操作各有稳定可访问名称和 tooltip。窄窗口保留单行横向滚动，焦点按钮可键盘访问。

## 任务

- [x] 为编辑工具栏按钮和文件操作路径添加会失败的 Playwright 回归，运行并记录失败结果。
- [x] 为 store Save As 添加会失败的 Local/SSH target 隔离测试，运行并记录失败结果。
- [x] 实现 store Save As，在同一 target 创建并写入新文件，写入成功后切换文档。
- [x] 给 Vditor 组件添加自定义操作菜单接口，并在 MarkWisely 中呈现五个按钮；普通预览工具栏保持原样。
- [x] 连接 Open、Open Folder、Save、Save As 与 Export；补齐双语文案和窄宽工具栏样式。
- [x] 运行针对性 Vitest/Playwright，修复失败并完成计划路径验收。
- [x] 运行 `node scripts/check-no-agent-hardcoding.mjs` 与 `./scripts/run-all-tests.sh`。
