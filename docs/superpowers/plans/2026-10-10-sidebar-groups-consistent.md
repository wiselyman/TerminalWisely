# Sidebar groups consistent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kubernetes and database sidebars use the same group chrome as hosts: an add button, an add-group button, and 未分组. No extra empty-state sentence.

**Architecture:** Entity layout already stores per-scope groups for `hosts` and `k8s`. Add scope `db` through the same layout module, store, and durable file. `DbWorkbench` renders connections with `EntityListView`. `EntityCatalog` stops passing the empty-state sentence for hosts and Kubernetes.

**Tech Stack:** TypeScript, Vitest, Playwright, Rust durable layout.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- One database service still has one chat. Home still hides the AI chat.
- Direct connections still do not get `terminal_exec`.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- 主机侧栏仍可新建分组、拖动主机、重命名和删除自定义分组；未分组不能删。
- Kubernetes 仍在加载时显示加载文案；有集群时仍出现在分组里，点集群仍打开工作台。
- 数据库点连接仍发起连接并展开库列表；编辑、删除仍在该行上；搜索仍能按连接名或对象筛出连接，筛完后分组归属还在。
- 新建连接按钮仍打开连接表单。列表里仍不出现密码。
- 选中连接仍是一条强调色边框。

## 架构

| Piece | File |
|---|---|
| Scope key `db` | `src/lib/entityListLayout.ts` |
| Store slot | `src/stores/entityLayoutStore.ts` |
| Add icon, list test id, visible ids | `src/components/management/EntityListView.tsx` |
| Database list uses that view | `src/components/db/DbWorkbench.tsx` |
| Drop empty sentences | `src/components/ConnectionPanel.tsx` |
| Persist `db` groups | `src-tauri/src/durable.rs`, `src-tauri/src/commands/mod.rs` |
| Row + tree under the drag handle | `src/App.css` |

## 设计

- 打开 Kubernetes 且还没有集群：侧栏顶部没有「还没有 Kubernetes 集群」。只有添加集群、添加分组，以及「未分组」。主机没有书签时同样只有按钮和「未分组」，没有「暂无 SSH 书签」。
- 打开数据库：同样是新建连接、添加分组、「未分组」。已有连接出现在分组里。点添加分组出现一个可改名的分组。展开连接后，库和表仍在该连接下面。

---

### Task 1: Database scope and no empty sentence

- [x] Failing test: layout key `db` exists; durable scope accepts `db`.
- [x] See it fail.
- [x] Add the scope, render database connections in `EntityListView`, stop passing empty sentences.
- [x] E2E: empty database sidebar shows 未分组 and the add-group button, and does not show the old empty sentence.
- [x] `./scripts/run-all-tests.sh` passes.
