import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { useAiEngineerStore } from "../../stores/aiEngineerStore";

/**
 * Contract: panel must not subscribe to `s.input` (keystroke isolation).
 * Draft updates go through the composer island + stable setComposerInput action.
 */
describe("composer input isolation", () => {
  it("setInput updates store without requiring panel subscription", () => {
    useAiEngineerStore.setState({ input: "", inputsByThread: {} });
    useAiEngineerStore.getState().setInput("hello");
    expect(useAiEngineerStore.getState().input).toBe("hello");
  });

  it("AiEngineerPanel does not select s.input (island owns keystrokes)", () => {
    const root = join(process.cwd(), "src/components/aiEngineer");
    const panel = readFileSync(join(root, "AiEngineerPanel.tsx"), "utf8");
    const island = readFileSync(
      join(root, "AiEngineerComposerInput.tsx"),
      "utf8",
    );
    expect(panel).not.toMatch(/useAiEngineerStore\(\(s\) => s\.input\)/);
    expect(panel).toContain("AiEngineerComposerTextarea");
    expect(panel).toContain("AiEngineerComposerSendButton");
    expect(panel).toContain("setComposerInput");
    expect(island).toMatch(/useAiEngineerStore\(\(s\) => s\.input\)/);
  });
});
