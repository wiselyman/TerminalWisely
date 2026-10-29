# MarkWisely 直接导出 PDF

## 要保住的旧行为

- 点 HTML、PDF 或 Word 导出后，导出菜单关闭；取消保存位置选择时，不创建文件也不显示失败提示。
- HTML 和 Word 仍保留现有排版、当前编辑器内容（包括尚未自动保存的改动）及本机保存位置选择。
- Hosts 中打开的远程 Markdown 仍可导出到运行 TerminalWisely 的本机；输出文件继续经本机文件接口写入。
- 保存失败时，编辑器显示错误并给出失败提示；成功时显示包含输出路径的完成提示。

## 架构

- `src/lib/markWiselyPdf.ts`：把既有 `parseMarkdownExport` 的结构化块转换为矢量 PDF 文档定义，并通过 pdfmake 生成 PDF 字节。复用 Markdown 解析，不另造解析器。
- `src/assets/fonts/`：随应用打包可嵌入的 Noto Sans SC 字体与 OFL 许可，确保 macOS、Windows、Linux 上中文均可显示。
- `src/components/desktop/MarkWiselyWindow.tsx`：PDF 复用现有本机保存对话框与 `writeLocalBytes`，删除打印预览、打印按钮和浏览器打印调用。
- `e2e/host-desktop.spec.ts`：覆盖直接 PDF 保存、PDF 文件签名、取消和写入失败；验证界面没有打印预览路径。
- `docs/TEST_MATRIX.md`：更新 MarkWisely 导出测试映射。

## 设计

- 点击“导出 → PDF”后直接出现本机文件保存对话框，默认文件名为当前 Markdown 文件的 `.pdf` 版本。
- 确认后直接写入所选路径。PDF 使用 A4 页面、稳定页边距、清晰标题与层级、可读代码块、结构化表格、页码和嵌入的简体中文字体；文本保持可选择与搜索。
- 成功提示显示导出路径；取消不打扰用户；生成或写入失败时在编辑器显示错误并提示失败。整个流程不出现打印、预览或另存为 PDF 中间步骤。

## 任务

1. 添加 PDF 生成单测与 E2E 直接保存回归，先运行并确认当前打印预览实现无法满足测试。
2. 添加 pdfmake 与可再分发的 Noto Sans SC 字体/许可，按 Markdown 块生成带中文字体、页码和结构样式的矢量 PDF；验证 PDF 可解析且中文文本可提取。
3. 将 PDF 导出接到现有保存对话框和本机字节写入，移除打印预览状态、控件、样式与无用翻译。
4. 更新测试矩阵，运行目标测试、`node scripts/check-no-agent-hardcoding.mjs` 和 `./scripts/run-all-tests.sh`，按仓库流程提交并推送 `main`。
