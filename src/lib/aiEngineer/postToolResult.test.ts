import { beforeEach, describe, expect, it, vi } from "vitest";
import { postToolResultWithRetry } from "./postToolResult";

vi.mock("./api", () => ({
  sidecarFetch: vi.fn(),
}));

import { sidecarFetch } from "./api";

const body = {
  session_id: "s1",
  run_id: "r1",
  call_id: "c1",
  ok: true,
  stdout: "hi",
  stderr: "",
  exit_code: 0,
  error: null,
};

describe("postToolResultWithRetry", () => {
  beforeEach(() => {
    vi.mocked(sidecarFetch).mockReset();
  });

  it("returns delivered on ok", async () => {
    vi.mocked(sidecarFetch).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => "",
    } as Response);
    await expect(
      postToolResultWithRetry({ base_url: "", token: "", pid: 0 }, body, {
        attempts: 1,
      }),
    ).resolves.toBe("delivered");
  });

  it("treats 409 as already settled", async () => {
    vi.mocked(sidecarFetch).mockResolvedValueOnce({
      ok: false,
      status: 409,
      text: async () => "no pending",
    } as Response);
    await expect(
      postToolResultWithRetry({ base_url: "", token: "", pid: 0 }, body, {
        attempts: 1,
      }),
    ).resolves.toBe("already_settled");
  });

  it("retries then throws on persistent failure", async () => {
    vi.mocked(sidecarFetch).mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "boom",
    } as Response);
    await expect(
      postToolResultWithRetry({ base_url: "", token: "", pid: 0 }, body, {
        attempts: 2,
        sleepMs: async () => undefined,
      }),
    ).rejects.toThrow(/tool_result HTTP 500/);
    expect(sidecarFetch).toHaveBeenCalledTimes(2);
  });
});
