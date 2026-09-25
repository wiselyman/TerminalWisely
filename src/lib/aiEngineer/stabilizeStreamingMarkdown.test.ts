import { describe, expect, it } from "vitest";
import { marked } from "marked";
import {
  closeDanglingBoldMarkers,
  closeProseLeakingCodeFence,
  looksLikeFenceBodyLine,
  looksLikeProseLeakingFromFence,
  materializeBoldMarkers,
  stabilizeStreamingMarkdown,
} from "./stabilizeStreamingMarkdown";

marked.setOptions({ gfm: true, breaks: true });

function render(md: string): string {
  return marked.parse(stabilizeStreamingMarkdown(md), {
    async: false,
  }) as string;
}

describe("stabilizeStreamingMarkdown", () => {
  it("classifies diagram vs prose lines", () => {
    expect(looksLikeFenceBodyLine("│ 应用层 (Python) │")).toBe(true);
    expect(looksLikeFenceBodyLine("| 编排层 (Rust) |")).toBe(true);
    expect(looksLikeFenceBodyLine("架构分层")).toBe(true);
    expect(
      looksLikeProseLeakingFromFence(
        "把 **Python、C++、Rust、CUDA、Mojo** 组合起来，各取所长",
      ),
    ).toBe(true);
    expect(looksLikeFenceBodyLine("把 **Python、C++** 组合起来")).toBe(false);
  });

  it("closes fence before leaked Chinese prose so bold parses", () => {
    const raw =
      "方案\n\n```\n架构分层\n┌──┐\n│ 应用层 (Python) │\n└──┘\n\n" +
      "把 **Python、C++、Rust、CUDA、Mojo** 组合起来，各取所长，是目前 LLM 开发**最完整";
    const fixed = closeProseLeakingCodeFence(raw);
    expect(fixed).toMatch(/```\n\n把 \*\*Python/);
    expect((fixed.match(/```/g) || []).length % 2).toBe(0);
    const html = render(raw);
    expect(html).toContain("<strong>Python、C++、Rust、CUDA、Mojo</strong>");
    expect(html).not.toMatch(/<pre><code>[^<]*\*\*Python/);
  });

  it("appends closing fence at EOF when still open", () => {
    const raw = "x\n```\ncode only";
    const fixed = closeProseLeakingCodeFence(raw);
    expect(fixed.endsWith("```")).toBe(true);
  });

  it("leaves properly closed fences alone", () => {
    const raw =
      "```\n│ a │\n```\n\n把 **Python、C++** 组合起来。";
    expect(closeProseLeakingCodeFence(raw)).toBe(raw);
  });

  it("closes dangling bold markers outside fences", () => {
    expect(closeDanglingBoldMarkers("开发**最完整、最高效")).toBe(
      "开发**最完整、最高效**",
    );
    expect(closeDanglingBoldMarkers("**已齐**")).toBe("**已齐**");
  });

  it("stabilize makes mid-stream diagram+prose render bold", () => {
    const mid =
      "五语言\n\n```\n架构分层\n│ 应用层 (Python) │\n│ 编排层 (Rust) │\n\n" +
      "把 **Python、C++、Rust、CUDA、Mojo** 组合起来，各取所长，是目前 LLM 开发**最完整、最高效";
    const html = render(mid);
    expect(html).toContain("<strong>Python、C++、Rust、CUDA、Mojo</strong>");
    expect(html).toContain("<strong>最完整、最高效</strong>");
  });

  it("closes a half-typed trailing table cell", () => {
    const mid =
      "| 项目 | 值 |\n|------|-----|\n| **可用中继** | **2/3";
    const fixed = stabilizeStreamingMarkdown(mid);
    expect(fixed.trimEnd().endsWith("|")).toBe(true);
    const html = marked.parse(fixed, { async: false }) as string;
    expect(html).toContain("<table>");
    expect(html).toContain("<strong>可用中继</strong>");
  });

  it("materializes CJK bold that CommonMark flanking rejects", () => {
    const cases = [
      "**最终建议：** 你当前 16GB 显存**，先用 llama.cpp 跑 7B/13B GGUF 量化模型**，最简单、显存最省。",
      "**一句话：nvcc 是 CUDA 编译器。**如果你确实需要",
      "你当前 16GB 显存**，先用 llama.cpp 跑量化模型**，最简单。",
      "它。**你**可以继续",
      "表里 | **GPU** | **16 GB** | 正常",
    ];
    for (const raw of cases) {
      const html = render(raw);
      expect(html, raw).toContain("<strong>");
      // No leftover emphasis markers in the visible prose path.
      expect(html.replace(/<[^>]+>/g, ""), raw).not.toContain("**");
    }
  });

  it("does not materialize bold inside fences or inline code", () => {
    const raw =
      "见 `**not-bold**` 与\n\n```bash\necho **also-literal**\n```\n\n外 **才加粗**。";
    const fixed = materializeBoldMarkers(raw);
    expect(fixed).toContain("`**not-bold**`");
    expect(fixed).toContain("echo **also-literal**");
    expect(fixed).toContain("<strong>才加粗</strong>");
    const html = marked.parse(stabilizeStreamingMarkdown(raw), {
      async: false,
    }) as string;
    expect(html).toMatch(/<code[^>]*>\*\*not-bold\*\*<\/code>/);
    expect(html).toContain("<strong>才加粗</strong>");
  });

  it("strips empty code fences that would paint blank boxes", () => {
    const raw =
      "升级：\n\n```\n\n```\n\n```bash\nsudo apt install cuda-toolkit-13-2\n```\n\n```\n```\n";
    const html = render(raw);
    expect(html).toContain("cuda-toolkit-13-2");
    expect(html.match(/<pre>/g)?.length ?? 0).toBe(1);
  });

  it("keeps multi-line ```bash fences intact (version dots ≠ prose)", () => {
    const raw =
      "**1. 先用 vLLM 跑 7B AWQ 模型验证**\n" +
      "```bash\n" +
      "pip install vllm\n" +
      "vllm serve Qwen2.5-7B-Instruct-AWQ --max-model-len 4096\n" +
      "```\n\n" +
      "**2. 确认显存占用和吞吐**";
    expect(
      looksLikeProseLeakingFromFence(
        "vllm serve Qwen2.5-7B-Instruct-AWQ --max-model-len 4096",
      ),
    ).toBe(false);
    const html = render(raw);
    expect(html.match(/<pre>/g)?.length ?? 0).toBe(1);
    expect(html).toMatch(
      /<pre><code[^>]*>[\s\S]*pip install vllm[\s\S]*vllm serve Qwen2\.5/,
    );
    expect(html).not.toMatch(/<\/pre>[\s\S]*vllm serve/);
    expect(html).toContain("<strong>1. 先用 vLLM 跑 7B AWQ 模型验证</strong>");
  });

  it("does not splice language-tagged fences on following CJK prose mid-stream", () => {
    const mid =
      "```bash\npip install vllm\nvllm serve foo\n把 **Python** 装好后再测";
    const fixed = closeProseLeakingCodeFence(mid);
    // Still open until EOF closer — must not close before 把…
    expect(fixed).not.toMatch(/```\n把/);
    expect(fixed.endsWith("```")).toBe(true);
    const beforeClose = fixed.slice(0, fixed.lastIndexOf("\n```"));
    expect(beforeClose).toContain("把 **Python**");
  });

  it("rewrites pasted <tool_call> XML so reopen is not a word salad", () => {
    const raw =
      "<tool_call>\n" +
      "<function=terminal_exec>\n" +
      "<parameter=command>\n" +
      "python3 -c \"from huggingface_hub import snapshot_download; " +
      "snapshot_download('Qwen/Qwen-Image-2.1', " +
      "local_dir='/home/user/lab/data/ComfyUI/models/diffusers/')\" 2>&1 | tail -20\n" +
      "</parameter>\n" +
      "<parameter=intent>\n" +
      "用 Python API 下载 Qwen-Image-2.1 模型\n" +
      "</parameter>\n" +
      "<parameter=timeout_seconds>\n" +
      "3600\n" +
      "</parameter>\n" +
      "</function>\n" +
      "</tool_call>";
    const html = render(raw);
    expect(html).toContain("<pre>");
    expect(html).toContain("snapshot_download");
    expect(html).toContain("Qwen-Image-2.1");
    // Browser must not see raw parameter tags (those collapse to glued text).
    expect(html.toLowerCase()).not.toContain("<tool_call>");
    expect(html.toLowerCase()).not.toContain("<parameter=");
    expect(html).not.toMatch(/tail -20\s*用 Python/);
  });

  it("rewrites web_fetch XML to compact title+url, not url:/goal: walls", () => {
    const raw =
      "<tool_call>\n" +
      "<function=web_fetch>\n" +
      "<parameter=url>\n" +
      "https://videocardprices.com/card/nvidia-rtx-5090/\n" +
      "</parameter>\n" +
      "<parameter=goal>\n" +
      "获取 RTX 5090 当前价格\n" +
      "</parameter>\n" +
      "</function>\n" +
      "</tool_call>";
    const fixed = stabilizeStreamingMarkdown(raw);
    expect(fixed).toContain("获取 RTX 5090 当前价格");
    expect(fixed).toContain("videocardprices.com");
    expect(fixed).not.toMatch(/^url:\s/m);
    expect(fixed).not.toMatch(/^goal:\s/m);
    expect(fixed).not.toContain("```");
  });
});
