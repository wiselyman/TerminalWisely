import { describe, expect, it } from "vitest";
import { historyForNextTurn } from "./compareVoices";

describe("history for the next turn", () => {
  it("drops reference answers from the next turn", () => {
    const history = historyForNextTurn([
      { kind: "user", content: "why is nginx down" },
      { kind: "assistant", content: "port 80 closed", reference: true },
      { kind: "assistant", content: "config typo", reference: false },
      { kind: "tool", content: "ss -lntp" },
    ]);
    expect(history).toEqual([
      { role: "user", content: "why is nginx down" },
      { role: "assistant", content: "config typo" },
    ]);
  });
});
