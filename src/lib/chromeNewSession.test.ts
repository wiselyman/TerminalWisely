import { describe, expect, it } from "vitest";
import { chromeNewAction } from "./chromeNewSession";

describe("chromeNewAction", () => {
  it("opens the add flow for the sidebar that is showing", () => {
    expect(chromeNewAction("hosts")).toBe("ssh");
    expect(chromeNewAction("k8s")).toBe("cluster");
    expect(chromeNewAction("db")).toBe("database");
  });
});
