# Chrome plus, typing case, dialog chrome

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The title-bar plus opens a new server, cluster, or database connection for the sidebar that is open. The first typed letter stays as typed. Dialogs share one compact footer instead of a full-width website button.

**Architecture:** Plus action is `chromeNewAction` in `src/lib/chromeNewSession.ts`, wired in `App.tsx`. Database create stays in `DbWorkbench` and is registered upward. Unwanted capitalization is `unwantedLeadingCapital` in `src/lib/textEntryCase.ts`, installed once from `main.tsx`. Dialog chrome stays in `App.css` and `AddK8sClusterModal.tsx`.

**Tech Stack:** Vitest, Playwright, existing Modal.

## 要保住的旧行为

- 主机页的加号仍打开「添加服务器」，不打开集群或数据库表单。
- 侧栏里的添加连接、添加集群仍然打开同一张表单。
- 切到数据库或 Kubernetes 时，Home 仍先出现。
- 用户按着 Shift 或开着大写锁时，输入的大写字母保持大写。中文输入过程中不改字。

## 架构

加号动作在 `src/lib/chromeNewSession.ts`，点击在 `App.tsx`。数据库表单注册在 `DbWorkbench.tsx`。首字母判断在 `src/lib/textEntryCase.ts`。弹框底栏和添加集群对话框在 `App.css` 与 `AddK8sClusterModal.tsx`。

## 设计

三个侧栏的标题栏，Home 页签后面都有同一个加号。主机打开添加服务器，Kubernetes 打开添加集群，数据库打开新建连接。添加集群对话框和添加服务器一样：字段在上，右下角是取消和动作，不再是一条铺满的蓝按钮。空输入框的第一个字母，没按 Shift 时不被改成大写。

### Task 1

- [x] Failing tests for the plus action, the leading capital, and the dialog footer.
- [x] See those tests fail.
- [x] Implement and see them pass.

### Task 2

- [x] Playwright: database plus opens the connection form; Kubernetes plus opens Add cluster.
- [x] `./scripts/run-all-tests.sh` passes.
