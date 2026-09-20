import { describe, expect, it } from "vitest";
import { chineseFlagStarPaths, localeFlag, localeFlagId } from "./localeFlag";

describe("localeFlag", () => {
  it("maps supported locales to flat flag ids (not emoji)", () => {
    expect(localeFlagId("zh-CN")).toBe("cn");
    expect(localeFlagId("en")).toBe("us");
    expect(localeFlag("zh-CN")).toBe("cn");
    expect(localeFlag("en")).toBe("us");
  });

  it("Chinese mark is five-starred red flag (not Vietnam single star)", () => {
    const stars = chineseFlagStarPaths();
    expect(stars).toHaveLength(5);
  });
});
