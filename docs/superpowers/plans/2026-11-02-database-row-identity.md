# Database Row Identity Implementation Plan

**Goal:** Prevent grid edits and deletes from changing multiple indistinguishable rows.
**Architecture:** The workbench checks complete primary-key metadata against the displayed result before enabling row mutation. Truncated catalog results are treated as incomplete. Existing SQL generation retains all original column predicates for optimistic conflict detection and quotes string values to preserve textual identity. No driver changes.
**Tech Stack:** TypeScript, Vitest, Playwright.
**Spec:** `docs/superpowers/specs/2026-09-30-engine-matrix.md`

## 要保住的旧行为

- 有完整主键的表可继续编辑单元格和删除行，操作沿用审批流程及原始行值条件。
- 没有可用行身份信息时仍可浏览、筛选、查询和插入。
- 对象树主键信息仍来自现有目录查询。

## 架构

- `src/components/db/workbenchModel.ts` 提供纯函数判断完整主键是否在结果中；`DbWorkbench.tsx` 使用该判断控制编辑和删除。
- `workbenchModel.test.ts` 与 `e2e/db-workbench.spec.ts` 分别验证判断和可点击路径；不拆分工作台，本次仅调整现有行为入口。

## 设计

- 打开有完整主键的表时，编辑和删除的点击路径、加载、审批、成功及失败显示保持现状。
- 无主键或结果缺少主键列时，单元格只读，删除按钮禁用并提示“需要完整主键才能编辑或删除行”（中英文文案）；查询及插入不受影响。

## 任务

1. 写判断函数的失败测试，覆盖无主键、复合主键缺失列、截断目录和完整主键；确认失败后实现并跑单元测试。
2. 写 Playwright 失败测试验证无主键时禁止编辑删除，再接入工作台和翻译；运行 UI 测试。
3. 先写数字文本主键的失败测试，确保行条件保留字符串语义；修复并运行单元测试。
4. 运行硬编码检查和完整回归，记录真实引擎未测情况。
