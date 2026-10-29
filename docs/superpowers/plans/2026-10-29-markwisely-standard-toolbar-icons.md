# MarkWisely Standard Toolbar Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace custom file-action glyphs with standard Lucide icons and place all five file actions together on the left before formatting controls.

**Architecture:** Serialize existing Lucide React icon components to the SVG strings accepted by Vditor. Keep action wiring in MarkWiselyWindow and toolbar rendering in MarkdownWysiwygEditor; update only toolbar ordering and spacing.

**Tech Stack:** React, TypeScript, Vditor, lucide-react, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-markwisely-standard-toolbar-icons-design.md`

## 要保住的旧行为

- Open 和 Open Folder 仍走现有 Markdown 文件选择器，取消后当前文档不变。
- Save、Save As、Export 的行为及其 toast、自动保存状态保持不变。
- 格式按钮顺序、编辑区宽度、快捷键和普通 Markdown 预览工具栏保持不变。

## 架构

- `src/components/desktop/MarkWiselyWindow.tsx` 提供现有 Lucide 图标的静态 SVG 字符串，不再手写五段图形路径。
- `src/components/preview/MarkdownWysiwygEditor.tsx` 将五个文件操作集中插入 Vditor toolbar 的格式按钮之前。
- `src/components/desktop/MarkWiselyWindow.css` 移除将 Save 推到右侧的 margin 行为；保留工具栏起点和窄窗口横向滚动样式。
- `e2e/host-desktop.spec.ts` 验证 Lucide 图标语义、文件操作顺序及左边缘对齐。
- 依赖方向不变：编辑器通过 callback 触发 MarkWiselyWindow 操作，不访问存储或文件系统。

## 设计

- 工具栏从左到右依次为 Open、Open Folder、Save、Save As、Export、分隔线、原有格式操作。
- 图标依次为 FileText、FolderOpen、Save、FilePlus2、FileDown；所有文件操作共享现有尺寸、提示与焦点样式。
- 加载、成功和失败反馈沿用现有文件操作提示，不新增状态或文案。

## 任务

- [x] 扩展 Playwright 回归，验证标准图标名称、五项操作在格式操作之前及左侧排列；先运行观察失败。
- [x] 用 Lucide SVG 替换自绘图标，将全部文件操作移至格式工具之前。
- [x] 删除 Save 自动右推样式，保持窄窗口滚动与左右边距断言。
- [x] 运行 MarkWisely 相关 Playwright、硬编码禁检和全量测试。
