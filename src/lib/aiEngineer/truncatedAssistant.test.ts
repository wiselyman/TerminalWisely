import { describe, expect, it } from "vitest";
import {
  looksTruncatedAssistant,
  mergeAssistantContinuation,
  stripTrailingDanglingHeading,
} from "./truncatedAssistant";

describe("looksTruncatedAssistant", () => {
  it("detects dangling paren + latin fragment", () => {
    const raw =
      "搞清楚了。给你说清楚装的是什么和怎么用。\n\n".repeat(2) +
      "### 部署到真机\n用 `Gr00tPolicy` API 接你的机器人控制器 (`getting";
    expect(looksTruncatedAssistant(raw)).toBe(true);
  });

  it("detects CJK mid-clause cut 然后进", () => {
    const raw =
      "当前是 plan 模式。\n\n".repeat(3) +
      "跑完把输出贴给我，我帮你辨别结果，然后进";
    expect(looksTruncatedAssistant(raw)).toBe(true);
    expect(
      looksTruncatedAssistant(
        "跑完把输出贴给我，我帮你辨别结果，然后进入下一步训练。",
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

  it("detects heading glued onto ASCII box line", () => {
    const raw =
      "## 第 1 步到底在做什么\n\n" +
      "GROOT 看演示。\n\n".repeat(3) +
      "┌────┐\n│ 预测动作 vs 真实动作 (数据里记录的) ## 第 1 步到底在做什么";
    expect(looksTruncatedAssistant(raw)).toBe(true);
  });

  it("rejects a finished short answer", () => {
    expect(looksTruncatedAssistant("这台机器是 Debian 12，内核正常。")).toBe(
      false,
    );
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
});
