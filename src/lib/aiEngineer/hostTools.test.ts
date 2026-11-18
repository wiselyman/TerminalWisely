import { describe, expect, it } from "vitest";
import {
  hostToolResultStdout,
  isHostExecutedTool,
} from "./hostTools";

describe("isHostExecutedTool", () => {
  it("keeps local and SSH terminal tools on the host", () => {
    expect(isHostExecutedTool("terminal_exec")).toBe(true);
    expect(isHostExecutedTool("ai_exec")).toBe(true);
  });

  it("does not treat web tools as host exec", () => {
    expect(isHostExecutedTool("web_search")).toBe(false);
    expect(isHostExecutedTool("web_fetch")).toBe(false);
  });
});

describe("hostToolResultStdout", () => {
  it("encodes catalog rows when the tool has no stdout", () => {
    const stdout = hostToolResultStdout({
      ok: true,
      columns: ["schema_name"],
      rows: [["public"]],
    });
    expect(JSON.parse(stdout)).toEqual({
      columns: ["schema_name"],
      rows: [["public"]],
    });
  });

  it("keeps an existing stdout string", () => {
    expect(hostToolResultStdout({ stdout: "hostname\n" })).toBe("hostname\n");
  });
});
