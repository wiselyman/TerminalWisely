# Database groups stay separate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The database sidebar does not copy host groups. Existing connections show under 未分组.

**Architecture:** `loadEntityListLayout("db")` must not adopt the shared v2 sidebar when that blob has no `db` scope. A saved database layout that already copied host group ids drops those groups and keeps every connection in 未分组, expanded. Host and Kubernetes layouts stay as they are.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints

- Develop on `main` only. No Cursor commit trailers.
- Host groups, drag, and the v2 recovery for a stripped hosts layout stay.
- Gate: `./scripts/run-all-tests.sh` green before claiming done.

---

## 要保住的旧行为

- 主机侧栏仍显示用户自己的分组，成员仍在原来的组里。
- 被拆空的主机布局仍能从共享 v2 快照恢复分组成员。
- Kubernetes 仍使用自己的 scope，不读数据库分组。
- 数据库里用户新建的、id 与主机分组不同的分组仍保留。

## 架构

| Piece | File |
|---|---|
| Skip v2 when the scope is absent; strip copied host group ids on db load | `src/lib/entityListLayout.ts` |
| Regression | `src/lib/entityListLayout.test.ts` |

## 设计

- 打开数据库侧栏：只有「未分组」，里面是已保存的连接，分组是展开的。
- 不再出现主机上的「家」「公司」「远程」。
- 之后在数据库里新建的分组只属于数据库。

---

### Task 1: Stop copying host groups onto databases

- [x] Failing test: db load with a hosts sidebar snapshot returns only 未分组 and the connection ids.
- [x] Failing test: an already saved db layout that reused host group ids drops those groups and lists the connections under 未分组.
- [x] See them fail.
- [x] Implement the skip and the repair. Save the repaired db layout.
- [x] `./scripts/run-all-tests.sh` passes.
