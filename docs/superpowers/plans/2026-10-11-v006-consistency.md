# v0.0.6 chrome consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Hosts, Kubernetes, and Databases share one set of selection, spacing, type, and empty-state rules. Existing behavior stays. Confirmed defects get a failing test, then a fix.

**Architecture:** Shared chrome stays in `src/App.css` and the existing list components. A source contract test locks the rules. Playwright covers the empty cluster hint and the checklist gaps that the mocked window can already reach.

**Tech Stack:** TypeScript, Vitest, Playwright, CSS.

## 要保住的旧行为

- 三条侧栏的切换、分组、连接、打开表、执行 SQL、恢复默认视图不变。
- Home 仍不显示聊天。一个数据库服务仍是一个页签、一份聊天。
- 标题栏上的服务页签样式不动。主机列表和集群列表仍然没有搜索框。

## 架构

样式改 `src/App.css`。集群行图标在 `ConnectionPanel.tsx`。空集群文案在 `K8sWorkbench.tsx`。树箭头在 `K8sWorkbench.tsx` 与 `DbWorkbench.tsx`。契约测试是 `src/lib/chromeContract.test.ts`。

## 设计

选中是一条强调色边，文字用前景色。行内边距 `6px 10px`，列表内边距 `8px 10px 10px`，图标 16px，分组标题 `0.72rem` / `0.04em`，箭头 14。工具按钮 28px。搜索框字号 `--tw-font-dense`。没有集群时显示已有的 `selectClusterHint`。数据库空结果使用 `.empty-state`。

### Task 1

- [ ] Write `chromeContract.test.ts` and see it fail.
- [ ] Apply the shared rules and see it pass.
