# Home copy keys Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Home cards and steps show the written sentences, not the key names.

**Architecture:** `src/i18n/index.ts` sets `keySeparator: false`. Welcome copy must be flat keys such as `feature.hosts.title` in both locale files. The generator catalog already uses those flat keys.

**Tech Stack:** JSON locales, Vitest.

## 要保住的旧行为

- 眉题、标题、一句话介绍、快速开始标题仍是直接读到的句子。
- 中英切换后欢迎页仍出现「快速开始」或 “Quick start”。

## 架构

只改 `src/i18n/locales/en/welcome.json` 与 `src/i18n/locales/zh-CN/welcome.json`。组件里的 `t("feature.hosts.title")` 不变。

## 设计

五张卡片和三步快速开始显示标题与说明，不再显示 `feature.hosts.title` 这类键名。

### Task 1

- [x] A test reads both welcome files and requires each card and step key to be a non-empty string.
- [x] See that test fail on the nested objects.
- [x] Flatten the keys. See the test pass.
