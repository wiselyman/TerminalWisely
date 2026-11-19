# Home 分组标题与悬停操作计划

## 要保住的旧行为

- Home 主机仍可点击打开 Desktop；拖动仍能在完整分组区域内移动主机。
- 主机编辑/删除和分组编辑/删除仍使用既有操作回调；Ungrouped 仍不显示分组管理操作。
- 鼠标不悬停时隐藏操作按钮，但键盘 Tab 聚焦到对应卡片或分组控制时仍可见、可访问。
- 页面顶部的新建分组入口持续可见，不受 hover 状态影响。

## 架构

| 职责 | 文件 |
|---|---|
| Home 分组/主机操作按钮可见性和语义 | `src/components/home/HomeHostDirectory.tsx` |
| 浅色标题栏、hover 与 focus 显示状态 | `src/styles/home.css` |
| Hover、键盘 focus 与新增分组入口回归 | `e2e/home-host-directory.spec.ts` |
| Home 两种主题视觉基线 | `e2e/ui-visual-baselines.spec.ts-snapshots/home-{dark,light}-chromium-darwin.png` |

依赖方向不变：组件提供按钮和语义 class，样式控制 hover/focus 展示，不改主机或分组数据流。

## 设计

- 分组名称与主机数量所在行作为浅色标题带，横向铺满分组面板，保持名称、数量的对齐。
- 分组编辑/删除只在鼠标悬停该分组标题栏或键盘焦点进入分组标题栏时显示。
- 主机编辑/删除只在鼠标悬停该主机卡片或键盘焦点进入卡片操作区域时显示。
- 默认隐藏状态下操作控件不占据显著视觉注意；显示/隐藏使用短暂透明度过渡，不移动卡片布局。

## 任务

### 任务 1：分组浅色标题栏与按需操作按钮

- [x] 先增加 E2E：默认主机/分组操作隐藏，悬停相应卡片/分组后显示，新建分组持续可见。
- [x] 运行新增用例确认当前实现失败。
- [x] 为分组标题加浅色底带；操作按钮改为 hover/focus-within 显示并提供过渡。
- [x] 更新视觉快照并跑定向 E2E。

### 任务 2：完整验证和交付

- [x] 运行硬编码禁检、smoke 和 `./scripts/run-all-tests.sh`。
- [x] 确认 Home hover、focus 与视觉快照 E2E 通过，提交并推送 `main`。
