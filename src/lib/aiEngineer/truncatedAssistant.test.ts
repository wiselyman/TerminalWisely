import { describe, expect, it } from "vitest";
import {
  extendAssistantContinuation,
  looksIncompleteAssistant,
  looksTruncatedAssistant,
  mergeAssistantContinuation,
  resolveAuthoritativeAssistantContent,
  stripTrailingDanglingHeading,
} from "./truncatedAssistant";

describe("looksTruncatedAssistant (structural only)", () => {
  it("detects dangling paren + latin fragment", () => {
    const raw =
      "搞清楚了。给你说清楚装的是什么和怎么用。\n\n".repeat(2) +
      "### 部署到真机\n用 `Gr00tPolicy` API 接你的机器人控制器 (`getting";
    expect(looksTruncatedAssistant(raw)).toBe(true);
  });

  it("detects unclosed bold", () => {
    const raw =
      "主模型 67/67 齐了。\n\n".repeat(2) +
      "总量估计还有 40-60 GB，大约 **1.";
    expect(looksTruncatedAssistant(raw)).toBe(true);
    expect(
      looksTruncatedAssistant("总量估计还有 40-60 GB，大约 **1.5–2 小时**。"),
    ).toBe(false);
  });

  it("detects incomplete markdown table with blank cell", () => {
    const raw =
      "结论：不是慢，是网络层挂起。\n\n" +
      "### 怎么办\n\n" +
      "| 方案 | 动作 | 说明 |\n" +
      "|------|------|------|\n" +
      "| A. 重新下载（推荐） | kill 卡住的进程 → 重新 `hf download` |";
    expect(looksTruncatedAssistant(raw)).toBe(true);
    expect(
      looksTruncatedAssistant(
        raw + " 断点续传。|\n| B. 再等 | 不动 | 多半回不来 |\n",
      ),
    ).toBe(false);
  });

  it("detects dangling markdown heading restart", () => {
    const raw =
      "## 第 1 步到底在做什么\n\n" +
      "GROOT 在看演示并对比预测动作。\n\n".repeat(4) +
      "## 第 1 步到底在做什么";
    expect(looksTruncatedAssistant(raw)).toBe(true);
  });

  it("does not treat trailing colon lead-in as structural truncation", () => {
    expect(
      looksTruncatedAssistant("规则已移入。现在重载配置并验证："),
    ).toBe(false);
    expect(
      looksIncompleteAssistant("规则已移入。现在重载配置并验证："),
    ).toBe(false);
  });

  it("detects dangling path arrow connectors", () => {
    const raw =
      "具体操作如下。\n\n".repeat(3) + "Clash Verge -> 设置 ->";
    expect(looksTruncatedAssistant(raw)).toBe(true);
    expect(looksIncompleteAssistant(raw)).toBe(true);
  });

  it("does not treat finished prose as truncated (no keyword heuristics)", () => {
    expect(looksTruncatedAssistant("这台机器是 Debian 12，内核正常。")).toBe(
      false,
    );
    // Mid-prose without structural break is NOT structural-truncated.
    expect(
      looksTruncatedAssistant(
        "说明如下。\n\n".repeat(4) + "还剩 125 片，大约还要两小时左右",
      ),
    ).toBe(false);
    // …but unfinished_prose / incomplete helper still flags it.
    expect(
      looksIncompleteAssistant(
        "说明如下。\n\n".repeat(4) + "还剩 125 片，大约还要两小时左右",
      ),
    ).toBe(true);
  });

  it("does not treat a closed markdown fence as truncated", () => {
    const fenced =
      "```json\n" +
      "{\n" +
      '  "name": "terminal_exec",\n' +
      '  "arguments": {\n' +
      '    "command": "systemctl stop teamviewer"\n' +
      "  }\n" +
      "}\n" +
      "```";
    expect(looksTruncatedAssistant(fenced)).toBe(false);
    expect(looksTruncatedAssistant("说明如下：`getting")).toBe(true);
  });
});

describe("resolveAuthoritativeAssistantContent mid-prose", () => {
  it("keeps long incomplete prev over short replace suffix", () => {
    const prev =
      "具体操作如下。\n\n".repeat(4) + "Clash Verge -> 设置 ->";
    const next = "系统代理。";
    const out = resolveAuthoritativeAssistantContent(prev, next, {
      replace: true,
    });
    expect(out).toContain("Clash Verge");
    expect(out).toContain("系统代理");
    expect(out.length).toBeGreaterThan(next.length);
  });
});

describe("extendAssistantContinuation", () => {
  const steps =
    "**还没修好。** Merge.yaml 在，但 mihomo 没加载。\n\n" +
    "1. 打开 Profiles\n" +
    "2. 重新选中当前配置\n" +
    "3. 强制重新合并 Merge.yaml\n\n" +
    "或者我试试通过 API 强制重载：";
  const tail =
    "或者我试试通过 API 强制重载配置。你在 Clash Verge GUI 里点一下当前配置的应用按钮，就能让 Merge 重新生效。生效后就会直连。";

  it("replaces a dangling colon line with the finished continuation", () => {
    const out = extendAssistantContinuation(steps, tail);
    expect(out).toContain("重新生效");
    expect(out).toContain("就会直连");
    expect(out).not.toContain("强制重载：或者我试试");
    expect(out?.match(/强制重载/g)?.length).toBe(1);
  });

  it("keeps the tail when a partial stream already glued up to Merge", () => {
    const partial = `${steps}或者我试试通过 API 强制重载配置。你在 Clash Verge GUI 里点一下当前配置的应用按钮，就能让 Merge`;
    // Sidecar emits the joined full answer (not a bare suffix).
    const full = `${steps.slice(0, steps.lastIndexOf("\n") + 1)}${tail}`;
    const out = resolveAuthoritativeAssistantContent(partial, full, {
      replace: true,
    });
    expect(out).toContain("Profiles");
    expect(out).toContain("重新生效");
    expect(out).toContain("就会直连");
    expect(out.endsWith("Merge")).toBe(false);
  });
});

describe("stripTrailingDanglingHeading", () => {
  it("removes restart heading and glued mid-line heading", () => {
    const raw =
      "## 第 1 步到底在做什么\n\n" +
      "GROOT 在看演示。\n\n".repeat(3) +
      "│ 预测动作 vs 真实动作 (数据里记录的) ## 第 1 步到底在做什么\n" +
      "## 第 1 步到底在做什么";
    const cleaned = stripTrailingDanglingHeading(raw);
    expect(cleaned).not.toMatch(/## 第 1 步到底在做什么$/);
    expect(cleaned).toContain("预测动作 vs 真实动作 (数据里记录的)");
    expect(cleaned).not.toContain("记录的) ##");
  });
});

describe("mergeAssistantContinuation", () => {
  it("appends remainder onto truncated prior", () => {
    const prev =
      "说明如下。\n\n### 部署\n用 API 接控制器 (`getting";
    const next = "_started.md`)。完成。";
    expect(mergeAssistantContinuation(prev, next)).toBe(prev + next);
  });

  it("glues markdown table row continuations", () => {
    const prev =
      "| size | path |\n| --- | --- |\n| 101M | /a |\n| 106M | /llvm/bin/llvm-split";
    const next = " x4 |\n| 106M | /llvm/bin/llvm-dwp x4 |";
    const merged = mergeAssistantContinuation(prev, next);
    expect(merged).toContain("| 106M | /llvm/bin/llvm-split x4 |");
    expect(merged).toContain("| 106M | /llvm/bin/llvm-dwp x4 |");
    expect(merged).toContain("| size | path |");
  });

  it("appends body when model restarts heading after a cut-off", () => {
    const prev =
      "## 内部流程\n\n" +
      "说明一段足够长的正文用来过长度门槛。\n".repeat(3) +
      "存到 /tmp/stand_alone_inference/traj_1.jpeg 、";
    const next =
      "## 内部流程\n\n以及 traj_2.jpeg。评估结束。";
    const merged = mergeAssistantContinuation(prev, next);
    expect(merged).toContain("traj_1.jpeg");
    expect(merged).toContain("traj_2.jpeg");
    expect(merged).toContain("评估结束");
  });

  it("replaces instead of duplicating when next is authoritative full text", () => {
    const prev =
      "主模型齐了。\n\n".repeat(4) + "总量估计大约 **1.";
    const next =
      "主模型齐了。\n\n".repeat(4) +
      "总量估计大约 **1.5–2 小时**，剩余分片会陆续到齐。";
    const merged = mergeAssistantContinuation(prev, next);
    expect(merged).toBe(next);
    const first = "主模型齐了。\n\n".repeat(4);
    expect(merged.split(first).length - 1).toBe(1);
  });

  it("prefers cleaned final with period over longer streamed preview", () => {
    const body =
      "说明如下。\n\n".repeat(8) +
      "对生成速度略有影响但不致命。";
    const streamed = `\n\n${body.slice(0, -1)}`;
    expect(streamed.length).toBeGreaterThan(body.length);
    const merged = mergeAssistantContinuation(streamed, body);
    expect(merged.endsWith("。")).toBe(true);
    expect(merged.trimStart()).toBe(body);
  });
});
