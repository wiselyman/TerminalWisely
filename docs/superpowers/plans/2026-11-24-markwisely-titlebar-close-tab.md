# MarkWisely 标题栏关闭整个窗口

## 要保住的旧行为

- 页签自身的 × 仍只关闭对应文档；未保存编辑内容仍弹确认，取消后页签保留。
- 按 Escape 仍只关闭当前文档页签。
- 预览窗口最小化后仍保留文档页签，点击 Dock 页签仍可恢复。
- 新建的桌面 MarkWisely 应用窗口 × 仍关闭整个应用窗口。

## 架构

- 当前从 TerminalWisely 文件树打开的 Markdown 预览实际由 `PreviewPanel.tsx` 渲染；它通过 `previewStore.closePreview()` 关闭活动页签。这是用户截图中右上角 × 的错误绑定。
- `previewStore.ts` 新增按 session 关闭整个预览窗口的动作：按序调用现有 `closeTab`，保留现有脏文档确认；用户取消关闭某个脏页签时停止关闭并保留窗口。
- `PreviewPanel.tsx` 的窗口标题栏 × 改用该全窗口动作；页签栏 × 和 Escape 继续调用 `closeTab` / `closePreview`。
- `preview-markdown-wysiwyg.spec.ts` 覆盖真实 PreviewPanel 路径的整窗关闭与单页签关闭；窗口关闭复用 `closeTab` 的现有未保存确认行为。

## 设计

- 点击窗口右上角 ×：逐个关闭当前连接的所有 Markdown 预览页签，复用现有未保存确认；全部关闭后预览窗口与 Dock 页签一起消失。
- 点击文档页签上的 ×：只关闭该文档，其他文档和窗口继续显示。
- 如果用户在任一未保存文档确认框中选择取消：停止后续关闭，保留该文档、尚未处理的文档和预览窗口。

## 任务

- [x] 在 `preview-markdown-wysiwyg.spec.ts` 增加两个文档打开时点击标题栏 × 后整个预览窗口消失的回归用例；先运行并确认因旧行为只关闭一个页签而失败。
- [x] 实现 session 级全窗口关闭动作，并只将 `PreviewPanel.tsx` 标题栏 × 接到该动作；页签 × 与 Escape 保持原逻辑。
- [x] 运行定向测试、`node scripts/check-no-agent-hardcoding.mjs` 和 `./scripts/run-all-tests.sh`；用 Playwright 覆盖真实 PreviewPanel 路径。当前桌面进程仍是旧版本，实点复现了原问题，未在旧进程上声称修复已生效。
