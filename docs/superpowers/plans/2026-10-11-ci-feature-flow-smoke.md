# CI feature-flow smoke Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `npm run test:smoke` passes on a checkout that does not contain `.cursor/`.

**Architecture:** `.cursor/` is gitignored. The feature-flow gate reads `AGENTS.md` only.

**Tech Stack:** Node smoke script.

## 要保住的旧行为

- `AGENTS.md` 仍必须包含「要保住的旧行为」「架构」「设计」「先写会失败的测试」。
- `AGENTS.md` 仍不得要求把计划交给 Codex 审查。

## 架构

只改 `scripts/smoke-product-checklist.mjs` 的 `process.feature-flow` 一段。

## 设计

CI 克隆仓库后跑冒烟，不因缺少本机 Cursor 规则而退出。

### Task 1

- [ ] Remove the read of `.cursor/rules/feature-flow.mdc`.
- [ ] `npm run test:smoke` passes.
