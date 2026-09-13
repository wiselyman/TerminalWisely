import { beforeEach, describe, expect, it, vi } from "vitest";

const requestSudoPassword = vi.fn();
const isSudoRequiredError = vi.fn((message: string) =>
  message.includes("PREVIEW_SUDO_REQUIRED"),
);

vi.mock("../stores/sudoPromptStore", () => ({
  requestSudoPassword: (...args: unknown[]) => requestSudoPassword(...args),
  extractActionFromSudoError: () => "移动",
  extractPathFromSudoError: () => "/tmp/x",
  SUDO_CANCELLED: "SUDO_CANCELLED",
}));

vi.mock("../stores/previewStore", () => ({
  isSudoRequiredError: (message: string) => isSudoRequiredError(message),
}));

describe("invokeWithSudoRetry", () => {
  beforeEach(() => {
    requestSudoPassword.mockReset();
    requestSudoPassword.mockResolvedValue("secret");
  });

  it("reuses passwordRef across batch items without re-prompting", async () => {
    const { invokeWithSudoRetry } = await import("./invokeWithSudoRetry");
    const passwordRef: { current?: string } = {};
    const calls: Array<string | undefined> = [];

    for (const path of ["/a", "/b", "/c"]) {
      await invokeWithSudoRetry(
        async (sudoPassword) => {
          calls.push(sudoPassword);
          if (!sudoPassword) {
            throw new Error(`PREVIEW_SUDO_REQUIRED: 移动 \`${path}\``);
          }
          return path;
        },
        { action: "移动", path, passwordRef },
      );
    }

    expect(requestSudoPassword).toHaveBeenCalledTimes(1);
    expect(passwordRef.current).toBe("secret");
    // First item: undefined then secret; later items: secret only
    expect(calls).toEqual([undefined, "secret", "secret", "secret"]);
  });

  it("seeds from passwordRef.current on the first attempt", async () => {
    const { invokeWithSudoRetry } = await import("./invokeWithSudoRetry");
    const passwordRef = { current: "cached" };
    const seen: Array<string | undefined> = [];

    await invokeWithSudoRetry(async (sudoPassword) => {
      seen.push(sudoPassword);
      return "ok";
    }, { passwordRef });

    expect(requestSudoPassword).not.toHaveBeenCalled();
    expect(seen).toEqual(["cached"]);
  });
});
