import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("./api", () => ({
  ensureSidecar: vi.fn(async () => ({
    base_url: "http://127.0.0.1:9",
    token: "t",
    pid: 1,
  })),
  startRuntimeLogin: vi.fn(),
  getRuntimeLoginStatus: vi.fn(),
  cancelRuntimeLogin: vi.fn(async () => ({
    kind: "cursor",
    phase: "cancelled",
    url: "",
    detail: "",
  })),
  probeRuntime: vi.fn(),
}));

vi.mock("./openExternalUrl", () => ({
  openExternalUrl: vi.fn(async () => undefined),
}));

import {
  cancelRuntimeLogin,
  getRuntimeLoginStatus,
  probeRuntime,
  startRuntimeLogin,
} from "./api";
import { openExternalUrl } from "./openExternalUrl";
import {
  guidedLoginErrorDetail,
  runGuidedRuntimeLogin,
} from "./guidedRuntimeLogin";

describe("runGuidedRuntimeLogin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("opens browser URL and returns when probe is ready", async () => {
    vi.mocked(startRuntimeLogin).mockResolvedValue({
      kind: "cursor",
      phase: "waiting_browser",
      url: "https://cursor.com/loginDeepControl?x=1",
      detail: "waiting_browser",
    });
    vi.mocked(probeRuntime)
      .mockResolvedValueOnce({
        kind: "cursor",
        installed: true,
        authenticated: false,
        detail: "login_needed",
        fake: false,
        code: "login_needed",
      })
      .mockResolvedValueOnce({
        kind: "cursor",
        installed: true,
        authenticated: true,
        detail: "ready",
        fake: false,
        code: "ready",
      });
    vi.mocked(getRuntimeLoginStatus).mockResolvedValue({
      kind: "cursor",
      phase: "waiting_browser",
      url: "https://cursor.com/loginDeepControl?x=1",
      detail: "waiting_browser",
    });

    const probe = await runGuidedRuntimeLogin("cursor", { timeoutMs: 5_000 });
    expect(openExternalUrl).toHaveBeenCalledWith(
      "https://cursor.com/loginDeepControl?x=1",
    );
    expect(probe.code).toBe("ready");
    expect(cancelRuntimeLogin).toHaveBeenCalled();
  });

  it("does not open the browser when the sidecar already did", async () => {
    vi.mocked(startRuntimeLogin).mockResolvedValue({
      kind: "cursor",
      phase: "waiting_browser",
      url: "https://cursor.com/loginDeepControl?x=1",
      detail: "waiting_browser",
      open_browser: false,
    });
    vi.mocked(probeRuntime).mockResolvedValue({
      kind: "cursor",
      installed: true,
      authenticated: true,
      detail: "ready",
      fake: false,
      code: "ready",
    });
    await runGuidedRuntimeLogin("cursor", { timeoutMs: 5_000 });
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it("maps a timed-out login to the friendly sentence", () => {
    expect(guidedLoginErrorDetail("nope", "登录失败，请重试。")).toBe(
      "登录失败，请重试。",
    );
    expect(
      guidedLoginErrorDetail(new Error("login_failed"), "登录失败，请重试。"),
    ).toBe("登录失败，请重试。");
  });

  it("succeeds immediately when already authenticated", async () => {
    vi.mocked(startRuntimeLogin).mockResolvedValue({
      kind: "cursor",
      phase: "succeeded",
      url: "",
      detail: "already_authenticated",
    });
    vi.mocked(probeRuntime).mockResolvedValue({
      kind: "cursor",
      installed: true,
      authenticated: true,
      detail: "ready",
      fake: false,
      code: "ready",
    });
    const probe = await runGuidedRuntimeLogin("cursor");
    expect(probe.authenticated).toBe(true);
    expect(openExternalUrl).not.toHaveBeenCalled();
  });
});
