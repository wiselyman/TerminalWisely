# MarkWisely 工具栏图标与悬浮提示修复

## 目标

修复 MarkWisely 文件操作图标被 Vditor 全局 SVG 样式渲染成实心黑块的问题，并确认悬浮时每个图标都会显示对应操作名称。

## 设计

仅在 MarkWisely 自定义文件操作图标上覆盖 Vditor 的 SVG 填充/描边规则，恢复 Lucide 线框图标。每个工具按钮使用已有本地化 label 作为 accessible name 和 Vditor tooltip 内容；鼠标悬浮时显示提示，不影响 Vditor 原有格式按钮。

## 验收

- 五个文件操作 SVG 是透明填充、可见线条，图标视觉为标准 Lucide 线框。
- 每个操作按钮的 `aria-label` 含对应操作名称，悬浮后 Vditor tooltip 显示。
- 原有排序、文件操作行为和普通预览工具栏不变。
