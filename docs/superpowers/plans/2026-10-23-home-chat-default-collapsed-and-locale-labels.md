# Home 聊天默认收起与语言入口改为文字标记

## 要保住的旧行为

- Home 首次进入时本机 Terminal 正常显示；用户通过顶栏 AI 按钮可展开本机聊天，聊天标题栏的收起按钮也能收起聊天。
- Home 聊天展开后仍保留分栏拖拽、键盘调整、保存比例和聊天内容；切换语言不改变聊天面板的展开/收起状态。
- Hosts、Kubernetes、Databases 的 AI 聊天开关仍只控制当前工作区既有聊天；Home 展开/收起不能影响这些空间。
- 语言入口仍可用鼠标、键盘和菜单选择简体中文或 English，菜单选项有可访问名称和当前选中态。

## 架构

- `src/stores/managedEntityStore.ts`：增加独立于 Hosts AI 面板的 Home 聊天可见状态及设置方法，默认收起。
- `src/App.tsx`、`src/components/home/HomeWorkspace.tsx`：Home 顶栏 AI 按钮切换 Home 聊天状态；收起时 Terminal 占满工作区，展开后复用已存分栏比例。
- `src/components/aiEngineer/AiEngineerPanel.tsx`、`src/components/WorkspacePanelHeadActions.tsx`：Home 聊天标题栏收起控件写入 Home 状态，普通空间仍走既有面板收起逻辑。
- `src/components/LocaleSwitcher.tsx`、`src/styles/desktop.css`：以“中 / EN”文字作为当前语言入口标记，移除旗帜 SVG；菜单直接展示语言名称。删除不再使用的 `src/lib/localeFlag.tsx` 与对应单测。
- `e2e/home-local-terminal-chat.spec.ts`、`e2e/settings-i18n.spec.ts` 与 `scripts/smoke-product-checklist.mjs`：覆盖 Home 默认状态、展开/收起与语言切换状态保持，并替换旧旗帜静态契约。

## 设计

- Home 默认只显示 Terminal，聊天面板和分隔条收起；顶栏 AI 按钮是展开入口。展开后右侧显示聊天，拖动分隔条行为不变；聊天标题栏收起按钮和顶栏 AI 按钮均可再次收起。
- 语言入口显示简洁的“中”或“EN”文字，不用国家旗帜表达语言；点击后菜单显示“中文 / English”（跟随当前界面语言本地化），状态反馈继续使用选中背景与 `aria-checked`。
- 默认状态加载时不显示额外提示；展开和收起即时完成；语言切换失败沿用既有 i18n 错误处理。

## 任务

- [x] 先补 Playwright：断言 Home 默认聊天隐藏、Terminal 占满工作区；点击顶栏 AI 按钮展开，标题栏收起和顶栏按钮均可收起，语言切换不会意外展开聊天；断言语言入口显示“中 / EN”且菜单不含旗帜图形。运行并确认旧实现失败。
- [x] 实现 Home 独立聊天可见状态、展开/收起路径及文字语言标记；更新 smoke 静态契约和必要的截图基线；运行定向 E2E/Vitest。
- [x] 更新 `docs/TEST_MATRIX.md`；运行硬编码检查和 `./scripts/run-all-tests.sh`，通过后提交并推送 `main`。

## 验收记录

- RED：旧实现下新增的 Home 默认收起与语言入口检查失败；原行为默认展示聊天且 Home 顶栏 AI 按钮不可用。旧 smoke 契约也要求旗帜 SVG，替换为文字标记契约后通过。
- GREEN：Home 默认仅显示 Terminal；顶栏 AI 按钮可展开/收起，聊天标题栏可收起；其他工作空间 AI 面板状态独立；语言切换入口显示“中 / EN”，菜单保留可访问名称和选中态。
- `node scripts/check-no-agent-hardcoding.mjs`：通过（7 条规则、95 个 Python 文件）。
- `./scripts/run-all-tests.sh`：通过。Smoke 260 PASS、0 FAIL、1 项可选原生标题栏检查 BLOCKED；Vitest 116 个文件 / 569 项通过；Rust 158 项通过、4 项忽略；Sidecar 502 项通过、3 项跳过；Playwright 96 项通过。SSH/K8s Docker 集成因环境无 Docker 按脚本跳过。
- `git diff --check`：通过。
