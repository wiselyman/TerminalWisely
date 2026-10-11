import { describe, expect, it } from "vitest";
import {
  mergeUserMcpServer,
  parseUserMcpConfig,
  removeUserMcpServer,
  serializeUserMcpConfig,
} from "./userMcpConfig";

describe("userMcpConfig", () => {
  it("parses servers with env", () => {
    const parsed = parseUserMcpConfig(
      JSON.stringify({
        mcpServers: {
          demo: {
            command: "npx",
            args: ["-y", "x"],
            env: { TOKEN: "abc" },
          },
        },
      }),
    );
    expect(parsed).toEqual([
      {
        name: "demo",
        command: "npx",
        args: ["-y", "x"],
        env: { TOKEN: "abc" },
      },
    ]);
  });

  it("merges and removes without dropping siblings", () => {
    let text = serializeUserMcpConfig([
      { name: "a", command: "ocu", args: [] },
    ]);
    text = mergeUserMcpServer(text, {
      name: "b",
      command: "npx",
      args: ["-y", "x"],
      env: { K: "1" },
    });
    const two = parseUserMcpConfig(text);
    expect(two.map((s) => s.name).sort()).toEqual(["a", "b"]);
    text = removeUserMcpServer(text, "a");
    expect(parseUserMcpConfig(text).map((s) => s.name)).toEqual(["b"]);
  });

  it("drops empty command entries", () => {
    expect(
      parseUserMcpConfig(
        JSON.stringify({ mcpServers: { bad: { command: "  ", args: [] } } }),
      ),
    ).toEqual([]);
  });
});
