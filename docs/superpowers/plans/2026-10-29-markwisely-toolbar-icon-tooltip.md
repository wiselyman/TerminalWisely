# MarkWisely Toolbar Icon Tooltip Fix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore outlined Lucide icons and visible hover labels for MarkWisely file actions.

**Architecture:** Scope SVG fill/stroke overrides to custom MarkWisely toolbar icons. Keep the action label as the Vditor accessible name and tooltip source; do not alter formatting controls.

**Tech Stack:** CSS, React, Vditor, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-29-markwisely-toolbar-icon-tooltip-design.md`

## 要保住的旧行为

- 文件操作按钮仍保持 Open、Open Folder、Save、Save As、Export 顺序并位于格式操作之前。
- 每个按钮仍触发原有文件路径；普通 Markdown 预览工具栏的图标样式不变。
- 键盘 focus 和鼠标 tooltip 使用同一操作名称，便于可访问性。

## 架构

- `src/components/desktop/MarkWiselyWindow.css` 局部覆盖 `.markwisely-toolbar-action svg` 的 Vditor `fill`/`stroke-width` 冲突。
- `src/components/preview/MarkdownWysiwygEditor.tsx` 保留传入 label 作为 Vditor `tip`，并确保 tooltip 位置在工具栏下方。
- `e2e/host-desktop.spec.ts` 验证 SVG 线框计算样式、accessible label 和 hover tooltip。
- 不增加依赖，不改变文件操作、Vditor 全局样式和其他预览行为。

## 设计

- 自定义文件图标显示 Lucide 线条，不填充内部区域，沿用当前主题文字色。
- 鼠标悬浮或键盘聚焦时显示操作名称 tooltip。
- 无加载或保存行为变化；错误与保存状态沿用现有显示位置。

## 任务

- [x] 扩展 Playwright 回归，验证文件图标透明填充/描边及每个按钮悬浮显示名称；先运行观察失败。
- [ ] 局部覆盖 Vditor SVG 样式并确认 tooltip 标签可见。
- [ ] 运行 MarkWisely 相关 Playwright、硬编码禁检和全量测试。
