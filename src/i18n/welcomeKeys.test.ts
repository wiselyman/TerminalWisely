import { describe, expect, it } from "vitest";
import en from "./locales/en/welcome.json";
import zh from "./locales/zh-CN/welcome.json";

const CARD_AND_STEP_KEYS = [
  "feature.hosts.title",
  "feature.hosts.desc",
  "feature.kubernetes.title",
  "feature.kubernetes.desc",
  "feature.databases.title",
  "feature.databases.desc",
  "feature.ai.title",
  "feature.ai.desc",
  "feature.safety.title",
  "feature.safety.desc",
  "step.hosts.iconLabel",
  "step.hosts.text",
  "step.kubernetes.iconLabel",
  "step.kubernetes.text",
  "step.databases.iconLabel",
  "step.databases.text",
] as const;

describe("welcome copy uses flat keys", () => {
  it.each([
    ["en", en],
    ["zh-CN", zh],
  ])("%s card and step keys are sentences", (_locale, messages) => {
    const record = messages as Record<string, unknown>;
    for (const key of CARD_AND_STEP_KEYS) {
      expect(typeof record[key], key).toBe("string");
      expect((record[key] as string).trim().length, key).toBeGreaterThan(0);
    }
  });
});
