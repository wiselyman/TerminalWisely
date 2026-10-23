# 语言切换入口宽度稳定

## 要保住的旧行为

- 语言入口仍能在简体中文和 English 之间切换，菜单项名称、键盘操作和选中态不变。
- 切换语言仍更新界面文案与 HTML `lang` 属性。
- 顶栏语言入口旁边的控件在切换语言时保持原有位置，不因入口文字宽度改变而抖动。

## 架构

- `src/styles/desktop.css`：为语言入口触发器设定稳定宽度，并让中英文代码在同一居中区域显示。
- `e2e/app-shell.spec.ts`：扩展现有语言切换流程，测量触发器宽度及其前一顶栏图标的位置。

## 设计

- 点击顶栏语言入口后继续展示中文和 English 菜单项。
- 选择任一语言后，入口维持相同宽度，显示文本居中；其左侧的主题图标位置不变。
- 语言切换即时生效，失败行为沿用既有 i18n 错误处理。

## 任务

- [x] 先扩展 Playwright 回归断言，确认 EN 与中状态的入口宽度和相邻主题图标位置一致；运行并确认当前实现失败。
- [x] 固定入口宽度，更新受影响的明暗主题截图基线，运行定向 Playwright 和硬编码禁检。
- [x] 更新测试矩阵或现有映射；运行 `./scripts/run-all-tests.sh`，通过后提交并推送 `main`。

## 验收记录

- RED：旧样式测试失败，英文入口宽度为 25.28px，中文为 24px。
- GREEN：入口固定为 28px；定向 Playwright 通过，并验证语言切换后主题图标横坐标不变。
- 更新 Home、Hosts、Kubernetes、Database、Local files 页面明暗主题截图基线，以反映固定后的入口布局。
- `node scripts/check-no-agent-hardcoding.mjs`：通过（7 条规则、95 个 Python 文件）。
- `./scripts/run-all-tests.sh`：通过。Smoke 260 PASS、0 FAIL、1 项可选原生标题栏检查 BLOCKED；Vitest 116 个文件 / 569 项通过；Rust 158 项通过、4 项忽略；Sidecar 502 项通过、3 项跳过；Playwright 96 项通过。SSH/K8s Docker 集成因环境无 Docker 而跳过。
- `git diff --check`：通过。
