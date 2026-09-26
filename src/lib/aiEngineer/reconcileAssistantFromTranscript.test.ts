import { describe, expect, it } from "vitest";
import {
  lastAssistantTextFromTranscript,
  shouldReplaceAssistantWithTranscript,
} from "./reconcileAssistantFromTranscript";

describe("lastAssistantTextFromTranscript", () => {
  it("returns the last non-empty assistant content", () => {
    expect(
      lastAssistantTextFromTranscript([
        { role: "user", content: "q" },
        { role: "assistant", content: "" },
        { role: "assistant", content: "full answer。" },
      ]),
    ).toBe("full answer。");
  });

  it("ignores prior-turn assistants before the latest user message", () => {
    expect(
      lastAssistantTextFromTranscript([
        { role: "user", content: "list big files" },
        { role: "assistant", content: "## 大文件汇总\n| path | size |" },
        { role: "user", content: "显卡是哪家集成商" },
      ]),
    ).toBe("");
  });

  it("returns this-turn assistant after the latest user message", () => {
    expect(
      lastAssistantTextFromTranscript([
        { role: "user", content: "list big files" },
        { role: "assistant", content: "## 大文件汇总" },
        { role: "user", content: "显卡是哪家集成商" },
        { role: "assistant", content: "板卡厂商需查 lspci Subsystem" },
      ]),
    ).toBe("板卡厂商需查 lspci Subsystem");
  });
});

describe("shouldReplaceAssistantWithTranscript", () => {
  const full =
    "**还没修好。**\n\n刚验证的结果：\n" +
    "- 运行中 616 条规则里**依然没有** `sunpurecloud.com` 直连规则\n" +
    "- 直连出口：`74.52.22.71`（HK）\n" +
    "- 代理出口：`74.52.22.71`（HK）\n\n" +
    "Merge.yaml 文件本身没问题（在 `~/.local/share/io.github.clash-verge-rev.clash-verge-rev/profiles/Merge.yaml`，规则已写入），但运行中的 mihomo 没有加载它——之前换过主配置（9 月 20 日更新），Merge 没有重新合并进去。\n\n" +
    "**需要你在 Clash Verge GUI 里操作一下**：\n\n" +
    "1. 打开 Profiles\n2. 重新应用当前配置\n3. 然后刷新 NetBird dashboard\n\n" +
    "操作完告诉我，我再验证出口 IP 是否变了。";

  it("replaces a streamed prefix cut mid-path", () => {
    const ui = full.slice(0, 185);
    expect(ui.length).toBeLessThan(full.length);
    expect(
      shouldReplaceAssistantWithTranscript({
        uiContent: ui,
        transcriptContent: full,
      }),
    ).toBe(true);
  });

  it("does not replace when UI already matches", () => {
    expect(
      shouldReplaceAssistantWithTranscript({
        uiContent: full,
        transcriptContent: full,
      }),
    ).toBe(false);
  });

  it("replaces incomplete UI when transcript is finished", () => {
    expect(
      shouldReplaceAssistantWithTranscript({
        uiContent: "说明如下，还剩",
        transcriptContent: "说明如下，还剩两小时左右。",
      }),
    ).toBe(true);
  });

  it("does not fill an empty UI from a prior-turn transcript alone", () => {
    // Guard: shouldReplace would say yes for empty UI + long full — callers must
    // pass lastAssistantTextFromTranscript (this-turn only), which returns "".
    const prior = "## 大文件汇总\n| path | size |";
    expect(
      lastAssistantTextFromTranscript([
        { role: "user", content: "大文件" },
        { role: "assistant", content: prior },
        { role: "user", content: "显卡集成商?" },
      ]),
    ).toBe("");
  });
});
