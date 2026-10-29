# MarkWisely 标准工具栏图标与左侧排列

## 目标

将 MarkWisely 的 Open、Open Folder、Save、Save As、Export 换成可直接辨认的 Lucide 标准文件图标，并把五项操作连续放在 Vditor 格式工具之前的左侧区域。保留现有操作行为、工具提示、键盘访问和正文排版。

## 设计

使用 Lucide `FileText`、`FolderOpen`、`Save`、`FilePlus2`、`FileDown`，依次表达打开文档、打开目录、保存、另存副本和导出。五项紧邻排列后放置分隔线，再显示原格式工具；不使用自动空白把保存类操作推至右侧。窄窗口仍允许工具栏横向滚动。

## 验收

- 五个操作使用对应 Lucide 图标，并按 Open、Open Folder、Save、Save As、Export 顺序全部位于格式工具之前。
- Open 按钮靠近工具栏左边缘，图标类与按钮 tooltip/可访问名称语义一致。
- 文件操作流程、自动保存、现有格式操作和普通 Markdown 预览工具栏不变。
