# MarkWisely 界面整理 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 Dock 中 MarkWisely 图标清楚可见，整理其首页层级，并让“Open Markdown”以文件选择弹框出现。

**Architecture:** 保留现有远程文件存储、近期文件、编辑器和自定义文件浏览逻辑。只补齐 Dock glyph 的图标底色，重排 MarkWisely 首页结构与样式，并在 MarkWisely 窗口内容层内将已有文件选择器作为模态弹框呈现。

**Tech Stack:** React、TypeScript、CSS、Playwright。

**Spec:** 用户本轮提出的三项要求及附图。

## Global Constraints

- MarkWisely 仍管理当前 SSH 主机上的 Markdown 文件。
- 新建、编辑、保存、近期文件和脏文档保护行为保持不变。
- 打开文件只接受 Markdown 文件；目录浏览、错误和取消行为保持可用。
- 不新增产品能力或依赖。

## Review Focus

- MarkWisely Dock 图标在浅色和深色主题下都必须与背景有足够反差。
- 打开文件对话框在窄窗口中仍可滚动浏览文件，且取消后回到首页。
- 打开近期文件和编辑中离开时的未保存保护仍有效。

---

## 要保住的旧行为

- 从 Host Desktop Dock 打开 MarkWisely 后，首页仍提供新建、打开和近期文件入口。
- 从远程文件选择器打开 `.md` / `.markdown` 后，仍使用现有 Markdown 编辑器并记录到当前主机近期列表。
- 文件选择器仍过滤非 Markdown 文件；取消选择不打开文件。
- 新建、保存、重新打开和未保存退出确认继续通过现有 SSH 会话完成。

## 架构

| 文件 | 职责 |
|------|------|
| `src/styles/desktop.css` | 为 `.host-desktop-glyph.is-markwisely` 补上与其他 Dock 应用一致的可辨识渐变底色。 |
| `src/components/desktop/MarkWiselyWindow.tsx` | 重排首页内容；Open 模式保留首页背景并将现有远程文件选择器包在模态层中。 |
| `src/components/desktop/MarkWiselyFilePicker.tsx` | 为打开文件模式提供对话框语义与稳定测试标识；目录选择模式行为不变。 |
| `src/components/desktop/MarkWiselyWindow.css` | 首页层级、响应式间距及文件选择模态层样式。 |
| `e2e/host-desktop.spec.ts` | 验证 Dock 图标可辨识、打开文件的模态交互及现有文件流程。 |

依赖方向保持为 MarkWisely 窗口组合现有 picker；picker 继续通过现有 `list_remote_directory` 读取当前主机目录。Dock 颜色仅由共享桌面样式作用于现有图标类名。

## 设计

- 首页点击路径：打开 Dock 中 MarkWisely → 查看应用标识与名称 → 选择“New Markdown”或“Open Markdown” → 可从近期文件继续打开。
- 首页把品牌标题、主要操作和近期文件分成清楚的纵向区块；使用现有 MarkWisely 图标替换孤立的字母标记，并约束最大宽度、统一留白和列表行样式。
- 点击“Open Markdown”后，首页留在背景，中央显示带标题、当前远程路径、文件列表、取消按钮的模态文件选择框。
- 加载状态显示在弹框列表区域；目录读取错误显示在弹框内；选择 Markdown 文件后进入编辑器；取消后关闭弹框并回到首页。
- 新建、编辑、保存和脏文档确认沿用当前交互与状态提示。

## 任务

### Task 1: 让 Dock 中的 MarkWisely 图标可见

**Files:**
- Modify: `src/styles/desktop.css`
- Test: `e2e/host-desktop.spec.ts`

- [x] **Step 1: 写失败的回归断言** — 增加 Dock glyph 可见且背景图为非空渐变的断言。
- [x] **Step 2: 运行对应 Playwright 用例并确认失败** — 失败原因应是 MarkWisely glyph 没有渐变背景。
- [x] **Step 3: 实现最小样式** — 为 `.host-desktop-glyph.is-markwisely` 添加与 Dock 色彩体系协调的渐变背景。
- [x] **Step 4: 重跑用例确认通过**。

### Task 2: 整理 MarkWisely 首页层级

**Files:**
- Modify: `src/components/desktop/MarkWiselyWindow.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Test: `e2e/host-desktop.spec.ts`

- [x] **Step 1: 写首页回归断言** — 验证首页显示应用名称、两个主要操作和近期文件区，并使用 MarkWisely 图标而非单独字母徽标。
- [x] **Step 2: 运行对应用例确认旧首页不满足图标结构断言**。
- [x] **Step 3: 实现首页结构与样式** — 让标题、操作、近期文件有清楚层次，在不同窗口宽度下保持可读布局。
- [x] **Step 4: 重跑首页与 Dock 打开用例确认通过**。

### Task 3: 将 Open Markdown 改为模态文件选择框

**Files:**
- Modify: `src/components/desktop/MarkWiselyWindow.tsx`
- Modify: `src/components/desktop/MarkWiselyFilePicker.tsx`
- Modify: `src/components/desktop/MarkWiselyWindow.css`
- Test: `e2e/host-desktop.spec.ts`

- [x] **Step 1: 写失败的交互断言** — 点击“Open Markdown”后，首页仍在窗口内，且文件选择器以 `role="dialog"` / `aria-modal="true"` 显示。
- [x] **Step 2: 运行对应用例确认失败** — 当前 picker 是整页 section，没有模态语义。
- [x] **Step 3: 实现模态展示** — Open 模式保留首页作为背景，将现有 picker 放在弹框遮罩内；目录选择器继续沿用原视图。
- [x] **Step 4: 重跑文件筛选、取消、打开、保存与脏文档保护用例确认通过**。

## 完成验证

- [x] `node scripts/check-no-agent-hardcoding.mjs` — PASS (7 rules, 95 py files)
- [x] `./scripts/run-all-tests.sh` — All automated tests PASSED; smoke 260 PASS / 0 FAIL / 1 optional native check BLOCKED; Vitest 578 PASS; Sidecar 502 PASS / 3 skipped; Playwright 104 PASS.
- [x] Playwright：MarkWisely Dock 打开、首页、Open 对话框与远程 Markdown 文件创建/编辑/保存流程；深浅主题桌面截图基线已更新。
