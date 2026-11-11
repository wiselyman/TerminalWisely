# v0.1.1 CI 发布修复

## 要保住的旧行为

- 在干净的 `npm ci` 环境、尚未运行 Vite build 时，产品 smoke 必须通过对 Markdown 编辑器依赖的静态检查。
- Markdown 编辑器统计在发布构建中可导入；中文、英文、行数和选区统计保持对应单元测试断言。
- Vite 开发与生产构建继续从安装的 Vditor 包生成离线资源，编辑器无需联网加载 KaTeX 与 Mermaid。

## 架构

- smoke 检查落在 `scripts/smoke-product-checklist.mjs`：验证 `node_modules/vditor/dist` 上游资源和 Vite 复制插件，不依赖构建产物目录。
- 统计逻辑及回归位于 `src/lib/markdownStatistics.ts` 与同目录测试；MarkWisely 界面只调用该纯逻辑模块。
- 不改变 Markdown 编辑器布局、解析、存储及发布工作流顺序。

## 设计

- 用户在 CI 或本机安装依赖后直接运行 smoke，Markdown 编辑器检查显示 PASS。
- 用户打开 Markdown 文档后状态栏继续显示字数、字符数、行数和预计阅读时间；加载/失败状态与文案不变。

## 任务

1. 证明依赖安装后、Vite build 前 smoke 会因检查生成目录而失败；调整检查为验证 Vditor 包中的上游 KaTeX/Mermaid 资源，并确认该场景通过。
2. 将现有工作区内的统计实现及其单元测试纳入版本控制范围；先运行对应测试和生产 TypeScript build，修正任何干净安装环境中的类型问题。
3. 运行硬编码禁检和全量测试，提交修复、推送 main，并重新发布 v0.1.1；确认新的 Release 与 CI 工作流通过。
