# MarkWisely 导出扩展名修复实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 MarkWisely 导出文件的实际路径扩展名始终匹配选择的 HTML、PDF 或 Word 格式，避免 PDF 导出生成 `latest.json` 等错误扩展名文件。

**Architecture:** 在独立的导出路径工具中根据格式规范化系统保存对话框返回的文件名，再由 MarkWisely 写入对应内容。系统保存对话框和输出位置始终属于运行 TerminalWisely 的本机；SSH 主机只提供源 Markdown 内容。

**Tech Stack:** TypeScript、Vitest、Playwright、Tauri dialog plugin。

**Spec:** 本计划直接落实用户 2026-10-30 关于 Linux 主机兼容性与 PDF 导出变成 `latest.json` 的缺陷报告。

## Global Constraints

- 保持 HTML、PDF、Word 的导出格式、排版和用户选择的输出目录。
- 远程 SSH 文件导出继续保存到运行 TerminalWisely 的本机。
- 不新增应用能力，不更改保存对话框平台行为。

## Review Focus

- 保存对话框返回无扩展名路径时，所选格式扩展名必须补上。
- 保存对话框返回不匹配扩展名（包括 `.json`）时，不匹配扩展名不得导致输出伪装成其它格式。
- Linux SSH 主机上的文档仍使用本机对话框及本机文件接口导出。

## 要保住的旧行为

- 取消保存对话框不创建文件，也不显示导出失败提示。
- HTML、PDF、Word 的内容继续使用当前编辑器内容，并写入用户选择的本机目录。
- Hosts 中的远程 Markdown 导出仍通过本机文件接口保存；成功提示包含最终输出路径。

## 架构

- `src/lib/markWiselyExportPath.ts`：增加纯函数，将所选格式和对话框返回的路径映射为正确扩展名。
- `src/lib/markWiselyExportPath.test.ts`：覆盖缺少扩展名、正确扩展名、错误扩展名、多点文件名及 Windows 路径。
- `src/components/desktop/MarkWiselyWindow.tsx`：先规范化返回路径，再按其目录创建/写入文件；保持 Tauri dialog 和本机写入职责不变。
- `e2e/host-desktop.spec.ts`：模拟 PDF 对话框返回 `latest.json`，断言最后写入 `latest.pdf` 且文件签名为 PDF。
- `src/e2e/tauriCoreMock.ts`：仅通过现有 save-dialog stub 注入指定返回路径，不改变生产逻辑。

## 设计

- 选择导出格式后仍使用本机系统保存对话框；macOS 上是 macOS 保存框，Linux 版运行于 Linux 时使用该系统可用的 Tauri 文件对话框后端。远程 SSH 的 Linux 发行版不会决定对话框类型。
- 用户确认路径后，最终扩展名按所选格式固定为 `.html`、`.pdf` 或 `.docx`；如果系统返回其他扩展名（例如 `latest.json`），替换最后一个扩展名，生成 `latest.pdf`。
- 文件写入成功时，完成提示显示规范化后的真实路径；失败时继续显示当前错误提示。

## 任务

### Task 1: 格式化导出路径并验证端到端 PDF 输出

**Files:**
- Create: `src/lib/markWiselyExportPath.ts`
- Test: `src/lib/markWiselyExportPath.test.ts`
- Modify: `src/components/desktop/MarkWiselyWindow.tsx`
- Test: `e2e/host-desktop.spec.ts`

- [x] **Step 1: 写失败测试**：纯单测要求将 `/tmp/latest.json` 的 PDF 目标规范化为 `/tmp/latest.pdf`，无扩展名补上目标扩展名，正确扩展名保持不变，并保留 Windows 目录分隔符；E2E 将 PDF 保存对话框返回路径设为 `/tmp/latest.json`，断言完成提示和字节写入路径均为 `/tmp/latest.pdf`，内容以 `%PDF-` 开头。
- [x] **Step 2: 运行测试确认失败**：纯单测因生产工具不存在而失败；Playwright 实际复现完成提示未出现 `/tmp/latest.pdf`，确认当前流程继续使用 `.json` 路径。
- [x] **Step 3: 最小实现**：实现 `normalizeMarkWiselyExportPath(path, extension)`，替换最后一个文件扩展名；在保存对话框返回后、父目录解析和文件创建之前调用。
- [x] **Step 4: 验证通过**：路径单测 4 项通过；MarkWisely PDF 导出 E2E 通过，确认 JSON 扩展名不会进入最终导出路径且 PDF 内容签名正确。
- [x] **Step 5: 全量检查**：运行 `node scripts/check-no-agent-hardcoding.mjs` 与 `./scripts/run-all-tests.sh`，更新 `docs/TEST_MATRIX.md` 对应回归描述；硬编码检查通过，全量测试通过（Playwright 116 项、Sidecar 502 项 + 3 skipped，Rust/前端检查均通过）。
