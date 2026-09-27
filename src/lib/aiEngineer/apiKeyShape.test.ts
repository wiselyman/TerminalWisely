import { describe, expect, it } from "vitest";
import { apiKeyIsBaseUrl } from "./apiKeyShape";

describe("apiKeyIsBaseUrl", () => {
  it("flags a base URL pasted into the key field", () => {
    expect(apiKeyIsBaseUrl("https://api.deepseek.com", "https://api.deepseek.com")).toBe(
      true,
    );
    expect(apiKeyIsBaseUrl("https://api.deepseek.com/", "https://api.deepseek.com")).toBe(
      true,
    );
  });

  it("accepts a provider secret", () => {
    expect(apiKeyIsBaseUrl("sk-test-secret", "https://api.deepseek.com")).toBe(false);
  });
});
