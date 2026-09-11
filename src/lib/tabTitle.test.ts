import { describe, expect, it } from "vitest";
import { uniqueTabTitle } from "./tabTitle";

describe("uniqueTabTitle", () => {
  it("keeps the first title bare", () => {
    expect(uniqueTabTitle("spark-remote", [])).toBe("spark-remote");
  });

  it("numbers the next tabs as (1), (2), …", () => {
    expect(
      uniqueTabTitle("spark-remote", [{ id: "a", title: "spark-remote" }]),
    ).toBe("spark-remote (1)");
    expect(
      uniqueTabTitle("spark-remote", [
        { id: "a", title: "spark-remote" },
        { id: "b", title: "spark-remote (1)" },
      ]),
    ).toBe("spark-remote (2)");
  });

  it("fills the lowest free index after bare", () => {
    expect(
      uniqueTabTitle("spark-remote", [
        { id: "a", title: "spark-remote" },
        { id: "b", title: "spark-remote (1)" },
        { id: "c", title: "spark-remote (3)" },
      ]),
    ).toBe("spark-remote (2)");
  });

  it("prefers bare when only numbered duplicates exist", () => {
    expect(
      uniqueTabTitle("spark-remote", [
        { id: "a", title: "spark-remote (1)" },
      ]),
    ).toBe("spark-remote");
  });
});
