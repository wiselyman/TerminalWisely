import { describe, expect, it } from "vitest";
import { enqueueHostExec, resetHostExecQueue } from "./hostExecQueue";

describe("host exec queue", () => {
  it("runs the same session one at a time", async () => {
    resetHostExecQueue();
    const order: string[] = [];
    let releaseFirst: () => void = () => undefined;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const first = enqueueHostExec("sess", async () => {
      order.push("start-a");
      await firstGate;
      order.push("end-a");
      return "a";
    });
    const second = enqueueHostExec("sess", async () => {
      order.push("start-b");
      return "b";
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(order).toEqual(["start-a"]);
    releaseFirst();
    await expect(first).resolves.toBe("a");
    await expect(second).resolves.toBe("b");
    expect(order).toEqual(["start-a", "end-a", "start-b"]);
  });
});
