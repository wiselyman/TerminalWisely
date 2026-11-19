# Home 新建主机入口

## 要保住的旧行为

- Home 的 New group 仍创建一个默认名称分组，主机分组列表和拖放行为不变。
- 新建主机仍复用 ConnectionPanel 的 SSH 创建表单，保存后按表单选择的组归类。
- New host 只在 Home 主机目录显示；页签栏原有 Add server 入口保持不变。

## 架构

| 职责 | 文件 |
|---|---|
| Home 工具栏按钮和点击回调 | `src/components/home/HomeHostDirectory.tsx` |
| 复用 ConnectionPanel 已注册的新建 SSH 表单入口 | `src/App.tsx` |
| 中英文按钮文案 | `src/i18n/locales/{en,zh-CN}/shell.json` |
| Home 按钮顺序及表单打开回归 | `e2e/home-host-directory.spec.ts` |
| Home 目录测试矩阵 | `docs/TEST_MATRIX.md` |

依赖方向沿用现有注册回调：目录触发 App 中的 `openNewRemoteRef`，ConnectionPanel 继续拥有表单状态和提交逻辑，不复制 SSH 创建表单。

## 设计

- Home 目录右上角按钮按从左到右顺序显示 New host、New group。
- 点击 New host 后打开现有 Remote SSH 新建表单，界面显示 ConnectionPanel 当前文案和字段；保存行为不变。
- 加载、空组、连接状态均不改变；没有额外成功/失败提示。

## 任务

### 任务 1：增加 New host 入口

- [x] 增加 E2E：按钮位于 New group 左侧，点击后显示新建连接表单。
- [x] 运行新增用例确认当前实现失败。
- [x] 复用已有注册回调，在 Home 工具栏加入本地化按钮。
- [x] 运行 Home 目录相关 E2E。

### 任务 2：验证和交付

- [x] 更新测试矩阵；运行硬编码禁检、smoke 和全量测试。
- [ ] 提交并推送 `main`。
