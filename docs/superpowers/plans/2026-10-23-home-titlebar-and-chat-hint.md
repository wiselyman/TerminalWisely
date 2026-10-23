# Home 标题栏与聊天说明修正计划

## 要保住的旧行为

- Home 仍隐藏左侧目录区域，并保留顶部空间切换按钮；Hosts/Kubernetes/Databases 下侧栏收起功能仍可用。
- Home 聊天继续使用本机聊天 scope，其他空间的聊天提示文案不变。
- Home Terminal、页签、聊天和可调分隔条布局保持不变。

## 架构

- `src/App.tsx`：Home 状态不渲染标题栏的侧栏收起按钮，其他空间继续渲染。
- `src/i18n/locales/zh-CN/tools.json`、`src/i18n/locales/en/tools.json`：更新 Home 空状态说明，准确描述本机聊天和左侧 Terminal。
- `src/App.homeTab.test.ts`、`e2e/app-shell.spec.ts`：覆盖标题栏按钮的空间可见性及中英文 Home 说明。

## 设计

- Home 顶部保留空间切换控件，移除没有作用的侧栏收起图标。
- Home 聊天空状态文案改为“这是 Home 空间的本机聊天。左侧是当前电脑的 Terminal。”英文同步表达相同内容；不再声称维护、文件、网页查询统一通过 MCP。
- 复用现有标题栏空间按钮和 Home 聊天空状态，不新增控件或交互。

## 任务

1. [x] 测试：增加 Home/其他空间侧栏收起按钮可见性断言，并更新中英文提示断言，先运行确认失败。
2. [x] 实现：按 Home 状态隐藏侧栏收起按钮，更新中英文 Home 提示文案。
3. [x] 验证：运行相关 Vitest、Home Playwright、硬编码禁检及全量测试。
