# Files 界面优化与 Dock 拖动修复

## 要保住的旧行为

- 本机与 SSH Files 继续使用各自的文件操作接口；导航、搜索、排序、右键菜单及列表/图标视图保持可用。
- 文件选择、拖动移动、预览、编辑与 SSH 上传下载行为不因样式调整而改变。
- 未最大化 Files 窗口可以拖入 Dock 区域；Dock 位于窗口上层、保持半透明并可点击。最大化窗口仍按原逻辑隐藏 Dock，并可从屏幕底部唤出。
- 亮色和暗色主题下，文件名、元数据、当前目录和选择状态均清晰可读。

## 架构

- `DesktopAppWindow.tsx`：增加可选的普通窗口标题展示能力，仅 Files 使用；拖动边界维持共用窗口逻辑。
- `FileManagerPanel.tsx`：开启 Files 标题展示，不修改其他应用标题栏。
- `desktop.css` 与 `files.css`：集中调整 Files 工具栏、路径栏、目录树、列表和图标视图的视觉层级；保留亮暗主题变量。
- `e2e/local-fs.spec.ts`、`e2e/host-desktop.spec.ts`、`e2e/ui-visual-baselines.spec.ts`：覆盖 Files 标题、两种文件视图、本机和 SSH 窗口拖入 Dock，以及主题截图。
- 不新增前端或后端公共 API。

## 设计

- Files 普通窗口标题栏显示文件夹图标与“Files”，拖动空白标题栏区域可移动窗口。
- 导航工具栏和路径面包屑形成浅色次级表面；侧边目录树提供明确的当前目录状态；列表表头、行距、悬停与选中态更易区分，图标视图保持适度紧凑。
- 亮暗主题沿用应用色彩变量；不改变文件操作入口、文案或目录导航结构。
- 窗口进入 Dock 区域时，Dock 继续覆盖窗口并可操作；Dock 半透明效果在亮暗主题中均保留。

## 任务

### 任务 1：Files 标题栏与视觉层级

- [x] 先新增 Playwright 断言：普通 Files 窗口显示应用名“Files”；确认当前代码下断言失败。
- [x] 完成最小标题显示能力，并调整 Files 专属样式。
- [x] 运行本机 Files 测试与亮暗主题视觉基线；检查列表、图标视图和侧边树。

### 任务 2：本机 Files 拖入 Dock 回归

- [x] 先新增 Playwright 用例：从本机桌面打开 Files，拖动标题栏使窗口覆盖 Dock 区域，并确认 Dock 图标仍可点击；测试确认现有边界与层级可用。
- [x] 拖动回归通过现有实现，因此保留共用拖动边界和层级，不作无必要改动。
- [x] 运行本机和 SSH Files 的 Dock 拖动用例及相关窗口测试。

### 任务 3：全量验收

- [x] 更新亮暗主题 Files 截图基线与 `docs/TEST_MATRIX.md`。
- [x] 运行 `node scripts/check-no-agent-hardcoding.mjs`。
- [x] 运行 `./scripts/run-all-tests.sh` 并确认通过；检查最终 diff 仅包含本任务文件。

## 验证记录

- Files 标题断言：先因当前窗口没有普通标题文字而失败，添加 `showWindowTitle` 后通过。
- 本机 Files 拖动到 Dock 区域及 Dock 点击：通过；原 SSH Files Dock 覆盖/透明度用例：通过。
- Files 亮色和暗色 Playwright 基线已更新并通过。
- `node scripts/check-no-agent-hardcoding.mjs`：PASS。
- `./scripts/run-all-tests.sh`：全部自动化测试通过；Playwright 141/141。
